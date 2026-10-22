import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import './Sidebar.css';
import { MAIN_MENU, APP_SETTINGS_MENU, canOpen } from '../../config/menuConfig';
import { builderAPI } from '../../services/api';

const Sidebar = ({ user, onLogout, onNavigate }) => {
    const [showAppSettings, setShowAppSettings] = useState(false);
    const navigate = useNavigate();
    const location = useLocation();

    // On a phone the sidebar is an overlay; any route change (a menu click or
    // the back button) should put it away again.
    useEffect(() => {
        if (onNavigate) onNavigate();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [location.pathname]);

    const getActiveSection = () => {
        return location.pathname.substring(1) || 'dashboard';
    };

    // The server owns the menu catalogue (AppMenus), so a menu re-labelled,
    // reordered, hidden or pointed at a custom page in Menu Mapping takes
    // effect here. menuConfig is the fallback for when the service is down —
    // navigation must not disappear because one service is unavailable.
    const [serverMenus, setServerMenus] = useState(null);

    // Re-fetched whenever the account or its permissions change. App refreshes
    // the session on load, and the first fetch can go out with the token from
    // before that refresh — keying on the permissions makes the sidebar follow
    // the fresh grant instead of showing the stale one until a reload.
    const permissionKey = `${user?.id}|${user?.role}|${(user?.permissions || []).join(',')}`;

    useEffect(() => {
        let cancelled = false;
        builderAPI.navigation()
            .then(res => { if (!cancelled) setServerMenus(res.data.data || []); })
            .catch(() => { if (!cancelled) setServerMenus(null); });
        return () => { cancelled = true; };
    }, [permissionKey]);

    // The server already filtered navigation to what this user may open. The
    // static fallback has no such filtering, so apply the user's own
    // permissions to it — otherwise a service outage would show a restricted
    // user every menu. This is presentation only; the server is what enforces.
    const permitted = (items) => items.filter(i => canOpen(user, i.id));

    const forSection = (section, fallback) => {
        if (!serverMenus) return permitted(fallback);
        const rows = serverMenus.filter(m => m.section === section).map(m => ({ ...m, id: m.path.replace(/^\//, '') }));
        // Admin-only screens are not in the grantable catalogue; add them for admins.
        const extra = permitted(fallback.filter(i => i.adminOnly && !rows.some(r => r.id === i.id)));
        return [...rows, ...extra];
    };

    const menuItems = forSection('Main Menu', MAIN_MENU);
    const appSettingsItems = forSection('Application Settings', APP_SETTINGS_MENU);

    return (
        <div className="sidebar">
            <div className="sidebar-header">
                <h2>StitchPro Optivise</h2>
            </div>
            
            <nav className="sidebar-nav">
                {menuItems.map(item => (
                    <div 
                        key={item.id}
                        className={`nav-item ${getActiveSection() === item.id ? 'active' : ''}`}
                        onClick={() => navigate(item.path)}
                    >
                        <span className="nav-icon">{item.icon}</span>
                        <span className="nav-label">{item.label}</span>
                    </div>
                ))}

                {/* A section the user holds nothing in is hidden entirely,
                    rather than shown as a heading that expands to nothing. */}
                {appSettingsItems.length > 0 && (
                <div className="nav-item app-settings">
                    <div 
                        className="nav-item-header"
                        onClick={() => setShowAppSettings(!showAppSettings)}
                    >
                        <span className="nav-icon">⚙️</span>
                        <span className="nav-label">Application Settings</span>
                        <span className={`arrow ${showAppSettings ? 'open' : ''}`}>▼</span>
                    </div>
                    {showAppSettings && (
                        <div className="sub-menu">
                            {appSettingsItems.map(item => (
                                <div 
                                    key={item.id}
                                    className={`sub-nav-item ${getActiveSection() === item.id ? 'active' : ''}`}
                                    onClick={() => navigate(item.path)}
                                >
                                    {item.label}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                )}

                {!menuItems.length && !appSettingsItems.length && (
                    <div className="nav-empty">
                        No menus are assigned to your account yet.
                        Ask an administrator to grant access in User Management.
                    </div>
                )}
            </nav>
            
            {user && (
                <div className="user-info">
                    <div className="user-avatar">{user.name.charAt(0).toUpperCase()}</div>
                    <div className="user-name">{user.name}</div>
                    <button onClick={onLogout} className="logout-btn">⏻</button>
                </div>
            )}
        </div>
    );
};

export default Sidebar;