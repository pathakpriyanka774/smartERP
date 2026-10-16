const express = require('express');
const cors = require('cors');
const { getPool, isUniqueViolation, sql } = require('../../shared/database');
const { initService } = require('../../shared/db-service');
const { protectService, requirePermission, isAdmin } = require('../../shared/auth');
const { SERVICE_HOST } = require('../../shared/permissions');
const { getSource, resolveColumns, findColumn, listSources, canReadSource } = require('../../shared/data-sources');
const { BUILT_IN_MENUS, SECTIONS, APP_PAGES, isAppPath } = require('../../shared/app-menus');
const { API_CATALOG, findApi } = require('../../shared/api-catalog');

const app = express();
const PORT = 5012;

app.use(cors());
app.use(express.json({ limit: '2mb' }));   // page layouts are JSON documents

// Every route needs a valid token. Applied in the service itself, not only at
// the gateway, so a request sent straight to this port is refused too.
protectService(app);

// Authoring a page, a menu or a custom column is an administrative act.
// Reading pages and their data is not: a user permitted to see a custom page
// must be able to load the page and the rows it displays.
const canAuthor = requirePermission('page-builder');
// Form Builder saves forms as pages, and Menu Manager edits menus: each may
// write with its own permission (previously both needed page-builder, so a
// user granted only that screen got 403 on every save).
const canAuthorPages = requirePermission('page-builder', 'form-builder');
const canManageMenus = requirePermission('page-builder', 'menu-manager');
const canListPages = requirePermission('page-builder', 'form-builder', 'menu-manager');

const isAuthor = (user) => isAdmin(user) ||
  ['page-builder', 'form-builder', 'menu-manager'].some(p => (user?.permissions || []).includes(p));

/**
 * Resolve :key to a source the caller may read, or answer 404/403.
 * Every data route goes through this, so a page cannot show data its viewer
 * lacks the permission for.
 */
const readableSource = (req, res) => {
  const source = getSource(req.params.key);
  if (!source) { fail(res, 404, 'Unknown data source'); return null; }
  if (!canReadSource(req.user, source)) {
    fail(res, 403, `You do not have access to ${source.label}`);
    return null;
  }
  return source;
};

const { state, requireDB, health } = initService('Page Builder Service');

// Seeding needs the pool, so wait for it rather than racing the connection.
const seedWhenReady = (attempt = 0) => {
  if (state.connected) {
    return seedBuiltInMenus()
      .then(() => console.log(`   Seeded ${BUILT_IN_MENUS.length} built-in menus`))
      .catch(err => console.error('Could not seed built-in menus:', err.message));
  }
  if (attempt < 30) setTimeout(() => seedWhenReady(attempt + 1), 1000);
  else console.error('Gave up seeding built-in menus: database never connected');
};

const MAX_ROWS = 500;
const SLUG = /^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$/;
const COLUMN_KEY = /^[A-Za-z][A-Za-z0-9_]{0,49}$/;

const fail = (res, code, message) => res.status(code).json({ success: false, message });

// ---------------------------------------------------------------------------
// Data sources
// ---------------------------------------------------------------------------

app.get('/datasources', requireDB, (req, res) => {
  res.json({ success: true, data: listSources(req.user) });
});

/** Custom columns defined against a source, as plain objects. */
const loadCustomColumns = async (sourceKey) => {
  const r = await getPool().request()
    .input('SourceKey', sql.NVarChar(50), sourceKey)
    .query(`
      SELECT ColumnID, ColumnKey, Label, DataType, Options, SortOrder
      FROM CustomColumns WHERE SourceKey = @SourceKey ORDER BY SortOrder, ColumnID
    `);
  return r.recordset.map(c => ({
    id: c.ColumnID,
    key: c.ColumnKey,
    label: c.Label,
    type: c.DataType,
    options: c.Options ? JSON.parse(c.Options) : null,
    custom: true
  }));
};

// Main columns come from the registry; custom columns from the database. The
// UI shows both, flagged, so an author can tell system data from their own.
app.get('/datasources/:key/columns', requireDB, async (req, res) => {
  const source = readableSource(req, res);
  if (!source) return;
  try {
    res.json({
      success: true,
      data: {
        source: { key: req.params.key, label: source.label },
        main: source.columns.map(c => ({ ...c, custom: false })),
        custom: await loadCustomColumns(req.params.key)
      }
    });
  } catch (error) {
    console.error('Error loading columns:', error.message);
    fail(res, 500, 'Failed to load columns');
  }
});

app.post('/datasources/:key/columns', requireDB, canAuthor, async (req, res) => {
  const source = readableSource(req, res);
  if (!source) return;

  const { key, label, type, options } = req.body;
  if (!key || !label) return fail(res, 400, 'key and label are required');
  if (!COLUMN_KEY.test(key)) return fail(res, 400, 'key must start with a letter and contain only letters, digits or underscore');
  if (findColumn(source, key)) return fail(res, 400, `"${key}" is already a main column on this source`);

  const allowed = ['text', 'number', 'date', 'select', 'radio', 'checkbox'];
  const dataType = type || 'text';
  if (!allowed.includes(dataType)) return fail(res, 400, `type must be one of ${allowed.join(', ')}`);
  if (['select', 'radio'].includes(dataType) && (!Array.isArray(options) || !options.length)) {
    return fail(res, 400, `${dataType} requires a non-empty options array`);
  }

  try {
    const r = await getPool().request()
      .input('SourceKey', sql.NVarChar(50), req.params.key)
      .input('ColumnKey', sql.NVarChar(50), key)
      .input('Label', sql.NVarChar(100), label)
      .input('DataType', sql.NVarChar(20), dataType)
      .input('Options', sql.NVarChar(sql.MAX), options ? JSON.stringify(options) : null)
      .query(`
        INSERT INTO CustomColumns (SourceKey, ColumnKey, Label, DataType, Options)
        VALUES (@SourceKey, @ColumnKey, @Label, @DataType, @Options)
        RETURNING ColumnID AS id, ColumnKey AS key, Label AS label, DataType AS type
      `);
    res.json({ success: true, data: { ...r.recordset[0], custom: true } });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return fail(res, 409, 'A custom column with that key already exists on this source');
    }
    console.error('Error creating column:', error.message);
    fail(res, 500, 'Failed to create column');
  }
});

