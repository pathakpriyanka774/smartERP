import React from 'react';
import './ApplicationSettings.css';
import FormBuilder from './FormBuilder';
import PageBuilder from './PageBuilder';
import MenuManager from './MenuManager';
import FormRules from './FormRules';
import ApiManager from './ApiManager';
import Permissions from './Permissions';
import Roles from './Roles';
import Templates from './Templates';

const ApplicationSettings = ({ activeSection }) => {
  const renderContent = () => {
    switch (activeSection) {
      case 'form-builder':
        return <FormBuilder />;
      case 'page-builder':
        return <PageBuilder />;
      case 'menu-manager':
        return <MenuManager />;
      case 'form-rules':
        return <FormRules />;
      case 'apis':
        return <ApiManager />;
      case 'permissions':
        return <Permissions />;
      case 'roles':
        return <Roles />;
      case 'templates':
        return <Templates />;
      default:
        return (
          <div className="settings-content">
            <h2>Application Settings</h2>
            <p>Select an option from the sidebar to configure your application.</p>
          </div>
        );
    }
  };

  return <div className="application-settings">{renderContent()}</div>;
};

export default ApplicationSettings;