import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import './Sidebar.css';

const Sidebar = ({ user, onLogout }) => {
    const [showAppSettings, setShowAppSettings] = useState(false);
    const navigate = useNavigate();
    const location = useLocation();
    
    const getActiveSection = () => {
        return location.pathname.substring(1) || 'dashboard';
    };

    const menuItems = [
        { id: 'dashboard', label: 'Dashboard', icon: '🏠', path: '/dashboard' },
        { id: 'orders', label: 'Orders', icon: '📦', path: '/orders' },
        { id: 'inventory', label: 'Inventory', icon: '📋', path: '/inventory' },
        { id: 'production', label: 'Production', icon: '🏭', path: '/production' },
        { id: 'expenses', label: 'Expenses & Finance', icon: '💰', path: '/expenses' },
        { id: 'clients', label: 'Clients & Vendors', icon: '👥', path: '/clients' },
        { id: 'payroll', label: 'Payroll', icon: '💼', path: '/payroll' },
        { id: 'style-costing', label: 'Style Costing', icon: '💰', path: '/style-costing' },
        { id: 'reports', label: 'Reports', icon: '📊', path: '/reports' },
    ];

    const appSettingsItems = [
        { id: 'form-builder', label: 'Form Builder', path: '/form-builder' },
        { id: 'page-builder', label: 'Page Builder', path: '/page-builder' },
        { id: 'template-builder', label: 'Template Builder', path: '/template-builder' },
        { id: 'template-list', label: 'Template List', path: '/template-list' },
        { id: 'menu-manager', label: 'Menu Manager', path: '/menu-manager' },
        { id: 'form-rules', label: 'Form Rules', path: '/form-rules' },
        { id: 'apis', label: 'APIs', path: '/apis' },
        { id: 'user-management', label: 'User Management', path: '/user-management' }
    ];

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