app.delete('/columns/:id', requireDB, canAuthor, async (req, res) => {
  const id = parseInt(req.params.id);
  if (!Number.isInteger(id)) return fail(res, 400, 'Invalid column id');
  try {
    // Values cascade with the column definition.
    const r = await getPool().request()
      .input('ColumnID', sql.Int, id)
      .query('DELETE FROM CustomColumns WHERE ColumnID = @ColumnID RETURNING ColumnID AS id');
    if (!r.recordset.length) return fail(res, 404, 'Column not found');
    res.json({ success: true, message: 'Column deleted' });
  } catch (error) {
    console.error('Error deleting column:', error.message);
    fail(res, 500, 'Failed to delete column');
  }
});

/**
 * Rows from a source, with custom column values merged in.
 *
 * Every identifier placed into the SQL text is resolved through the registry
 * or matched against a strict pattern first; user input only ever reaches the
 * query as a bound parameter.
 */
app.get('/datasources/:key/rows', requireDB, async (req, res) => {
  const source = readableSource(req, res);
  if (!source) return;

  const requested = req.query.columns ? String(req.query.columns).split(',') : null;
  const columns = resolveColumns(source, requested);
  if (!columns.length) return fail(res, 400, 'No valid columns requested');

  // Clamped to 1..MAX_ROWS: a negative LIMIT is a database error, not "no rows".
  const limit = Math.min(Math.max(parseInt(req.query.limit) || 50, 1), MAX_ROWS);
  const orderCol = req.query.orderBy ? findColumn(source, req.query.orderBy) : null;
  // NULLs sort first ascending and last descending, as they did on SQL Server.
  const orderDir = String(req.query.orderDir).toLowerCase() === 'desc' ? 'DESC NULLS LAST' : 'ASC NULLS FIRST';

  try {
    // Identifiers are unquoted: they come from the registry, never from the
    // request, and quoting would make them case-sensitive where the schema's
    // are not.
    const select = [source.key, ...columns.map(c => c.key)].join(', ');
    const orderBy = orderCol ? `${orderCol.key} ${orderDir}` : `${source.key} DESC`;

    const rows = await getPool().request()
      .input('Limit', sql.Int, limit)
      .query(`SELECT ${select} FROM ${source.from} ORDER BY ${orderBy} LIMIT @Limit`);

    const custom = await loadCustomColumns(req.params.key);
    const data = rows.recordset.map(r => ({ ...r, __id: r[source.key] }));

    if (custom.length && data.length) {
      const ids = data.map(r => r.__id);
      const valueReq = getPool().request()
        .input('SourceKey', sql.NVarChar(50), req.params.key);
      // Bind each id rather than joining them into the text.
      ids.forEach((id, i) => valueReq.input(`id${i}`, sql.Int, id));
      const values = await valueReq.query(`
        SELECT v.ColumnID, v.RecordID, v.Value
        FROM CustomColumnValues v
        JOIN CustomColumns c ON c.ColumnID = v.ColumnID
        WHERE c.SourceKey = @SourceKey
          AND v.RecordID IN (${ids.map((_, i) => `@id${i}`).join(', ')})
      `);
      const byColumn = new Map(custom.map(c => [c.id, c.key]));
      const lookup = new Map();
      values.recordset.forEach(v => lookup.set(`${v.RecordID}:${byColumn.get(v.ColumnID)}`, v.Value));
      data.forEach(row => custom.forEach(c => {
        row[c.key] = lookup.get(`${row.__id}:${c.key}`) ?? null;
      }));
    } else {
      data.forEach(row => custom.forEach(c => { row[c.key] = null; }));
    }

    res.json({
      success: true,
      data: {
        columns: [...columns.map(c => ({ ...c, custom: false })), ...custom],
        rows: data,
        idKey: '__id'
      }
    });
  } catch (error) {
    console.error('Error loading rows:', error.message);
    fail(res, 500, 'Failed to load rows');
  }
});

/** Set a custom column value on one record. */
app.put('/datasources/:key/rows/:recordId/custom', requireDB, async (req, res) => {
  const source = readableSource(req, res);
  if (!source) return;
  const recordId = parseInt(req.params.recordId);
  if (!Number.isInteger(recordId)) return fail(res, 400, 'Invalid record id');

  const { columnKey, value } = req.body;
  if (!columnKey) return fail(res, 400, 'columnKey is required');

  try {
    const custom = await loadCustomColumns(req.params.key);
    const column = custom.find(c => c.key === columnKey);
    if (!column) return fail(res, 404, 'Unknown custom column for this source');

    await getPool().request()
      .input('ColumnID', sql.Int, column.id)
      .input('RecordID', sql.Int, recordId)
      .input('Value', sql.NVarChar(sql.MAX), value === undefined || value === null ? null : String(value))
      .query(`
        INSERT INTO CustomColumnValues (ColumnID, RecordID, Value)
        VALUES (@ColumnID, @RecordID, @Value)
        ON CONFLICT (ColumnID, RecordID)
        DO UPDATE SET Value = EXCLUDED.Value, UpdatedAt = LOCALTIMESTAMP
      `);
    res.json({ success: true });
  } catch (error) {
    console.error('Error saving custom value:', error.message);
    fail(res, 500, 'Failed to save value');
  }
});

