import React, { useState, useEffect, lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import './App.css';
import Sidebar from './components/Sidebar/Sidebar';
import Login from './components/Auth/Login';
import { authAPI, clearSession } from './services/api';
import Signup from './components/Auth/Signup';
import RequirePermission from './components/RequirePermission';
import { landingPath } from './config/menuConfig';

// Each page is its own chunk, fetched the first time it is opened, so the
// initial download is the shell and the login screen rather than every page.
const Dashboard = lazy(() => import('./components/Dashboard/Dashboard'));
const Orders = lazy(() => import('./components/Orders/Orders'));
const Inventory = lazy(() => import('./components/Inventory/Inventory'));
const Production = lazy(() => import('./components/Production/Production'));
const Expenses = lazy(() => import('./components/Expenses/Expenses'));
const Clients = lazy(() => import('./components/Clients/Clients'));
const Reports = lazy(() => import('./components/Reports/Reports'));
const Payroll = lazy(() => import('./components/Payroll/Payroll'));
const ApplicationSettings = lazy(() => import('./components/ApplicationSettings/ApplicationSettings'));
const UserManagement = lazy(() => import('./components/UserManagement/UserManagement'));
const TemplateBuilder = lazy(() => import('./components/TemplateBuilder/TemplateBuilder'));
const TemplateList = lazy(() => import('./components/TemplateList/TemplateList'));
const Workflows = lazy(() => import('./components/Workflows/Workflows'));
const PlanningDashboard = lazy(() => import('./components/ProductionPlanning/PlanningDashboard'));
const ProductionWorkerDashboard = lazy(() => import('./components/ProductionWorkflow/ProductionWorkerDashboard'));
const QualityDashboard = lazy(() => import('./components/QualityManagement/QualityDashboard'));
const StyleCosting = lazy(() => import('./components/StyleCosting/StyleCosting'));
const Attendance = lazy(() => import('./components/Attendance/Attendance'));
const CustomPage = lazy(() => import('./components/CustomPage'));
const Invoices = lazy(() => import('./components/Invoices/Invoices'));
const Purchases = lazy(() => import('./components/Purchases/Purchases'));
const Accounting = lazy(() => import('./components/Accounting/Accounting'));
const CompanySettings = lazy(() => import('./components/CompanySettings/CompanySettings'));
const AuditLog = lazy(() => import('./components/AuditLog/AuditLog'));

function App() {
    const [user, setUser] = useState(null);
    const [, setAuthMode] = useState('login');
    const [menuOpen, setMenuOpen] = useState(false);

    // Escape closes the mobile menu, as it would any overlay.
    useEffect(() => {
        if (!menuOpen) return;
        const onKey = (e) => { if (e.key === 'Escape') setMenuOpen(false); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [menuOpen]);

    useEffect(() => {
        const stored = localStorage.getItem('currentUser');
        if (!stored) return;
        setUser(JSON.parse(stored));

        // Re-read the account from the server on load. A stored login can be
        // stale — permissions changed, role changed, account deactivated — and
        // trusting the cached copy would show a menu the server will refuse.
        authAPI.session()
            .then(res => {
                const { user: fresh, token } = res.data;
                localStorage.setItem('currentUser', JSON.stringify(fresh));
                localStorage.setItem('token', token);
                setUser(fresh);
            })
            .catch(() => {
                clearSession();
                setUser(null);
            });
    }, []);

    const handleLogin = (userData) => {
        setUser(userData);
    };

    const handleSignup = (userData) => {
        setUser(userData);
    };

    const handleLogout = () => {
        // Revoke on the server first (ends the session everywhere), then drop
        // the token here. A failed call still signs this browser out.
        authAPI.logout().catch(() => {}).finally(() => {
            clearSession();
            setUser(null);
        });
    };

    if (!user) {
        return (
            <Router>
                <Routes>
                    <Route path="/signup" element={
                        <Signup
                            onSignup={handleSignup}
                            switchToLogin={() => setAuthMode('login')}
                        />
                    } />
                    <Route path="*" element={
                        <Login
                            onLogin={handleLogin}
                            switchToSignup={() => setAuthMode('signup')}
                        />
                    } />
                </Routes>
            </Router>
        );
    }

    return (
        <Router>
            <div className={`app ${menuOpen ? 'menu-open' : ''}`}>
                {/* Below 900px the sidebar is off-canvas; this bar opens it. */}
                <header className="mobile-topbar">
                    <button
                        type="button"
                        className="menu-toggle"
                        aria-label="Open menu"
                        aria-expanded={menuOpen}
                        onClick={() => setMenuOpen(true)}
                    >☰</button>
                    <span className="mobile-title">StitchPro Optivise</span>
                </header>
                <Sidebar user={user} onLogout={handleLogout} onNavigate={() => setMenuOpen(false)} />
                <div className="sidebar-backdrop" onClick={() => setMenuOpen(false)} />
                <div className="main-content">
                    <Suspense fallback={<div className="page-loading">Loading…</div>}>
                    <Routes>
                        <Route path="/" element={<Navigate to={landingPath(user) || '/dashboard'} replace />} />
                        <Route path="/dashboard" element={<RequirePermission user={user} menuKey="dashboard"><Dashboard /></RequirePermission>} />
                        <Route path="/orders" element={<RequirePermission user={user} menuKey="orders"><Orders /></RequirePermission>} />
                        <Route path="/inventory" element={<RequirePermission user={user} menuKey="inventory"><Inventory /></RequirePermission>} />
                        <Route path="/production" element={<RequirePermission user={user} menuKey="production"><Production /></RequirePermission>} />
                        <Route path="/expenses" element={<RequirePermission user={user} menuKey="expenses"><Expenses /></RequirePermission>} />
                        <Route path="/clients" element={<RequirePermission user={user} menuKey="clients"><Clients /></RequirePermission>} />
                        <Route path="/reports" element={<RequirePermission user={user} menuKey="reports"><Reports /></RequirePermission>} />
                        <Route path="/payroll" element={<RequirePermission user={user} menuKey="payroll"><Payroll /></RequirePermission>} />
                        <Route path="/workflows" element={<Workflows />} />
                        <Route path="/form-builder" element={<RequirePermission user={user} menuKey="form-builder"><ApplicationSettings activeSection="form-builder" /></RequirePermission>} />
                        <Route path="/page-builder" element={<RequirePermission user={user} menuKey="page-builder"><ApplicationSettings activeSection="page-builder" /></RequirePermission>} />
                        <Route path="/menu-manager" element={<RequirePermission user={user} menuKey="menu-manager"><ApplicationSettings activeSection="menu-manager" /></RequirePermission>} />
                        <Route path="/form-rules" element={<RequirePermission user={user} menuKey="form-rules"><ApplicationSettings activeSection="form-rules" /></RequirePermission>} />
                        <Route path="/apis" element={<RequirePermission user={user} menuKey="apis"><ApplicationSettings activeSection="apis" /></RequirePermission>} />
                        <Route path="/chart-builder" element={<RequirePermission user={user} menuKey="chart-builder"><ApplicationSettings activeSection="chart-builder" /></RequirePermission>} />
                        <Route path="/permissions" element={<ApplicationSettings activeSection="permissions" />} />
                        <Route path="/roles" element={<ApplicationSettings activeSection="roles" />} />
                        <Route path="/templates" element={<ApplicationSettings activeSection="templates" />} />
                        <Route path="/user-management" element={<RequirePermission user={user} menuKey="user-management"><UserManagement /></RequirePermission>} />
                        <Route path="/template-builder" element={<RequirePermission user={user} menuKey="template-builder"><TemplateBuilder /></RequirePermission>} />
                        <Route path="/template-list" element={<RequirePermission user={user} menuKey="template-list"><TemplateList /></RequirePermission>} />
                        <Route path="/planning-dashboard" element={<RequirePermission user={user} menuKey="production"><PlanningDashboard /></RequirePermission>} />
                        <Route path="/worker-dashboard" element={<RequirePermission user={user} menuKey="production"><ProductionWorkerDashboard /></RequirePermission>} />
                        <Route path="/quality-dashboard" element={<RequirePermission user={user} menuKey="production"><QualityDashboard /></RequirePermission>} />
                        <Route path="/style-costing" element={<RequirePermission user={user} menuKey="style-costing"><StyleCosting /></RequirePermission>} />
                        <Route path="/attendance" element={<RequirePermission user={user} menuKey="attendance"><Attendance /></RequirePermission>} />
                        <Route path="/invoices" element={<RequirePermission user={user} menuKey="invoices"><Invoices /></RequirePermission>} />
                        <Route path="/purchases" element={<RequirePermission user={user} menuKey="purchases"><Purchases /></RequirePermission>} />
                        <Route path="/accounting" element={<RequirePermission user={user} menuKey="accounting"><Accounting /></RequirePermission>} />
                        <Route path="/company-settings" element={<RequirePermission user={user} menuKey="company-settings"><CompanySettings /></RequirePermission>} />
                        <Route path="/audit-log" element={<RequirePermission user={user} menuKey="audit-log"><AuditLog /></RequirePermission>} />
                        {/* Client-built pages from the Page Builder. */}
                        <Route path="/p/:pageKey" element={<CustomPage />} />
                    </Routes>
                    </Suspense>
                </div>
            </div>
        </Router>
    );
}

export default App;