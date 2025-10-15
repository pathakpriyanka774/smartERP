import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authAPI } from '../../services/api';
import './Auth.css';

const Login = ({ onLogin, switchToSignup }) => {
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    console.log('Login attempt:', formData);

    if (!formData.email || !formData.password) {
      setError('Please fill in all fields');
      return;
    }

    try {
      console.log('Calling API...');
      const response = await authAPI.login(formData);
      console.log('API Response:', response.data);
      
      if (response.data.success) {
        localStorage.setItem('currentUser', JSON.stringify(response.data.user));
        localStorage.setItem('token', response.data.token);
        onLogin(response.data.user);
        navigate('/dashboard');
      }
    } catch (error) {
      console.error('Login error:', error);
      setError(error.response?.data?.message || 'Connection failed. Check if backend is running.');
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <h2>Login to ERP System</h2>
          <p>Welcome back! Please sign in to your account.</p>
        </div>
        
        <form onSubmit={handleSubmit} className="auth-form">
          {error && <div className="error-message">{error}</div>}
          
          <div className="form-group">
            <label>Email Address</label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="Enter your email"
              required
            />
          </div>
          
          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              placeholder="Enter your password"
              required
            />
          </div>
          
          <button type="submit" className="auth-btn">
            Sign In
          </button>
        </form>
        
        <div className="auth-footer">
          <p>Don't have an account? 
            <button onClick={() => navigate('/signup')} className="link-btn">Sign up here</button>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;