/** Grouped aggregate, for chart widgets. */
app.get('/datasources/:key/aggregate', requireDB, async (req, res) => {
  const source = readableSource(req, res);
  if (!source) return;

  const groupBy = findColumn(source, req.query.groupBy);
  if (!groupBy) return fail(res, 400, 'groupBy must be a column on this source');

  const metric = ['count', 'sum', 'avg'].includes(req.query.metric) ? req.query.metric : 'count';
  let expression = 'COUNT(*)';
  if (metric !== 'count') {
    const metricCol = findColumn(source, req.query.metricColumn);
    if (!metricCol) return fail(res, 400, 'metricColumn must be a column on this source');
    // Summing text would either error or coerce silently; refuse instead.
    if (metricCol.type !== 'number') return fail(res, 400, `${metricCol.label} is not numeric`);
    expression = `${metric === 'sum' ? 'SUM' : 'AVG'}(CAST(${metricCol.key} AS DECIMAL(18,2)))`;
  }

  try {
    const r = await getPool().request().query(`
      SELECT CAST(${groupBy.key} AS VARCHAR(100)) AS label,
             ${expression} AS value
      FROM ${source.from}
      WHERE ${groupBy.key} IS NOT NULL
      GROUP BY ${groupBy.key}
      ORDER BY value DESC NULLS LAST
      LIMIT 50
    `);
    res.json({ success: true, data: r.recordset.map(x => ({ label: x.label, value: Number(x.value) })) });
  } catch (error) {
    console.error('Error aggregating:', error.message);
    fail(res, 500, 'Failed to aggregate');
  }
});

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

const KINDS = ['page', 'form'];

const pageRow = (r) => ({
  id: r.PageID,
  pageKey: r.PageKey,
  kind: r.Kind || 'page',
  title: r.Title,
  description: r.Description,
  layout: JSON.parse(r.Layout),
  status: r.Status
});

app.get('/pages', requireDB, canListPages, async (req, res) => {
  try {
    const kind = KINDS.includes(req.query.kind) ? req.query.kind : null;
    const r = await getPool().request()
      .input('Kind', sql.NVarChar(10), kind)
      .query(`
        SELECT p.PageID, p.PageKey, p.Kind, p.Title, p.Description, p.Layout, p.Status,
               to_char(p.CreatedAt, 'YYYY-MM-DD') AS created,
               m.MenuID AS MappingID, m.Label AS menuLabel
        FROM CustomPages p
        LEFT JOIN AppMenus m ON m.PageID = p.PageID
        WHERE (@Kind IS NULL OR p.Kind = @Kind)
        ORDER BY p.Kind, p.Title
      `);
    res.json({
      success: true,
      data: r.recordset.map(x => ({
        ...pageRow(x),
        created: x.created,
        menu: x.MappingID ? { id: x.MappingID, label: x.menuLabel } : null
      }))
    });
  } catch (error) {
    console.error('Error listing pages:', error.message);
    fail(res, 500, 'Failed to list pages');
  }
});

app.get('/pages/:pageKey', requireDB, async (req, res) => {
  try {
    const r = await getPool().request()
      .input('PageKey', sql.NVarChar(60), req.params.pageKey)
      .query('SELECT PageID, PageKey, Kind, Title, Description, Layout, Status FROM CustomPages WHERE PageKey = @PageKey');
    // An inactive page is a draft: only authors see it, everyone else gets the
    // same 404 as for a page that does not exist.
    if (!r.recordset.length || (r.recordset[0].Status !== 'Active' && !isAuthor(req.user))) {
      return fail(res, 404, 'Page not found');
    }
    res.json({ success: true, data: pageRow(r.recordset[0]) });
  } catch (error) {
    console.error('Error loading page:', error.message);
    fail(res, 500, 'Failed to load page');
  }
});

const validatePage = ({ pageKey, title, layout, kind }) => {
  if (kind && !KINDS.includes(kind)) return `kind must be one of ${KINDS.join(', ')}`;
  if (!pageKey || !SLUG.test(pageKey)) {
    return 'pageKey must be lowercase letters, digits and hyphens (3-60 chars)';
  }
  if (!title || !title.trim()) return 'title is required';
  if (!layout || !Array.isArray(layout.rows)) return 'layout must contain a rows array';
  return null;
};

app.post('/pages', requireDB, canAuthorPages, async (req, res) => {
  const error = validatePage(req.body);
  if (error) return fail(res, 400, error);
  try {
    const r = await getPool().request()
      .input('PageKey', sql.NVarChar(60), req.body.pageKey)
      .input('Kind', sql.NVarChar(10), req.body.kind || 'page')
      .input('Title', sql.NVarChar(150), req.body.title.trim())
      .input('Description', sql.NVarChar(500), req.body.description || null)
      .input('Layout', sql.NVarChar(sql.MAX), JSON.stringify(req.body.layout))
      .input('Status', sql.NVarChar(20), req.body.status === 'Inactive' ? 'Inactive' : 'Active')
      .query(`
        INSERT INTO CustomPages (PageKey, Kind, Title, Description, Layout, Status)
        VALUES (@PageKey, @Kind, @Title, @Description, @Layout, @Status)
        RETURNING PageID, PageKey, Kind, Title, Description, Layout, Status
      `);
    res.json({ success: true, data: pageRow(r.recordset[0]) });
  } catch (err) {
    if (isUniqueViolation(err)) return fail(res, 409, 'That page key is already in use');
    console.error('Error creating page:', err.message);
    fail(res, 500, 'Failed to create page');
  }
});

