import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import './App.css';
import Sidebar from './components/Sidebar/Sidebar';
import Dashboard from './components/Dashboard/Dashboard';
import Orders from './components/Orders/Orders';
import Inventory from './components/Inventory/Inventory';
import Production from './components/Production/Production';
import Expenses from './components/Expenses/Expenses';
import Clients from './components/Clients/Clients';
import Reports from './components/Reports/Reports';
import Payroll from './components/Payroll/Payroll';
import ApplicationSettings from './components/ApplicationSettings/ApplicationSettings';
import UserManagement from './components/UserManagement/UserManagement';
import TemplateBuilder from './components/TemplateBuilder/TemplateBuilder';
import TemplateList from './components/TemplateList/TemplateList';
import Workflows from './components/Workflows/Workflows';
import Login from './components/Auth/Login';
import { authAPI, clearSession } from './services/api';
import Signup from './components/Auth/Signup';
import PlanningDashboard from './components/ProductionPlanning/PlanningDashboard';
import ProductionWorkerDashboard from './components/ProductionWorkflow/ProductionWorkerDashboard';
import QualityDashboard from './components/QualityManagement/QualityDashboard';
import StyleCosting from './components/StyleCosting/StyleCosting';
import Attendance from './components/Attendance/Attendance';
import CustomPage from './components/CustomPage';
import RequirePermission from './components/RequirePermission';
import Invoices from './components/Invoices/Invoices';
import Purchases from './components/Purchases/Purchases';
import Accounting from './components/Accounting/Accounting';
import CompanySettings from './components/CompanySettings/CompanySettings';
import AuditLog from './components/AuditLog/AuditLog';
import { landingPath } from './config/menuConfig';

function App() {
    const [user, setUser] = useState(null);
    const [authMode, setAuthMode] = useState('login');

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
            <div className="app">
                <Sidebar user={user} onLogout={handleLogout} />
                <div className="main-content">
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
                </div>
            </div>
        </Router>
    );
}

export default App;