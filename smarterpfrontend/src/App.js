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
import Signup from './components/Auth/Signup';
import PlanningDashboard from './components/ProductionPlanning/PlanningDashboard';
import ProductionWorkerDashboard from './components/ProductionWorkflow/ProductionWorkerDashboard';
import QualityDashboard from './components/QualityManagement/QualityDashboard';
import StyleCosting from './components/StyleCosting/StyleCosting';

function App() {
    const [user, setUser] = useState(null);
    const [authMode, setAuthMode] = useState('login');

    useEffect(() => {
        const currentUser = localStorage.getItem('currentUser');
        if (currentUser) {
            setUser(JSON.parse(currentUser));
        }
    }, []);

    const handleLogin = (userData) => {
        setUser(userData);
    };

    const handleSignup = (userData) => {
        setUser(userData);
    };

    const handleLogout = () => {
        localStorage.removeItem('currentUser');
        setUser(null);
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
                        <Route path="/" element={<Navigate to="/dashboard" replace />} />
                        <Route path="/dashboard" element={<Dashboard />} />
                        <Route path="/orders" element={<Orders />} />
                        <Route path="/inventory" element={<Inventory />} />
                        <Route path="/production" element={<Production />} />
                        <Route path="/expenses" element={<Expenses />} />
                        <Route path="/clients" element={<Clients />} />
                        <Route path="/reports" element={<Reports />} />
                        <Route path="/payroll" element={<Payroll />} />
                        <Route path="/workflows" element={<Workflows />} />
                        <Route path="/form-builder" element={<ApplicationSettings activeSection="form-builder" />} />
                        <Route path="/page-builder" element={<ApplicationSettings activeSection="page-builder" />} />
                        <Route path="/menu-manager" element={<ApplicationSettings activeSection="menu-manager" />} />
                        <Route path="/form-rules" element={<ApplicationSettings activeSection="form-rules" />} />
                        <Route path="/apis" element={<ApplicationSettings activeSection="apis" />} />
                        <Route path="/permissions" element={<ApplicationSettings activeSection="permissions" />} />
                        <Route path="/roles" element={<ApplicationSettings activeSection="roles" />} />
                        <Route path="/templates" element={<ApplicationSettings activeSection="templates" />} />
                        <Route path="/user-management" element={<UserManagement />} />
                        <Route path="/template-builder" element={<TemplateBuilder />} />
                        <Route path="/template-list" element={<TemplateList />} />
                        <Route path="/planning-dashboard" element={<PlanningDashboard />} />
                        <Route path="/worker-dashboard" element={<ProductionWorkerDashboard />} />
                        <Route path="/quality-dashboard" element={<QualityDashboard />} />
                        <Route path="/style-costing" element={<StyleCosting />} />
                    </Routes>
                </div>
            </div>
        </Router>
    );
}

export default App;