app.put('/pages/:id', requireDB, canAuthorPages, async (req, res) => {
  const id = parseInt(req.params.id);
  if (!Number.isInteger(id)) return fail(res, 400, 'Invalid page id');
  const error = validatePage(req.body);
  if (error) return fail(res, 400, error);
  try {
    const r = await getPool().request()
      .input('PageID', sql.Int, id)
      .input('PageKey', sql.NVarChar(60), req.body.pageKey)
      .input('Kind', sql.NVarChar(10), req.body.kind || null)
      .input('Title', sql.NVarChar(150), req.body.title.trim())
      .input('Description', sql.NVarChar(500), req.body.description || null)
      .input('Layout', sql.NVarChar(sql.MAX), JSON.stringify(req.body.layout))
      .input('Status', sql.NVarChar(20), req.body.status === 'Inactive' ? 'Inactive' : 'Active')
      .query(`
        UPDATE CustomPages
        SET PageKey = @PageKey, Kind = COALESCE(@Kind, Kind), Title = @Title,
            Description = @Description, Layout = @Layout, Status = @Status,
            UpdatedAt = LOCALTIMESTAMP
        WHERE PageID = @PageID
        RETURNING PageID, PageKey, Kind, Title, Description, Layout, Status
      `);
    if (!r.recordset.length) return fail(res, 404, 'Page not found');
    res.json({ success: true, data: pageRow(r.recordset[0]) });
  } catch (err) {
    if (isUniqueViolation(err)) return fail(res, 409, 'That page key is already in use');
    console.error('Error updating page:', err.message);
    fail(res, 500, 'Failed to update page');
  }
});

app.delete('/pages/:id', requireDB, canAuthorPages, async (req, res) => {
  const id = parseInt(req.params.id);
  if (!Number.isInteger(id)) return fail(res, 400, 'Invalid page id');
  try {
    // A custom menu exists only to open its page, so it goes with it. Built-in
    // menus are kept and simply unbound — the FK's ON DELETE SET NULL restores
    // them to their own route rather than leaving a dead link.
    await getPool().request().input('PageID', sql.Int, id)
      .query('DELETE FROM AppMenus WHERE PageID = @PageID AND IsBuiltIn = FALSE');
    const r = await getPool().request().input('PageID', sql.Int, id)
      .query('DELETE FROM CustomPages WHERE PageID = @PageID RETURNING PageID AS id');
    if (!r.recordset.length) return fail(res, 404, 'Page not found');
    res.json({ success: true, message: 'Page deleted' });
  } catch (error) {
    console.error('Error deleting page:', error.message);
    fail(res, 500, 'Failed to delete page');
  }
});

// ---------------------------------------------------------------------------
// Menus
// ---------------------------------------------------------------------------

/**
 * Make sure every built-in menu exists as a row.
 *
 * Idempotent, and deliberately does not overwrite Label/Icon/Section/SortOrder:
 * those are editable in Menu Mapping, and re-seeding on every restart would
 * throw away the user's edits. Only the route is kept in step with the code.
 */
const seedBuiltInMenus = async () => {
  for (const m of BUILT_IN_MENUS) {
    await getPool().request()
      .input('MenuKey', sql.NVarChar(60), m.key)
      .input('Label', sql.NVarChar(80), m.label)
      .input('Icon', sql.NVarChar(10), m.icon)
      .input('Section', sql.NVarChar(50), m.section)
      .input('Path', sql.NVarChar(120), m.path)
      .input('SortOrder', sql.Int, m.order)
      .query(`
        INSERT INTO AppMenus (MenuKey, Label, Icon, Section, Path, SortOrder, IsBuiltIn)
        VALUES (@MenuKey, @Label, @Icon, @Section, @Path, @SortOrder, TRUE)
        ON CONFLICT (MenuKey) DO UPDATE SET Path = EXCLUDED.Path, IsBuiltIn = TRUE
      `);
  }

  // Drop built-ins that no longer exist in the catalogue. Without this, a
  // screen removed from the application leaves its row behind and the sidebar
  // keeps rendering a link to a route that no longer resolves.
  const keys = BUILT_IN_MENUS.map(m => m.key);
  const req = getPool().request();
  keys.forEach((k, i) => req.input(`k${i}`, sql.NVarChar(60), k));
  const removed = await req.query(`
    DELETE FROM AppMenus
    WHERE IsBuiltIn = TRUE AND MenuKey NOT IN (${keys.map((_, i) => `@k${i}`).join(', ')})
    RETURNING MenuKey
  `);
  if (removed.recordset.length) {
    console.log(`   Pruned ${removed.recordset.length} retired built-in menu(s): ` +
                removed.recordset.map(r => r.MenuKey).join(', '));
  }
};

