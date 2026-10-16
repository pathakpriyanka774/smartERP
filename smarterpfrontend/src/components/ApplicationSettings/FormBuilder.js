import React, { useState, useEffect, useCallback } from 'react';
import { builderAPI } from '../../services/api';
import { FIELD_TYPES, newId } from '../../pagebuilder/widgets';
import PageRenderer from '../../pagebuilder/PageRenderer';
import './FormBuilder.css';

/**
 * Form Builder.
 *
 * A form is stored as a page whose content is a single form widget, so it
 * shares the layout store, the renderer and the menu machinery with pages —
 * one engine, not two. Saved forms therefore appear in Menu Mapping alongside
 * pages and can be opened at /p/<key> like anything else.
 */

const slugify = (s) => s.toLowerCase().trim()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

const blankField = () => ({
  id: newId('f'), label: 'New field', name: 'new_field',
  type: 'text', required: false, placeholder: '', options: []
});

/** Wrap the form widget in the same row/column shape a page uses. */
const toLayout = (meta, fields) => ({
  rows: [{
    id: 'r1',
    columns: [{
      id: 'c1', width: 12,
      widgets: [{
        id: 'w1', type: 'form',
        props: { title: meta.title, submitLabel: meta.submitLabel || 'Submit', fields }
      }]
    }]
  }]
});

/** Pull the fields back out of a saved layout. */
const fromLayout = (layout) => {
  const widget = layout?.rows?.[0]?.columns?.[0]?.widgets?.find(w => w.type === 'form');
  return {
    fields: widget?.props?.fields || [],
    submitLabel: widget?.props?.submitLabel || 'Submit'
  };
};

