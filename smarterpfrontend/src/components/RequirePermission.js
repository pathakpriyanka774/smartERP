import React from 'react';
import { Navigate } from 'react-router-dom';
import { canOpen, landingPath } from '../config/menuConfig';

/**
 * Route guard.
 *
 * A convenience, not a security control — it stops a restricted user landing
 * on a screen by typing its URL, but the data behind that screen is protected
 * by the gateway and the services, which is what actually matters.
 */
const RequirePermission = ({ user, menuKey, children }) => {
  if (!canOpen(user, menuKey)) {
    // Send them somewhere they can open. Always redirecting to /dashboard
    // bounced a user without Dashboard straight back to this message.
    const home = landingPath(user);
    if (home) return <Navigate to={home} replace />;
    return (
      <div className="no-access">
        <h1>No access</h1>
        <p>
          Your account does not have permission to open this area.
          Ask an administrator to grant it in User Management.
        </p>
      </div>
    );
  }
  return children;
};

export default RequirePermission;