const menuRow = (m) => ({
  id: m.MenuID,
  menuKey: m.MenuKey,
  label: m.Label,
  icon: m.Icon,
  section: m.Section,
  sortOrder: m.SortOrder,
  isBuiltIn: !!m.IsBuiltIn,
  status: m.MenuStatus,
  path: m.EffectivePath,
  pageId: m.PageID,
  pageKey: m.PageKey,
  pageTitle: m.PageTitle,
  pageKind: m.PageKind,
  pageStatus: m.PageStatus,
  targetPath: m.TargetPath,
  apiKey: m.ApiKey,
  api: m.ApiKey ? findApi(m.ApiKey) : null
});

/** The whole menu catalogue — what the Menu Mapping dropdown is built from. */
app.get('/menus', requireDB, async (req, res) => {
  try {
    const r = await getPool().request().query(`
      SELECT * FROM vw_CustomPageMenus
      ORDER BY CASE WHEN Section = 'Main Menu' THEN 0 ELSE 1 END, SortOrder, Label
    `);
    res.json({ success: true, data: r.recordset.map(menuRow) });
  } catch (error) {
    console.error('Error listing menus:', error.message);
    fail(res, 500, 'Failed to list menus');
  }
});

/** The application's own screens, for the "what does this menu open" picker. */
app.get('/app-pages', requireDB, (req, res) => {
  res.json({ success: true, data: APP_PAGES });
});

/** Endpoints a menu or page can be bound to. */
app.get('/apis', requireDB, (req, res) => {
  res.json({ success: true, data: API_CATALOG });
});

app.post('/menus', requireDB, canManageMenus, async (req, res) => {
  const { label, icon, section, sortOrder, status } = req.body;
  if (!label || !label.trim()) return fail(res, 400, 'label is required');
  if (section && !SECTIONS.includes(section)) return fail(res, 400, `section must be one of ${SECTIONS.join(', ')}`);

  // Creating a menu is deliberately just the menu. What it opens and which API
  // it uses are set afterwards by mapping it — a new menu with nothing bound
  // simply stays out of the sidebar until then.
  const menuKey = label.trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  if (menuKey.length < 2) return fail(res, 400, 'label must contain letters or digits');

  try {
    const r = await getPool().request()
      .input('MenuKey', sql.NVarChar(60), menuKey)
      .input('Label', sql.NVarChar(80), label.trim())
      .input('Icon', sql.NVarChar(10), icon || '📄')
      .input('Section', sql.NVarChar(50), section || 'Main Menu')
      .input('SortOrder', sql.Int, parseInt(sortOrder) || 100)
      .input('Status', sql.NVarChar(20), status === 'Inactive' ? 'Inactive' : 'Active')
      .query(`
        INSERT INTO AppMenus (MenuKey, Label, Icon, Section, Path, SortOrder, IsBuiltIn, Status)
        VALUES (@MenuKey, @Label, @Icon, @Section, NULL, @SortOrder, FALSE, @Status)
        RETURNING MenuID AS id, Label AS label
      `);
    res.json({ success: true, data: r.recordset[0] });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return fail(res, 409, 'A menu with that name already exists — pick a different label');
    }
    console.error('Error creating menu:', err.message);
    fail(res, 500, 'Failed to create menu');
  }
});

/**
 * Update a menu, including its page and API bindings — this is the "map
 * everything at once" save. Built-in menus can be re-labelled and bound to a
 * page, but their own route is left alone so the underlying screen stays
 * reachable if the binding is removed.
 */
app.put('/menus/:id', requireDB, canManageMenus, async (req, res) => {
  const id = parseInt(req.params.id);
  if (!Number.isInteger(id)) return fail(res, 400, 'Invalid menu id');

  const { label, icon, section, sortOrder, status, pageId, apiKey, targetPath } = req.body;
  if (section && !SECTIONS.includes(section)) return fail(res, 400, `section must be one of ${SECTIONS.join(', ')}`);
  if (apiKey && !findApi(apiKey)) return fail(res, 400, 'Unknown API');
  // Only routes the application actually ships may be bound, so a crafted
  // request cannot point a menu at an arbitrary URL.
  if (targetPath && !isAppPath(targetPath)) return fail(res, 400, 'Unknown application page');

  // undefined leaves a binding alone; null or '' clears it.
  const clearPage = pageId === null || pageId === '';
  const clearApi = apiKey === null || apiKey === '';
  const clearTarget = targetPath === null || targetPath === '';
  // A menu opens one thing: choosing a custom page drops any screen binding
  // and vice versa.
  const settingPage = !!pageId && !clearPage;
  const settingTarget = !!targetPath && !clearTarget;

  try {
    let newPath = null;
    if (pageId && !clearPage) {
      const pg = await getPool().request().input('PageID', sql.Int, parseInt(pageId))
        .query('SELECT PageKey FROM CustomPages WHERE PageID = @PageID');
      if (!pg.recordset.length) return fail(res, 400, 'That page does not exist');
      newPath = `/p/${pg.recordset[0].PageKey}`;
    }
    const r = await getPool().request()
      .input('MenuID', sql.Int, id)
      .input('Label', sql.NVarChar(80), label ?? null)
      .input('Icon', sql.NVarChar(10), icon ?? null)
      .input('Section', sql.NVarChar(50), section ?? null)
      .input('SortOrder', sql.Int, sortOrder === undefined ? null : parseInt(sortOrder))
      .input('Status', sql.NVarChar(20), status ?? null)
      .input('PageID', sql.Int, clearPage ? null : (pageId === undefined ? null : parseInt(pageId)))
      .input('ClearPage', sql.Bit, clearPage ? 1 : 0)
      .input('ApiKey', sql.NVarChar(80), clearApi ? null : (apiKey ?? null))
      .input('ClearApi', sql.Bit, clearApi ? 1 : 0)
      .input('NewPath', sql.NVarChar(120), newPath)
      .input('TargetPath', sql.NVarChar(120), settingTarget ? targetPath : null)
      .input('ClearTarget', sql.Bit, (clearTarget || settingPage) ? 1 : 0)
      .query(`
        UPDATE AppMenus SET
          Label     = COALESCE(@Label, Label),
          Icon      = COALESCE(@Icon, Icon),
          Section   = COALESCE(@Section, Section),
          SortOrder = COALESCE(@SortOrder, SortOrder),
          Status    = COALESCE(@Status, Status),
          PageID    = CASE WHEN @ClearPage OR @TargetPath IS NOT NULL
                           THEN NULL ELSE COALESCE(@PageID, PageID) END,
          TargetPath = CASE WHEN @ClearTarget THEN NULL
                            ELSE COALESCE(@TargetPath, TargetPath) END,
          ApiKey    = CASE WHEN @ClearApi THEN NULL ELSE COALESCE(@ApiKey, ApiKey) END,
          -- A custom menu takes its route from the page it is mapped to;
          -- unmapping one leaves it with nothing to open, which is honest.
          -- A built-in always keeps its own route.
          Path      = CASE WHEN IsBuiltIn THEN Path
                           WHEN @ClearPage THEN NULL
                           ELSE COALESCE(@NewPath, Path) END,
          UpdatedAt = LOCALTIMESTAMP
        WHERE MenuID = @MenuID
        RETURNING MenuID AS id
      `);
    if (!r.recordset.length) return fail(res, 404, 'Menu not found');
    res.json({ success: true, data: r.recordset[0] });
  } catch (error) {
    console.error('Error updating menu:', error.message);
    fail(res, 500, 'Failed to update menu');
  }
});