const FormBuilder = () => {
  const [forms, setForms] = useState([]);
  const [meta, setMeta] = useState({ pageKey: '', title: '', description: '', submitLabel: 'Submit', status: 'Active' });
  const [fields, setFields] = useState([blankField()]);
  const [editingId, setEditingId] = useState(null);
  const [preview, setPreview] = useState(false);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);

  const flash = (type, text) => { setNotice({ type, text }); setTimeout(() => setNotice(null), 5000); };
  const errText = (e, f) => e?.response?.data?.message || e?.message || f;

  const load = useCallback(async () => {
    try { setForms((await builderAPI.pages('form')).data.data); }
    catch (e) { flash('error', errText(e, 'Could not load forms')); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const reset = () => {
    setMeta({ pageKey: '', title: '', description: '', submitLabel: 'Submit', status: 'Active' });
    setFields([blankField()]);
    setEditingId(null);
    setPreview(false);
  };

  const setField = (index, patch) => setFields(prev => {
    const next = [...prev];
    next[index] = { ...next[index], ...patch };
    return next;
  });

  const moveField = (index, delta) => setFields(prev => {
    const target = index + delta;
    if (target < 0 || target >= prev.length) return prev;
    const next = [...prev];
    [next[index], next[target]] = [next[target], next[index]];
    return next;
  });

  const submit = async (e) => {
    e.preventDefault();
    if (!meta.title.trim()) return flash('error', 'Give the form a name');
    if (!fields.length) return flash('error', 'A form needs at least one field');

    const bad = fields.find(f => ['select', 'radio'].includes(f.type) && !(f.options || []).length);
    if (bad) return flash('error', `"${bad.label}" is a ${bad.type} and needs at least one option`);

    const pageKey = meta.pageKey.trim() || slugify(meta.title);
    if (pageKey.length < 3) return flash('error', 'Form key must be at least 3 characters');

    setBusy(true);
    try {
      const body = {
        pageKey, kind: 'form', title: meta.title.trim(),
        description: meta.description, status: meta.status,
        layout: toLayout(meta, fields)
      };
      if (editingId) {
        await builderAPI.updatePage(editingId, body);
        flash('success', 'Form updated');
      } else {
        const res = await builderAPI.createPage(body);
        setEditingId(res.data.data.id);
        flash('success', `Form saved — open it at /p/${pageKey}, or map it to a menu`);
      }
      setMeta(m => ({ ...m, pageKey }));
      load();
    } catch (err) {
      flash('error', errText(err, 'Could not save the form'));
    } finally { setBusy(false); }
  };

  const edit = (form) => {
    const { fields: f, submitLabel } = fromLayout(form.layout);
    setMeta({
      pageKey: form.pageKey, title: form.title, description: form.description || '',
      submitLabel, status: form.status
    });
    setFields(f.length ? f : [blankField()]);
    setEditingId(form.id);
    setPreview(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const remove = async (form) => {
    if (!window.confirm(`Delete "${form.title}"? Any menu pointing at it is removed too.`)) return;
    try {
      await builderAPI.deletePage(form.id);
      flash('success', 'Form deleted');
      if (editingId === form.id) reset();
      load();
    } catch (err) { flash('error', errText(err, 'Could not delete the form')); }
  };

  return (
    <div className="form-builder">
      <div className="form-builder-header">
        <h2>Form Builder</h2>
        <p>Build a form once, then map it to a menu so people can open it from the sidebar.</p>
      </div>

      {notice && <div className={`fb-notice ${notice.type}`}>{notice.text}</div>}

      <form className="fb-editor" onSubmit={submit}>
        <h3>{editingId ? 'Edit form' : 'Create a form'}</h3>

        <div className="fb-grid">
          <label>Form name *
            <input value={meta.title} required placeholder="Customer Registration"
                   onChange={e => setMeta({ ...meta, title: e.target.value })} />
          </label>
          <label>Form key
            <input value={meta.pageKey} placeholder={slugify(meta.title) || 'customer-registration'}
                   onChange={e => setMeta({ ...meta, pageKey: slugify(e.target.value) })} />
            <small>URL: /p/{meta.pageKey || slugify(meta.title) || '…'}</small>
          </label>
          <label>Submit button
            <input value={meta.submitLabel}
                   onChange={e => setMeta({ ...meta, submitLabel: e.target.value })} />
          </label>
          <label>Status
            <select value={meta.status} onChange={e => setMeta({ ...meta, status: e.target.value })}>
              <option value="Active">Active</option><option value="Inactive">Inactive</option>
            </select>
          </label>
          <label className="fb-span2">Description
            <input value={meta.description} placeholder="What this form is for"
                   onChange={e => setMeta({ ...meta, description: e.target.value })} />
          </label>
        </div>

        <div className="fb-fields">
          <div className="fb-fields-head">
            <h4>Fields <span className="fb-count">{fields.length}</span></h4>
            <button type="button" className="fb-btn sm" onClick={() => setFields([...fields, blankField()])}>
              + Add field
            </button>
          </div>

          {fields.map((f, i) => (
            <div className="fb-field" key={f.id}>
              <div className="fb-field-main">
                <input className="fb-field-label" placeholder="Field label" value={f.label}
                       onChange={e => setField(i, { label: e.target.value, name: slugify(e.target.value) || f.name })} />
                <select value={f.type} onChange={e => setField(i, { type: e.target.value })}>
                  {FIELD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                <label className="fb-req">
                  <input type="checkbox" checked={!!f.required}
                         onChange={e => setField(i, { required: e.target.checked })} /> Required
                </label>
                <div className="fb-field-tools">
                  <button type="button" className="fb-btn sm" disabled={i === 0}
                          onClick={() => moveField(i, -1)} title="Move up">↑</button>
                  <button type="button" className="fb-btn sm" disabled={i === fields.length - 1}
                          onClick={() => moveField(i, 1)} title="Move down">↓</button>
                  <button type="button" className="fb-btn danger sm"
                          onClick={() => setFields(fields.filter(x => x.id !== f.id))}>×</button>
                </div>
              </div>

              <div className="fb-field-extra">
                {['select', 'radio'].includes(f.type) ? (
                  <input placeholder="Options, comma separated (e.g. Small, Medium, Large)"
                         value={(f.options || []).join(', ')}
                         onChange={e => setField(i, {
                           options: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                         })} />
                ) : (
                  <input placeholder="Placeholder (optional)" value={f.placeholder || ''}
                         onChange={e => setField(i, { placeholder: e.target.value })} />
                )}
                <code className="fb-name">name: {f.name}</code>
              </div>
            </div>
          ))}
        </div>

        <div className="fb-actions">
          <button type="submit" className="fb-btn primary" disabled={busy}>
            {busy ? 'Saving…' : editingId ? 'Update form' : 'Save form'}
          </button>
          <button type="button" className="fb-btn" onClick={() => setPreview(!preview)}>
            {preview ? 'Hide preview' : 'Preview'}
          </button>
          {editingId && <button type="button" className="fb-btn" onClick={reset}>New form</button>}
        </div>
      </form>

      {preview && (
        <div className="fb-preview">
          <h3>Preview</h3>
          {/* The same renderer the live page uses, so this is what people get. */}
          <PageRenderer layout={toLayout(meta, fields)} />
        </div>
      )}

      <div className="fb-list">
        <h3>Saved forms</h3>
        {forms.length === 0 ? (
          <p className="fb-hint">No forms yet. Build one above — it will then appear in Menu Mapping.</p>
        ) : (
          <table className="fb-table">
            <thead>
              <tr><th>Name</th><th>URL</th><th>Fields</th><th>Status</th><th>Menu</th><th>Created</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {forms.map(f => (
                <tr key={f.id}>
                  <td>{f.title}</td>
                  <td><code>/p/{f.pageKey}</code></td>
                  <td>{fromLayout(f.layout).fields.length}</td>
                  <td><span className={`fb-status ${f.status.toLowerCase()}`}>{f.status}</span></td>
                  <td>{f.menu ? f.menu.label : <span className="fb-hint">not mapped</span>}</td>
                  <td>{f.created}</td>
                  <td className="fb-row-actions">
                    <button className="fb-btn sm" onClick={() => edit(f)}>Edit</button>
                    <button className="fb-btn danger sm" onClick={() => remove(f)}>Delete</button>
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

export default FormBuilder;
