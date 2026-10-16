import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { builderAPI } from '../../services/api';
import './MenuManager.css';

/**
 * Menu Manager — the single place menus are managed.
 *
 * Lists every menu the application has and wires each one to the page or form
 * it opens and the API it uses. This absorbed the former separate Menu Mapping
 * screen: two screens editing the same menus meant two places to look and two
 * chances to disagree.
 *
 * The menu dropdown lists every menu the application has, built-in ones
 * included: they live in AppMenus on the server rather than only in the React
 * bundle, which is what previously made them invisible here.
 *
 * Binding a page to a built-in menu overrides the screen that menu normally
 * opens. Clearing the binding restores it, so the override is never one-way.
 */

const SECTIONS = ['Main Menu', 'Application Settings'];
const ICONS = ['📄', '🗂️', '📊', '📈', '🧾', '🏷️', '🛠️', '🧮', '📌', '🗃️', '⭐', '🔍',
               '🏠', '📦', '📋', '🏭', '💰', '👥', '💼', '🕒', '🔀', '🧩', '⚙️', '🔗', '👤'];

const BLANK = { menuId: '', label: '', icon: '📄', section: 'Main Menu', sortOrder: 100, status: 'Active', target: '', apiKey: '' };

// A menu opens either one of the application's own screens or a custom page or
// form. Encoding which into the option value keeps it to a single dropdown.
const TARGET = {
  route: (path) => `route:${path}`,
  page: (id) => `page:${id}`,
  parse: (value) => {
    if (!value) return { pageId: null, targetPath: null };
    const [kind, ...rest] = value.split(':');
    const rem = rest.join(':');
    return kind === 'page'
      ? { pageId: Number(rem), targetPath: null }
      : { pageId: null, targetPath: rem };
  }
};