app.delete('/menus/:id', requireDB, canManageMenus, async (req, res) => {
  const id = parseInt(req.params.id);
  if (!Number.isInteger(id)) return fail(res, 400, 'Invalid menu id');
  try {
    const m = await getPool().request().input('MenuID', sql.Int, id)
      .query('SELECT IsBuiltIn FROM AppMenus WHERE MenuID = @MenuID');
    if (!m.recordset.length) return fail(res, 404, 'Menu not found');
    // Deleting a built-in would only make it reappear at the next restart, and
    // its route would still work — deactivating is the honest operation.
    if (m.recordset[0].IsBuiltIn) {
      return fail(res, 400, 'Built-in menus cannot be deleted — set the status to Inactive to hide it');
    }
    await getPool().request().input('MenuID', sql.Int, id)
      .query('DELETE FROM AppMenus WHERE MenuID = @MenuID');
    res.json({ success: true, message: 'Menu removed' });
  } catch (error) {
    console.error('Error deleting menu:', error.message);
    fail(res, 500, 'Failed to remove menu');
  }
});

/** What the sidebar renders: active menus, with page bindings applied. */
app.get('/navigation', requireDB, async (req, res) => {
  try {
    const r = await getPool().request().query(`
      SELECT MenuKey, Label, Icon, Section, SortOrder, EffectivePath, IsBuiltIn, PageID, PageStatus, TargetPath
      FROM vw_CustomPageMenus
      WHERE MenuStatus = 'Active'
        -- A custom menu needs something to open: an active custom page, or one
        -- of the application's own screens. With neither it is still being set
        -- up, and a sidebar link that goes nowhere is worse than no link.
        AND (IsBuiltIn
             OR (PageID IS NOT NULL AND PageStatus = 'Active')
             OR TargetPath IS NOT NULL)
      ORDER BY CASE WHEN Section = 'Main Menu' THEN 0 ELSE 1 END, SortOrder, Label
    `);
    // The sidebar is built from this, so it must contain only menus the caller
    // is permitted to open. Filtering here rather than in the browser means a
    // user cannot reveal a menu by editing client state.
    const held = new Set(req.user?.permissions || []);
    const visible = r.recordset.filter(m => isAdmin(req.user) || held.has(m.MenuKey));

    res.json({
      success: true,
      data: visible.map(m => ({
        menuKey: m.MenuKey,
        label: m.Label,
        icon: m.Icon || '📄',
        section: m.Section,
        path: m.EffectivePath,
        order: m.SortOrder,
        isBuiltIn: !!m.IsBuiltIn
      }))
    });
  } catch (error) {
    console.error('Error loading navigation:', error.message);
    fail(res, 500, 'Failed to load navigation');
  }
});

// ---------------------------------------------------------------------------
// Charts (Application Settings → Create Charts)
// ---------------------------------------------------------------------------

// Writing a chart needs the module's own permission. Listing and opening one
// also serves page authors, who pick charts for the "Saved chart" widget.
const canChart = requirePermission('chart-builder');
const canPickChart = requirePermission('chart-builder', 'page-builder');

/**
 * Pages whose layout contains a "Saved chart" widget showing this chart.
 * Matched inside the JSON rather than by a link table, so a page and the
 * charts it shows can never disagree.
 */
const CHART_ON_PAGE = `jsonb_path_exists(
  p.Layout::jsonb,
  '$.rows[*].columns[*].widgets[*] ? (@.type == "savedChart" && @.props.chartId == $id)',
  jsonb_build_object('id', c.ChartID))`;

const CHART_TYPES = ['bar', 'hbar', 'stacked', 'line', 'area', 'pie', 'donut'];
const PIE_TYPES = ['pie', 'donut'];
const HEX = /^#[0-9a-fA-F]{6}$/;
const MAX_LABELS = 50;
const MAX_SERIES = 8;
const MAX_TEXT = 60;

