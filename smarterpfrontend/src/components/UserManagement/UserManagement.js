import React, { useState, useEffect, useCallback } from 'react';
import { usersAPI } from '../../services/api';
import './UserManagement.css';

/**
 * User administration.
 *
 * Users and their permissions live in the database and are enforced on the
 * server. The previous version kept both in localStorage, which meant
 * permissions were per-browser rather than per-account, absent on any other
 * machine, and editable by anyone with dev tools — while the API enforced
 * nothing at all.
 */

const ROLES = ['Admin', 'Manager', 'Employee'];
const BLANK = { name: '', email: '', password: '', role: 'Employee', status: 'Active', permissions: [] };

const UserManagement = () => {
  const [users, setUsers] = useState([]);
  const [menus, setMenus] = useState([]);
  const [form, setForm] = useState(BLANK);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);
  const [denied, setDenied] = useState(false);

  const flash = (type, text) => { setNotice({ type, text }); setTimeout(() => setNotice(null), 5000); };
  const errText = (e, f) => e?.response?.data?.message || e?.message || f;

  const load = useCallback(async () => {
    try {
      const [u, p] = await Promise.all([usersAPI.list(), usersAPI.permissions()]);
      setUsers(u.data.data);
      setMenus(p.data.data);
      setDenied(false);
    } catch (e) {
      if (e?.response?.status === 403) return setDenied(true);
      flash('error', errText(e, 'Could not load users'));
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const reset = () => { setForm(BLANK); setEditingId(null); setShowForm(false); };

  const togglePermission = (key) => setForm(f => ({
    ...f,
    permissions: f.permissions.includes(key)
      ? f.permissions.filter(k => k !== key)
      : [...f.permissions, key]
  }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim()) return flash('error', 'Name and email are required');
    if (!editingId && form.password.length < 8) {
      return flash('error', 'Password must be at least 8 characters');
    }
    setBusy(true);
    try {
      if (editingId) {
        const body = {
          name: form.name, email: form.email, role: form.role,
          status: form.status, permissions: form.permissions
        };
        // Only send a password when one was actually typed.
        if (form.password) body.password = form.password;
        await usersAPI.update(editingId, body);
        flash('success', 'User updated — they will see the change on their next page load');
      } else {
        await usersAPI.create(form);
        flash('success', 'User created');
      }
      reset();
      load();
    } catch (err) {
      flash('error', errText(err, 'Could not save the user'));
    } finally { setBusy(false); }
  };

  const edit = (u) => {
    setForm({
      name: u.name, email: u.email, password: '', role: u.role,
      status: u.status, permissions: u.permissions || []
    });
    setEditingId(u.id);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const remove = async (u) => {
    if (!window.confirm(`Delete ${u.name}? This cannot be undone.`)) return;
    try {
      await usersAPI.remove(u.id);
      flash('success', 'User deleted');
      if (editingId === u.id) reset();
      load();
    } catch (err) { flash('error', errText(err, 'Could not delete the user')); }
  };

  if (denied) {
    return (
      <div className="user-management">
        <h1>User Management</h1>
        <div className="um-notice error">
          Your account does not have the <code>user-management</code> permission.
        </div>
      </div>
    );
  }

  const isAdminRole = form.role.toLowerCase() === 'admin';
  const bySection = menus.reduce((acc, m) => {
    (acc[m.section] = acc[m.section] || []).push(m);
    return acc;
  }, {});

  return (
    <div className="user-management">
      <div className="um-header">
        <h1>User Management</h1>
        <button className="um-btn primary" onClick={() => (showForm ? reset() : setShowForm(true))}>
          {showForm ? 'Cancel' : '+ Add User'}
        </button>
      </div>

      {notice && <div className={`um-notice ${notice.type}`}>{notice.text}</div>}

      {showForm && (
        <form className="um-form" onSubmit={submit}>
          <h3>{editingId ? 'Edit user' : 'New user'}</h3>
          <div className="um-grid">
            <label>Name *
              <input value={form.name} required onChange={e => setForm({ ...form, name: e.target.value })} />
            </label>
            <label>Email *
              <input type="email" value={form.email} required
                     onChange={e => setForm({ ...form, email: e.target.value })} />
            </label>
            <label>{editingId ? 'New password' : 'Password *'}
              <input type="password" value={form.password}
                     placeholder={editingId ? 'Leave blank to keep current' : 'At least 8 characters'}
                     required={!editingId}
                     onChange={e => setForm({ ...form, password: e.target.value })} />
            </label>
            <label>Role
              <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </label>
            <label>Status
              <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                <option value="Active">Active</option><option value="Inactive">Inactive</option>
              </select>
            </label>
          </div>

          <fieldset className="um-permissions">
            <legend>Menu access <span className="um-count">{form.permissions.length} selected</span></legend>
            {isAdminRole ? (
              <p className="um-hint">
                Admins hold every permission implicitly, including menus added later.
                Choose a different role to grant access selectively.
              </p>
            ) : (
              Object.entries(bySection).map(([section, list]) => (
                <div className="um-perm-group" key={section}>
                  <h4>{section}</h4>
                  <div className="um-perm-grid">
                    {list.map(m => (
                      <label key={m.key} className="um-check">
                        <input type="checkbox"
                               checked={form.permissions.includes(m.key)}
                               onChange={() => togglePermission(m.key)} />
                        {m.label}
                      </label>
                    ))}
                  </div>
                </div>
              ))
            )}
          </fieldset>

          <div className="um-actions">
            <button type="submit" className="um-btn primary" disabled={busy}>
              {busy ? 'Saving…' : editingId ? 'Update user' : 'Create user'}
            </button>
            <button type="button" className="um-btn" onClick={reset}>Cancel</button>
          </div>
        </form>
      )}

      <div className="um-list">
        <table className="um-table">
          <thead>
            <tr><th>Name</th><th>Email</th><th>Role</th><th>Menu access</th><th>Status</th><th>Created</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {users.length === 0 && (
              <tr><td colSpan="7" className="um-empty">No users yet.</td></tr>
            )}
            {users.map(u => (
              <tr key={u.id}>
                <td>{u.name}</td>
                <td>{u.email}</td>
                <td><span className={`um-role ${u.role.toLowerCase()}`}>{u.role}</span></td>
                <td>
                  {u.role.toLowerCase() === 'admin' ? (
                    <span className="um-all">all menus</span>
                  ) : u.permissions.length === 0 ? (
                    <span className="um-none">none</span>
                  ) : (
                    <div className="um-perm-tags">
                      {u.permissions.slice(0, 3).map(p => <span key={p} className="um-tag">{p}</span>)}
                      {u.permissions.length > 3 && <span className="um-tag more">+{u.permissions.length - 3}</span>}
                    </div>
                  )}
                </td>
                <td><span className={`um-status ${u.status.toLowerCase()}`}>{u.status}</span></td>
                <td>{u.created}</td>
                <td className="um-row-actions">
                  <button className="um-btn sm" onClick={() => edit(u)}>Edit</button>
                  <button className="um-btn danger sm" onClick={() => remove(u)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default UserManagement;
