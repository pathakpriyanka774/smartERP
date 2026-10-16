import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { builderAPI } from '../../services/api';
import PageRenderer, { renderWidget } from '../../pagebuilder/PageRenderer';
import {
  WIDGETS, WIDGET_GROUPS, CHART_TYPES, METRICS, ROW_PRESETS,
  createWidget, createRow, createColumn, emptyLayout
} from '../../pagebuilder/widgets';
import './PageBuilder.css';

/**
 * Drag-and-drop page builder.
 *
 * Drag is the browser's own HTML5 drag-and-drop rather than a library: it keeps
 * the dependency (and audit) surface small, and the interactions here are
 * simple enough not to need a virtualised drag layer.
 *
 * Two kinds of drag are distinguished by the payload's `kind`:
 *   - `new`  — a widget type dragged from the palette
 *   - `move` — an existing widget dragged between columns
 */

const slugify = (s) => s.toLowerCase().trim()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

const PageBuilder = () => {
  const [pages, setPages] = useState([]);
  const [sources, setSources] = useState([]);
  const [columnsBySource, setColumnsBySource] = useState({});

  const [meta, setMeta] = useState({ pageKey: '', title: '', description: '', status: 'Active' });
  const [layout, setLayout] = useState(emptyLayout());
  const [editingId, setEditingId] = useState(null);
  const [selected, setSelected] = useState(null);      // { rowId, colId, widgetId }
  const [dropTarget, setDropTarget] = useState(null);  // colId currently hovered
  const [preview, setPreview] = useState(false);
  const [notice, setNotice] = useState(null);
  const [saving, setSaving] = useState(false);
  const [charts, setCharts] = useState(null);           // Create Charts list, for the Saved chart widget
  const [forms, setForms] = useState(null);             // Form Builder list, for the Form widget

  const flash = (type, text) => { setNotice({ type, text }); setTimeout(() => setNotice(null), 4500); };
  const errText = (e, f) => e?.response?.data?.message || e?.message || f;

  const loadPages = useCallback(async () => {
    // Only pages here; forms are managed in Form Builder.
    try { setPages((await builderAPI.pages('page')).data.data); }
    catch (e) { flash('error', errText(e, 'Could not load pages')); }
  }, []);

  const loadCharts = useCallback(() => {
    builderAPI.charts()
      .then(r => setCharts(r.data.data))
      .catch(() => setCharts([]));
  }, []);

  const loadForms = useCallback(() => {
    builderAPI.pages('form')
      .then(r => setForms(r.data.data))
      .catch(() => setForms([]));
  }, []);

  useEffect(() => {
    loadPages();
    loadCharts();
    loadForms();
    builderAPI.dataSources()
      .then(r => setSources(r.data.data))
      .catch(e => flash('error', errText(e, 'Could not load data sources')));
  }, [loadPages, loadCharts, loadForms]);

  /** Column metadata is fetched once per source and cached for the inspector. */
  const ensureColumns = useCallback(async (source) => {
    if (!source || columnsBySource[source]) return;
    try {
      const r = await builderAPI.columns(source);
      setColumnsBySource(prev => ({ ...prev, [source]: [...r.data.data.main, ...r.data.data.custom] }));
    } catch (e) { flash('error', errText(e, 'Could not load columns')); }
  }, [columnsBySource]);

  // ---- layout mutation -----------------------------------------------------

  const updateLayout = (fn) => setLayout(prev => {
    const next = JSON.parse(JSON.stringify(prev));
    fn(next);
    return next;
  });

  const findWidget = (l, sel) => {
    if (!sel) return null;
    const row = l.rows.find(r => r.id === sel.rowId);
    const col = row?.columns.find(c => c.id === sel.colId);
    return col?.widgets.find(w => w.id === sel.widgetId) || null;
  };

  const selectedWidget = useMemo(() => findWidget(layout, selected), [layout, selected]);

  useEffect(() => {
    if (selectedWidget?.props?.source) ensureColumns(selectedWidget.props.source);
  }, [selectedWidget, ensureColumns]);

  const addRow = (widths) => updateLayout(l => { l.rows.push(createRow(widths)); });

  const removeRow = (rowId) => updateLayout(l => {
    l.rows = l.rows.filter(r => r.id !== rowId);
    if (!l.rows.length) l.rows.push(createRow([12]));
  });

  const addColumnTo = (rowId) => updateLayout(l => {
    const row = l.rows.find(r => r.id === rowId);
    if (!row || row.columns.length >= 4) return;
    row.columns.push(createColumn(12));
    // Re-balance so the row always spans exactly 12 units.
    const each = Math.floor(12 / row.columns.length);
    row.columns.forEach((c, i) => { c.width = i === 0 ? 12 - each * (row.columns.length - 1) : each; });
  });

  const removeColumn = (rowId, colId) => updateLayout(l => {
    const row = l.rows.find(r => r.id === rowId);
    if (!row || row.columns.length <= 1) return;
    row.columns = row.columns.filter(c => c.id !== colId);
    const each = Math.floor(12 / row.columns.length);
    row.columns.forEach((c, i) => { c.width = i === 0 ? 12 - each * (row.columns.length - 1) : each; });
  });

  const setColumnWidth = (rowId, colId, width) => updateLayout(l => {
    const col = l.rows.find(r => r.id === rowId)?.columns.find(c => c.id === colId);
    if (col) col.width = Number(width);
  });

  const removeWidget = (rowId, colId, widgetId) => {
    updateLayout(l => {
      const col = l.rows.find(r => r.id === rowId)?.columns.find(c => c.id === colId);
      if (col) col.widgets = col.widgets.filter(w => w.id !== widgetId);
    });
    setSelected(null);
  };

  const setProp = (key, value) => updateLayout(l => {
    const w = findWidget(l, selected);
    if (w) w.props[key] = value;
  });

  // ---- drag and drop -------------------------------------------------------

  const onPaletteDragStart = (e, type) => {
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('application/json', JSON.stringify({ kind: 'new', type }));
  };

  const onWidgetDragStart = (e, rowId, colId, widgetId) => {
    e.stopPropagation();
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/json', JSON.stringify({ kind: 'move', rowId, colId, widgetId }));
  };

  const onColumnDragOver = (e, colId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    if (dropTarget !== colId) setDropTarget(colId);
  };

  const onColumnDrop = (e, rowId, colId, index) => {
    e.preventDefault();
    e.stopPropagation();
    setDropTarget(null);

    let payload;
    try { payload = JSON.parse(e.dataTransfer.getData('application/json')); }
    catch { return; }                       // a drag from outside the builder
    if (!payload) return;

    if (payload.kind === 'new') {
      if (!WIDGETS[payload.type]) return;   // unknown type: ignore rather than crash
      const widget = createWidget(payload.type);
      updateLayout(l => {
        const col = l.rows.find(r => r.id === rowId)?.columns.find(c => c.id === colId);
        if (!col) return;
        col.widgets.splice(index ?? col.widgets.length, 0, widget);
      });
      setSelected({ rowId, colId, widgetId: widget.id });
      return;
    }

    if (payload.kind === 'move') {
      updateLayout(l => {
        const from = l.rows.find(r => r.id === payload.rowId)?.columns.find(c => c.id === payload.colId);
        const to = l.rows.find(r => r.id === rowId)?.columns.find(c => c.id === colId);
        if (!from || !to) return;
        const at = from.widgets.findIndex(w => w.id === payload.widgetId);
        if (at < 0) return;
        const [w] = from.widgets.splice(at, 1);
        // Removing from the same column shifts later indices down by one.
        let target = index ?? to.widgets.length;
        if (from === to && at < target) target -= 1;
        to.widgets.splice(target, 0, w);
      });
      setSelected({ rowId, colId, widgetId: payload.widgetId });
    }
  };

  // ---- persistence ---------------------------------------------------------

  const resetForm = () => {
    setMeta({ pageKey: '', title: '', description: '', status: 'Active' });
    setLayout(emptyLayout());
    setEditingId(null);
    setSelected(null);
  };

  const savePage = async (e) => {
    e.preventDefault();
    if (!meta.title.trim()) return flash('error', 'Give the page a title');
    const pageKey = meta.pageKey.trim() || slugify(meta.title);
    if (pageKey.length < 3) return flash('error', 'Page key must be at least 3 characters');

    setSaving(true);
    try {
      const body = { ...meta, pageKey, kind: 'page', layout };
      if (editingId) {
        await builderAPI.updatePage(editingId, body);
        flash('success', 'Page updated');
      } else {
        const res = await builderAPI.createPage(body);
        setEditingId(res.data.data.id);
        flash('success', `Page saved — open it at /p/${pageKey}`);
      }
      setMeta(m => ({ ...m, pageKey }));
      loadPages();
    } catch (err) {
      flash('error', errText(err, 'Could not save the page'));
    } finally {
      setSaving(false);
    }
  };

  const editPage = async (page) => {
    setMeta({ pageKey: page.pageKey, title: page.title, description: page.description || '', status: page.status });
    setLayout(page.layout?.rows?.length ? page.layout : emptyLayout());
    setEditingId(page.id);
    setSelected(null);
    setPreview(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const deletePage = async (page) => {
    if (!window.confirm(`Delete "${page.title}"? Any menu entry pointing at it is removed too.`)) return;
    try {
      await builderAPI.deletePage(page.id);
      flash('success', 'Page deleted');
      if (editingId === page.id) resetForm();
      loadPages();
    } catch (err) { flash('error', errText(err, 'Could not delete the page')); }
  };

  // ---- inspector -----------------------------------------------------------

  const sourceColumns = selectedWidget?.props?.source
    ? (columnsBySource[selectedWidget.props.source] || [])
    : [];
  const numericColumns = sourceColumns.filter(c => c.type === 'number');

  const SourcePicker = () => (
    <label>Data source
      <select value={selectedWidget.props.source || ''}
              onChange={e => { setProp('source', e.target.value); setProp('columns', []); setProp('groupBy', ''); ensureColumns(e.target.value); }}>
        <option value="">Select…</option>
        {sources.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
      </select>
    </label>
  );

  const renderInspector = () => {
    if (!selectedWidget) {
      return <p className="pb-hint">Select a widget on the canvas to edit it, or drag a new one from the left.</p>;
    }
    const { type, props } = selectedWidget;

    return (
      <>
        <div className="pb-inspector-head">
          <strong>{WIDGETS[type].label}</strong>
          <button className="pb-btn danger sm"
                  onClick={() => removeWidget(selected.rowId, selected.colId, selected.widgetId)}>
            Remove
          </button>
        </div>

        {type === 'heading' && (<>
          <label>Text<input value={props.text} onChange={e => setProp('text', e.target.value)} /></label>
          <label>Level
            <select value={props.level} onChange={e => setProp('level', e.target.value)}>
              <option value="h2">Large</option><option value="h3">Medium</option><option value="h4">Small</option>
            </select>
          </label>
        </>)}

        {type === 'text' && (
          <label>Content<textarea rows="4" value={props.content} onChange={e => setProp('content', e.target.value)} /></label>
        )}

        {type === 'stat' && (<>
          <label>Title<input value={props.title} onChange={e => setProp('title', e.target.value)} /></label>
          <SourcePicker />
          <label>Metric
            <select value={props.metric} onChange={e => setProp('metric', e.target.value)}>
              {METRICS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </label>
          {props.metric !== 'count' && (
            <label>Numeric column
              <select value={props.metricColumn || ''} onChange={e => setProp('metricColumn', e.target.value)}>
                <option value="">Select…</option>
                {numericColumns.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
              {numericColumns.length === 0 && <small className="pb-warn">This source has no numeric column</small>}
            </label>
          )}
          <label>Caption<input value={props.caption || ''} onChange={e => setProp('caption', e.target.value)} /></label>
        </>)}

        {type === 'table' && (<>
          <label>Title<input value={props.title} onChange={e => setProp('title', e.target.value)} /></label>
          <SourcePicker />
          {sourceColumns.length > 0 && (
            <fieldset className="pb-fieldset">
              <legend>Columns <small>(none ticked shows all main columns)</small></legend>
              {sourceColumns.map(c => (
                <label key={c.key} className="pb-check">
                  <input type="checkbox"
                         checked={(props.columns || []).includes(c.key)}
                         onChange={e => {
                           const set = new Set(props.columns || []);
                           e.target.checked ? set.add(c.key) : set.delete(c.key);
                           setProp('columns', [...set]);
                         }} />
                  {c.label}
                  <span className={`pb-tag ${c.custom ? 'custom' : 'main'}`}>{c.custom ? 'custom' : 'main'}</span>
                </label>
              ))}
            </fieldset>
          )}
          <label>Row limit
            <input type="number" min="1" max="500" value={props.limit}
                   onChange={e => setProp('limit', Math.min(500, Math.max(1, Number(e.target.value) || 1)))} />
          </label>
        </>)}

        {type === 'chart' && (<>
          <label>Title<input value={props.title} onChange={e => setProp('title', e.target.value)} /></label>
          <SourcePicker />
          <label>Chart type
            <select value={props.chart} onChange={e => setProp('chart', e.target.value)}>
              {CHART_TYPES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </label>
          <label>Group by
            <select value={props.groupBy || ''} onChange={e => setProp('groupBy', e.target.value)}>
              <option value="">Select…</option>
              {sourceColumns.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </label>
          <label>Metric
            <select value={props.metric} onChange={e => setProp('metric', e.target.value)}>
              {METRICS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </label>
          {props.metric !== 'count' && (
            <label>Numeric column
              <select value={props.metricColumn || ''} onChange={e => setProp('metricColumn', e.target.value)}>
                <option value="">Select…</option>
                {numericColumns.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
              {numericColumns.length === 0 && <small className="pb-warn">This source has no numeric column</small>}
            </label>
          )}
        </>)}

        {type === 'savedChart' && (<>
          <label>Chart
            <select value={props.chartId || ''}
                    onChange={e => setProp('chartId', e.target.value ? Number(e.target.value) : null)}>
              <option value="">Select a saved chart…</option>
              {(charts || []).map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
          </label>
          {charts && !charts.length && (
            <small className="pb-hint">No saved charts yet. Create one in Application Settings → Create Charts.</small>
          )}
          <button type="button" className="pb-btn sm" onClick={loadCharts}>Refresh list</button>
          <label>Title override
            <input value={props.title || ''} placeholder="Defaults to the chart's own title"
                   onChange={e => setProp('title', e.target.value)} />
          </label>
          <label className="pb-check">
            <input type="checkbox" checked={props.showDescription !== false}
                   onChange={e => setProp('showDescription', e.target.checked)} />
            Show the chart's description
          </label>
          <p className="pb-hint">
            The chart is shown by reference: edit it in Create Charts and every page using it updates.
            Viewers of this page can see it once the page is Active.
          </p>
        </>)}

        {type === 'form' && (<>
          <label>Form
            <select value={props.formKey || ''}
                    onChange={e => {
                      setProp('formKey', e.target.value);
                      // Choosing a form replaces any fields an older page defined inline.
                      setProp('fields', undefined);
                      setProp('submitLabel', undefined);
                    }}>
              <option value="">Select a form…</option>
              {(forms || []).map(f => (
                <option key={f.id} value={f.pageKey}>
                  {f.title}{f.status !== 'Active' ? ' (inactive)' : ''}
                </option>
              ))}
            </select>
          </label>
          {forms && !forms.length && (
            <small className="pb-hint">No forms yet. Create one in Application Settings → Form Builder.</small>
          )}
          {!props.formKey && props.fields && (
            <small className="pb-warn">
              This form's fields were defined on the page itself. Choose an existing form to replace them.
            </small>
          )}
          <button type="button" className="pb-btn sm" onClick={loadForms}>Refresh list</button>
          <label>Title override
            <input value={props.title || ''} placeholder="Defaults to the form's own title"
                   onChange={e => setProp('title', e.target.value)} />
          </label>
          <p className="pb-hint">
            Fields are edited in Form Builder; every page showing this form picks up the change.
          </p>
        </>)}
      </>
    );
  };

  // ---- render --------------------------------------------------------------

  return (
    <div className="page-builder">
      <div className="page-builder-header">
        <h2>Page Builder</h2>
        <p>Compose a page from live ERP data, then map it to a menu so it opens from the sidebar.</p>
      </div>

      {notice && <div className={`pb-notice ${notice.type}`}>{notice.text}</div>}

      <form className="pb-meta" onSubmit={savePage}>
        <div className="pb-meta-grid">
          <label>Page title *
            <input value={meta.title} required placeholder="Asset Report"
                   onChange={e => setMeta({ ...meta, title: e.target.value })} />
          </label>
          <label>Page key
            <input value={meta.pageKey} placeholder={slugify(meta.title) || 'asset-report'}
                   onChange={e => setMeta({ ...meta, pageKey: slugify(e.target.value) })} />
            <small>URL: /p/{meta.pageKey || slugify(meta.title) || '…'}</small>
          </label>
          <label>Status
            <select value={meta.status} onChange={e => setMeta({ ...meta, status: e.target.value })}>
              <option value="Active">Active</option><option value="Inactive">Inactive</option>
            </select>
          </label>
          <label className="wide">Description
            <input value={meta.description} placeholder="What this page is for"
                   onChange={e => setMeta({ ...meta, description: e.target.value })} />
          </label>
        </div>
        <div className="pb-meta-actions">
          <button type="submit" className="pb-btn primary" disabled={saving}>
            {saving ? 'Saving…' : editingId ? 'Update page' : 'Save page'}
          </button>
          <button type="button" className="pb-btn" onClick={() => setPreview(!preview)}>
            {preview ? 'Back to editing' : 'Preview'}
          </button>
          {editingId && <button type="button" className="pb-btn" onClick={resetForm}>New page</button>}
        </div>
      </form>

      {preview ? (
        <div className="pb-preview">
          <PageRenderer layout={layout} />
        </div>
      ) : (
        <div className="pb-workspace">
          <aside className="pb-palette">
            <h3>Widgets</h3>
            {WIDGET_GROUPS.map(group => (
              <div className="pb-palette-group" key={group}>
                <h4>{group}</h4>
                {Object.entries(WIDGETS).filter(([, w]) => w.group === group).map(([type, w]) => (
                  <div key={type} className="pb-palette-item" draggable
                       onDragStart={e => onPaletteDragStart(e, type)}>
                    <span className="pb-palette-icon">{w.icon}</span>{w.label}
                  </div>
                ))}
              </div>
            ))}
            <h3>Rows</h3>
            <div className="pb-row-presets">
              {ROW_PRESETS.map(p => (
                <button key={p.label} className="pb-btn sm" onClick={() => addRow(p.widths)}>{p.label}</button>
              ))}
            </div>
          </aside>

          <section className="pb-canvas">
            {layout.rows.map(row => (
              <div className="pb-canvas-row" key={row.id}>
                <div className="pb-row-bar">
                  <span>Row</span>
                  <button className="pb-btn sm" onClick={() => addColumnTo(row.id)}
                          disabled={row.columns.length >= 4}>+ Column</button>
                  <button className="pb-btn danger sm" onClick={() => removeRow(row.id)}>Remove row</button>
                </div>
                <div className="pb-row-cols">
                  {row.columns.map(col => (
                    <div key={col.id}
                         className={`pb-canvas-col ${dropTarget === col.id ? 'drop' : ''}`}
                         style={{ flex: `0 0 calc(${(col.width / 12) * 100}% - 8px)` }}
                         onDragOver={e => onColumnDragOver(e, col.id)}
                         onDragLeave={() => setDropTarget(null)}
                         onDrop={e => onColumnDrop(e, row.id, col.id)}>
                      <div className="pb-col-bar">
                        <select value={col.width} onChange={e => setColumnWidth(row.id, col.id, e.target.value)}>
                          {[3, 4, 6, 8, 9, 12].map(w => <option key={w} value={w}>{w}/12</option>)}
                        </select>
                        {row.columns.length > 1 && (
                          <button className="pb-btn danger sm" onClick={() => removeColumn(row.id, col.id)}>×</button>
                        )}
                      </div>

                      {col.widgets.length === 0 && <div className="pb-drop-hint">Drop a widget here</div>}

                      {col.widgets.map((w, i) => {
                        const isSel = selected?.widgetId === w.id;
                        return (
                          <div key={w.id}
                               className={`pb-canvas-widget ${isSel ? 'selected' : ''}`}
                               draggable
                               onDragStart={e => onWidgetDragStart(e, row.id, col.id, w.id)}
                               onDrop={e => onColumnDrop(e, row.id, col.id, i)}
                               onClick={e => { e.stopPropagation(); setSelected({ rowId: row.id, colId: col.id, widgetId: w.id }); }}>
                            <div className="pb-widget-chrome">
                              <span>{WIDGETS[w.type]?.icon} {WIDGETS[w.type]?.label}</span>
                              <button className="pb-btn danger sm"
                                      onClick={e => { e.stopPropagation(); removeWidget(row.id, col.id, w.id); }}>×</button>
                            </div>
                            {/* Live preview inside the canvas: the real renderer, not a mock. */}
                            <div className="pb-widget-live">{renderWidget(w)}</div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </section>

          <aside className="pb-inspector">
            <h3>Properties</h3>
            {renderInspector()}
          </aside>
        </div>
      )}

      <div className="pb-pages">
        <h3>Saved pages</h3>
        {pages.length === 0 ? (
          <p className="pb-hint">No pages yet. Build one above and save it.</p>
        ) : (
          <table className="pb-pages-table">
            <thead>
              <tr><th>Title</th><th>URL</th><th>Status</th><th>Menu</th><th>Created</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {pages.map(p => (
                <tr key={p.id}>
                  <td>{p.title}</td>
                  <td><code>/p/{p.pageKey}</code></td>
                  <td><span className={`pb-status ${p.status.toLowerCase()}`}>{p.status}</span></td>
                  <td>{p.menu ? p.menu.label : <span className="pb-hint">not mapped</span>}</td>
                  <td>{p.created}</td>
                  <td className="pb-actions">
                    <button className="pb-btn sm" onClick={() => editPage(p)}>Edit</button>
                    <button className="pb-btn danger sm" onClick={() => deletePage(p)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default PageBuilder;