const cleanText = (v, max = MAX_TEXT) => String(v ?? '').trim().slice(0, max);

/**
 * Validate and normalise a chart definition, returning { definition } or
 * { error }. Only known keys are kept, so the stored JSON can never carry
 * anything the renderer does not understand — or anything a page should not.
 */
const normaliseChart = (body) => {
  const { title, description, type, labels, series, sliceColors, colorBy, options = {} } = body || {};

  if (!title || !String(title).trim()) return { error: 'title is required' };
  if (!CHART_TYPES.includes(type)) return { error: `type must be one of ${CHART_TYPES.join(', ')}` };
  if (!Array.isArray(labels) || !labels.length) return { error: 'labels must be a non-empty array' };
  if (labels.length > MAX_LABELS) return { error: `at most ${MAX_LABELS} labels` };
  if (!Array.isArray(series) || !series.length) return { error: 'series must be a non-empty array' };

  const isPie = PIE_TYPES.includes(type);
  // A pie or donut shows one set of values; extra series would be silently
  // ignored by the renderer, so refuse them instead.
  if (isPie && series.length > 1) return { error: `${type} charts take exactly one series` };
  if (series.length > MAX_SERIES) return { error: `at most ${MAX_SERIES} series` };
  // Colours never repeat, so anything coloured per category is capped at the
  // palette size: past eight slices a pie stops being readable anyway.
  if (isPie && labels.length > MAX_SERIES) {
    return { error: `${type} charts take at most ${MAX_SERIES} slices — use a bar chart for more` };
  }
  if (colorBy === 'category' && !isPie && labels.length > MAX_SERIES) {
    return { error: `colouring each bar separately allows at most ${MAX_SERIES} bars` };
  }

  const cleanSeries = [];
  for (const [i, s] of series.entries()) {
    if (!Array.isArray(s?.values) || s.values.length !== labels.length) {
      return { error: `series ${i + 1} needs exactly one value per label (${labels.length})` };
    }
    const values = s.values.map(v => (v === '' || v === null || v === undefined ? null : Number(v)));
    if (values.some(v => v !== null && !Number.isFinite(v))) {
      return { error: `series ${i + 1} contains a value that is not a number` };
    }
    // Negative slices and stacked segments have no meaningful geometry.
    if ((isPie || type === 'stacked') && values.some(v => v !== null && v < 0)) {
      return { error: `${type} charts cannot show negative values` };
    }
    if (s.color && !HEX.test(s.color)) return { error: `series ${i + 1} colour must be #RRGGBB` };
    cleanSeries.push({ name: cleanText(s.name) || `Series ${i + 1}`, color: s.color || null, values });
  }

  if (sliceColors !== undefined && sliceColors !== null) {
    if (!Array.isArray(sliceColors) || sliceColors.some(c => c && !HEX.test(c))) {
      return { error: 'sliceColors must be #RRGGBB colours' };
    }
  }

  return {
    definition: {
      title: cleanText(title, 150),
      description: cleanText(description, 500) || null,
      type,
      labels: labels.map(l => cleanText(l)),
      series: cleanSeries,
      // Per-category colours: always for pie/donut, and for a single-series
      // bar chart when the author opts to colour each bar.
      colorBy: colorBy === 'category' ? 'category' : 'series',
      sliceColors: Array.isArray(sliceColors) ? sliceColors.slice(0, labels.length).map(c => c || null) : [],
      // No legend switch: a chart with two or more series (and every pie)
      // always gets one, so identity never rests on colour alone.
      options: {
        showValues: !!options.showValues,
        xTitle: cleanText(options.xTitle) || null,
        yTitle: cleanText(options.yTitle) || null,
        valuePrefix: cleanText(options.valuePrefix, 5) || null,
        valueSuffix: cleanText(options.valueSuffix, 10) || null
      }
    }
  };
};

const chartRow = (r) => ({
  ...JSON.parse(r.Definition),
  id: r.ChartID,
  title: r.Title,
  description: r.Description,
  type: r.ChartType,
  updated: r.updated,
  ...(r.usedOn !== undefined ? { usedOn: r.usedOn } : {})
});

const CHART_COLUMNS = `ChartID, Title, Description, ChartType, Definition,
                       to_char(UpdatedAt, 'YYYY-MM-DD') AS updated`;

app.get('/charts', requireDB, canPickChart, async (req, res) => {
  try {
    // usedOn lists the pages showing each chart, so an author can see what an
    // edit or a delete will affect before making it.
    const r = await getPool().request().query(`
      SELECT ${CHART_COLUMNS},
             (SELECT COALESCE(json_agg(p.Title ORDER BY p.Title), '[]'::json)
                FROM CustomPages p WHERE ${CHART_ON_PAGE}) AS usedOn
      FROM SavedCharts c
      ORDER BY UpdatedAt DESC, ChartID DESC`);
    res.json({ success: true, data: r.recordset.map(chartRow) });
  } catch (error) {
    console.error('Error listing charts:', error.message);
    fail(res, 500, 'Failed to list charts');
  }
});

app.get('/charts/:id', requireDB, canPickChart, async (req, res) => {
  const id = parseInt(req.params.id);
  if (!Number.isInteger(id)) return fail(res, 400, 'Invalid chart id');
  try {
    const r = await getPool().request().input('ChartID', sql.Int, id)
      .query(`SELECT ${CHART_COLUMNS} FROM SavedCharts WHERE ChartID = @ChartID`);
    if (!r.recordset.length) return fail(res, 404, 'Chart not found');
    res.json({ success: true, data: chartRow(r.recordset[0]) });
  } catch (error) {
    console.error('Error loading chart:', error.message);
    fail(res, 500, 'Failed to load chart');
  }
});