const MenuManager = () => {
  const [menus, setMenus] = useState([]);
  const [pages, setPages] = useState([]);
  const [apis, setApis] = useState([]);
  const [appPages, setAppPages] = useState([]);
  const [form, setForm] = useState(BLANK);
  const [mode, setMode] = useState('existing');   // 'existing' | 'new'
  const [filter, setFilter] = useState('all');
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);

  const flash = (type, text) => { setNotice({ type, text }); setTimeout(() => setNotice(null), 5000); };
  const errText = (e, f) => e?.response?.data?.message || e?.message || f;

  const load = useCallback(async () => {
    try {
      const [m, p, a, ap] = await Promise.all([
        builderAPI.menus(), builderAPI.pages(), builderAPI.apis(), builderAPI.appPages()
      ]);
      setMenus(m.data.data);
      setPages(p.data.data);
      setApis(a.data.data);
      setAppPages(ap.data.data);
    } catch (e) { flash('error', errText(e, 'Could not load menus')); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const selectedMenu = useMemo(
    () => menus.find(m => String(m.id) === String(form.menuId)) || null,
    [menus, form.menuId]
  );

  /** Choosing a menu loads everything currently mapped to it. */
  const pickMenu = (menuId) => {
    const menu = menus.find(m => String(m.id) === String(menuId));
    if (!menu) return setForm({ ...BLANK, menuId: '' });
    setForm({
      menuId,
      label: menu.label,
      icon: menu.icon || '📄',
      section: menu.section,
      sortOrder: menu.sortOrder,
      status: menu.status,
      target: menu.pageId ? TARGET.page(menu.pageId)
            : menu.targetPath ? TARGET.route(menu.targetPath) : '',
      apiKey: menu.apiKey || ''
    });
  };

  const startNew = () => { setMode('new'); setForm(BLANK); };
  const startExisting = () => { setMode('existing'); setForm(BLANK); };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.label.trim()) return flash('error', 'Give the menu a label');
    if (mode === 'existing' && !form.menuId) return flash('error', 'Choose a menu to map');

    setBusy(true);
    try {
      if (mode === 'existing') {
        const { pageId, targetPath } = TARGET.parse(form.target);
        await builderAPI.updateMenu(form.menuId, {
          label: form.label, icon: form.icon, section: form.section,
          sortOrder: Number(form.sortOrder), status: form.status,
          // null clears a binding; the API tells null apart from "unchanged".
          pageId, targetPath,
          apiKey: form.apiKey === '' ? null : form.apiKey
        });
        flash('success', 'Menu mapped — reload to see it in the sidebar');
      } else {
        const res = await builderAPI.createMenu({
          label: form.label, icon: form.icon, section: form.section,
          sortOrder: Number(form.sortOrder), status: form.status
        });
        // Drop straight into mapping the menu just created, so the second step
        // is obvious rather than something to go and find.
        flash('success', 'Menu created — now choose what it opens');
        setMode('existing');
        setForm(f => ({ ...f, menuId: String(res.data.data.id) }));
      }
      load();
    } catch (err) {
      flash('error', errText(err, 'Could not save the mapping'));
    } finally { setBusy(false); }
  };

  const clearBindings = async (menu) => {
    if (!window.confirm(`Unmap "${menu.label}"? The menu stays; its page and API bindings are cleared.`)) return;
    try {
      await builderAPI.updateMenu(menu.id, { pageId: null, targetPath: null, apiKey: null });
      flash('success', 'Bindings cleared');
      if (String(form.menuId) === String(menu.id)) pickMenu(menu.id);
      load();
    } catch (err) { flash('error', errText(err, 'Could not clear the bindings')); }
  };

  const removeMenu = async (menu) => {
    if (!window.confirm(`Delete the "${menu.label}" menu? The page itself is kept.`)) return;
    try {
      await builderAPI.deleteMenu(menu.id);
      flash('success', 'Menu removed');
      setForm(BLANK);
      load();
    } catch (err) { flash('error', errText(err, 'Could not remove the menu')); }
  };

  const visible = menus.filter(m =>
    filter === 'all' ? true :
    filter === 'mapped' ? !!m.pageId :
    filter === 'unmapped' ? !m.pageId :
    filter === 'builtin' ? m.isBuiltIn : !m.isBuiltIn
  );

  // Pages and forms share a store; the dropdown separates them so an author
  // can tell a data page from an input form at a glance.
  const byKind = {
    page: pages.filter(p => (p.kind || 'page') === 'page'),
    form: pages.filter(p => p.kind === 'form')
  };

  const apisByService = apis.reduce((acc, a) => {
    (acc[a.service] = acc[a.service] || []).push(a);
    return acc;
  }, {});

  return (
    <div className="menu-manager">
      <div className="menu-manager-header">
        <h2>Menu Manager</h2>
        <p>Every menu in the application. Map one to the page or form it opens and the API it uses — in one save.</p>
      </div>

      {notice && <div className={`mm-notice ${notice.type}`}>{notice.text}</div>}

      <form className="mm-form" onSubmit={submit}>
        <div className="mm-mode">
          <button type="button" className={`mm-tab ${mode === 'existing' ? 'active' : ''}`} onClick={startExisting}>
            Map an existing menu
          </button>
          <button type="button" className={`mm-tab ${mode === 'new' ? 'active' : ''}`} onClick={startNew}>
            Create a new menu
          </button>
        </div>

        {mode === 'new' && (
          <p className="mm-hint">
            Creates the menu only. Pick what it opens after saving — until then it stays out of the sidebar.
          </p>
        )}


        <div className="mm-grid">
          {mode === 'existing' && (
            <label className="mm-span2">Menu * <span className="mm-count">{menus.length} in this application</span>
              <select value={form.menuId} onChange={e => pickMenu(e.target.value)} required>
                <option value="">Select a menu…</option>
                {SECTIONS.map(sec => (
                  <optgroup key={sec} label={sec}>
                    {menus.filter(m => m.section === sec).map(m => (
                      <option key={m.id} value={m.id}>
                        {m.icon} {m.label}
                        {m.isBuiltIn ? '' : ' (custom)'}
                        {m.pageKey ? ` → ${m.pageKind === 'form' ? 'form' : 'page'} /p/${m.pageKey}` : ''}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
          )}

          <label>Menu label *
            <input value={form.label} required placeholder="Asset Report"
                   onChange={e => setForm({ ...form, label: e.target.value })} />
          </label>

          {/* What a menu opens and which API it uses are mapping concerns, so
              they appear only when mapping an existing menu. Creating one is
              just the menu itself. */}
          {mode === 'existing' && (
            <label>Opens
              <span className="mm-count">
                {appPages.length} app pages, {byKind.page.length} custom, {byKind.form.length} forms
              </span>
              <select value={form.target} onChange={e => setForm({ ...form, target: e.target.value })}>
                <option value="">None — nothing bound</option>
                <optgroup label="Application pages">
                  {appPages.map(a => (
                    <option key={a.path} value={TARGET.route(a.path)}>
                      {a.icon} {a.label} ({a.path})
                    </option>
                  ))}
                </optgroup>
                {[['page', 'Custom pages'], ['form', 'Forms']].map(([kind, label]) =>
                  byKind[kind].length ? (
                    <optgroup key={kind} label={label}>
                      {byKind[kind].map(p => (
                        <option key={p.id} value={TARGET.page(p.id)}>
                          {p.title} (/p/{p.pageKey}){p.status !== 'Active' ? ' — inactive' : ''}
                        </option>
                      ))}
                    </optgroup>
                  ) : null
                )}
              </select>
              {selectedMenu?.isBuiltIn && form.target && (
                <small className="mm-hint-inline">Overrides the built-in {selectedMenu.label} screen</small>
              )}
            </label>
          )}

          {mode === 'existing' && (
            <label>API
              <select value={form.apiKey} onChange={e => setForm({ ...form, apiKey: e.target.value })}>
                <option value="">None</option>
                {Object.entries(apisByService).map(([service, list]) => (
                  <optgroup key={service} label={service}>
                    {list.map(a => (
                      <option key={a.key} value={a.key}>{a.method} {a.path} — {a.label}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
          )}

          <label>Icon
            <select value={form.icon} onChange={e => setForm({ ...form, icon: e.target.value })}>
              {ICONS.map(i => <option key={i} value={i}>{i}</option>)}
            </select>
          </label>

          <label>Section
            <select value={form.section} onChange={e => setForm({ ...form, section: e.target.value })}>
              {SECTIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>

          <label>Sort order
            <input type="number" value={form.sortOrder}
                   onChange={e => setForm({ ...form, sortOrder: e.target.value })} />
            <small>Lower appears higher</small>
          </label>

          <label>Status
            <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
              <option value="Active">Active</option><option value="Inactive">Inactive</option>
            </select>
          </label>
        </div>

        <div className="mm-actions">
          <button type="submit" className="mm-btn primary" disabled={busy}>
            {busy ? 'Saving…' : mode === 'existing' ? 'Save mapping' : 'Create menu'}
          </button>
          <button type="button" className="mm-btn" onClick={() => setForm(BLANK)}>Clear form</button>
        </div>
      </form>

      <div className="mm-list">
        <div className="mm-list-head">
          <h3>All menus <span className="mm-count">{visible.length} shown</span></h3>
          <div className="mm-filters">
            {[['all', 'All'], ['mapped', 'Mapped'], ['unmapped', 'Unmapped'], ['builtin', 'Built-in'], ['custom', 'Custom']]
              .map(([k, l]) => (
                <button key={k} type="button" className={`mm-chip ${filter === k ? 'active' : ''}`}
                        onClick={() => setFilter(k)}>{l}</button>
              ))}
          </div>
        </div>

        <table className="mm-table">
          <thead>
            <tr>
              <th>Icon</th><th>Menu</th><th>Section</th><th>Type</th>
              <th>Opens</th><th>API</th><th>Order</th><th>Status</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {visible.map(m => (
              <tr key={m.id} className={m.status === 'Active' ? '' : 'muted'}>
                <td className="mm-icon">{m.icon}</td>
                <td>{m.label}</td>
                <td>{m.section}</td>
                <td><span className={`mm-type ${m.isBuiltIn ? 'builtin' : 'custom'}`}>
                  {m.isBuiltIn ? 'built-in' : 'custom'}</span></td>
                <td>
                  {m.path ? <code>{m.path}</code> : <span className="mm-none">not mapped</span>}
                  {m.pageKind && <span className={`mm-kind ${m.pageKind}`}>{m.pageKind}</span>}
                  {(m.pageId || m.targetPath) && m.isBuiltIn && <span className="mm-override">override</span>}
                  {m.pageId && m.pageStatus !== 'Active' && <span className="mm-warn-tag">page inactive</span>}
                </td>
                <td>{m.api ? <code title={m.api.label}>{m.api.method} {m.api.path}</code> : <span className="mm-none">—</span>}</td>
                <td>{m.sortOrder}</td>
                <td><span className={`mm-status ${m.status.toLowerCase()}`}>{m.status}</span></td>
                <td className="mm-row-actions">
                  <button className="mm-btn sm" onClick={() => { setMode('existing'); pickMenu(m.id); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Map</button>
                  {(m.pageId || m.targetPath || m.apiKey) && (
                    <button className="mm-btn sm" onClick={() => clearBindings(m)}>Unmap</button>
                  )}
                  {!m.isBuiltIn && (
                    <button className="mm-btn danger sm" onClick={() => removeMenu(m)}>Delete</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <p className="mm-hint">
          Built-in menus can be re-labelled, reordered, hidden or pointed at a custom page, but not deleted —
          their routes exist in the application either way. A menu shows in the sidebar only when it is Active.
        </p>
      </div>
    </div>
  );
};

export default MenuManager;