/**
 * A chart as shown inside a published page.
 *
 * Page viewers hold the page's menu permission, not chart-builder, so they
 * cannot use the routes above. They may read a chart only while it is placed
 * on an active page — a chart nobody has published stays private to authors.
 */
app.get('/charts/:id/embed', requireDB, async (req, res) => {
  const id = parseInt(req.params.id);
  if (!Number.isInteger(id)) return fail(res, 400, 'Invalid chart id');
  const held = new Set(req.user?.permissions || []);
  const author = isAdmin(req.user) || held.has('chart-builder') || held.has('page-builder');
  try {
    const r = await getPool().request()
      .input('ChartID', sql.Int, id)
      .input('Author', sql.Bit, author)
      .query(`
        SELECT ${CHART_COLUMNS}
        FROM SavedCharts c
        WHERE c.ChartID = @ChartID
          AND (@Author OR EXISTS (
                SELECT 1 FROM CustomPages p
                WHERE p.Status = 'Active' AND ${CHART_ON_PAGE}))
      `);
    // Not found and not published look the same, so the endpoint does not
    // reveal which chart ids exist.
    if (!r.recordset.length) return fail(res, 404, 'Chart not found');
    res.json({ success: true, data: chartRow(r.recordset[0]) });
  } catch (error) {
    console.error('Error loading embedded chart:', error.message);
    fail(res, 500, 'Failed to load chart');
  }
});

app.post('/charts', requireDB, canChart, async (req, res) => {
  const { definition, error } = normaliseChart(req.body);
  if (error) return fail(res, 400, error);
  try {
    const r = await getPool().request()
      .input('Title', sql.NVarChar(150), definition.title)
      .input('Description', sql.NVarChar(500), definition.description)
      .input('ChartType', sql.NVarChar(20), definition.type)
      .input('Definition', sql.NVarChar(sql.MAX), JSON.stringify(definition))
      .input('CreatedBy', sql.Int, req.user?.id || null)
      .query(`
        -- CreatedBy only when the account still exists: a token outlives a
        -- deleted user by up to 24h, and that must not make saving fail.
        INSERT INTO SavedCharts (Title, Description, ChartType, Definition, CreatedBy)
        VALUES (@Title, @Description, @ChartType, @Definition,
                (SELECT UserID FROM Users WHERE UserID = @CreatedBy))
        RETURNING ${CHART_COLUMNS}
      `);
    res.json({ success: true, data: chartRow(r.recordset[0]) });
  } catch (err) {
    console.error('Error creating chart:', err.message);
    fail(res, 500, 'Failed to create chart');
  }
});

app.put('/charts/:id', requireDB, canChart, async (req, res) => {
  const id = parseInt(req.params.id);
  if (!Number.isInteger(id)) return fail(res, 400, 'Invalid chart id');
  const { definition, error } = normaliseChart(req.body);
  if (error) return fail(res, 400, error);
  try {
    const r = await getPool().request()
      .input('ChartID', sql.Int, id)
      .input('Title', sql.NVarChar(150), definition.title)
      .input('Description', sql.NVarChar(500), definition.description)
      .input('ChartType', sql.NVarChar(20), definition.type)
      .input('Definition', sql.NVarChar(sql.MAX), JSON.stringify(definition))
      .query(`
        UPDATE SavedCharts
        SET Title = @Title, Description = @Description, ChartType = @ChartType,
            Definition = @Definition, UpdatedAt = LOCALTIMESTAMP
        WHERE ChartID = @ChartID
        RETURNING ${CHART_COLUMNS}
      `);
    if (!r.recordset.length) return fail(res, 404, 'Chart not found');
    res.json({ success: true, data: chartRow(r.recordset[0]) });
  } catch (err) {
    console.error('Error updating chart:', err.message);
    fail(res, 500, 'Failed to update chart');
  }
});

app.delete('/charts/:id', requireDB, canChart, async (req, res) => {
  const id = parseInt(req.params.id);
  if (!Number.isInteger(id)) return fail(res, 400, 'Invalid chart id');
  try {
    // A chart still placed on pages is only deleted when the caller confirms:
    // those pages would otherwise show an empty widget without warning.
    if (req.query.force !== 'true') {
      const used = await getPool().request().input('ChartID', sql.Int, id)
        .query(`SELECT p.Title FROM SavedCharts c JOIN CustomPages p ON ${CHART_ON_PAGE}
                WHERE c.ChartID = @ChartID ORDER BY p.Title`);
      if (used.recordset.length) {
        return res.status(409).json({
          success: false,
          message: 'This chart is used on pages',
          pages: used.recordset.map(p => p.Title)
        });
      }
    }
    const r = await getPool().request().input('ChartID', sql.Int, id)
      .query('DELETE FROM SavedCharts WHERE ChartID = @ChartID RETURNING ChartID AS id');
    if (!r.recordset.length) return fail(res, 404, 'Chart not found');
    res.json({ success: true, message: 'Chart deleted' });
  } catch (error) {
    console.error('Error deleting chart:', error.message);
    fail(res, 500, 'Failed to delete chart');
  }
});

app.get('/health', health);

app.listen(PORT, SERVICE_HOST, () => {
  console.log(`🧩 Page Builder Service running on http://localhost:${PORT}`);
  seedWhenReady();
});
