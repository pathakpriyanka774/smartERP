/**
 * Canonical catalogue of the application's built-in menus.
 *
 * These are seeded into AppMenus on service start so the Menu Mapping screen
 * can offer every menu the application actually has — previously the built-ins
 * existed only in the React bundle (src/config/menuConfig.js) and the backend
 * had no idea they existed.
 *
 * Keep in step with smarterpfrontend/src/config/menuConfig.js, which renders
 * these routes. This list is authoritative for mapping; that file is the
 * offline fallback for the sidebar.
 */
const BUILT_IN_MENUS = [
  // Main Menu
  { key: 'dashboard',        label: 'Dashboard',           icon: '🏠', section: 'Main Menu', path: '/dashboard',        order: 1 },
  { key: 'orders',           label: 'Orders',              icon: '📦', section: 'Main Menu', path: '/orders',           order: 2 },
  { key: 'invoices',         label: 'Sales Invoices',      icon: '🧾', section: 'Main Menu', path: '/invoices',         order: 3 },
  { key: 'inventory',        label: 'Inventory',           icon: '📋', section: 'Main Menu', path: '/inventory',        order: 4 },
  { key: 'purchases',        label: 'Purchases',           icon: '🛒', section: 'Main Menu', path: '/purchases',        order: 5 },
  { key: 'production',       label: 'Production',          icon: '🏭', section: 'Main Menu', path: '/production',       order: 6 },
  { key: 'expenses',         label: 'Expenses & Finance',  icon: '💰', section: 'Main Menu', path: '/expenses',         order: 7 },
  { key: 'accounting',       label: 'Accounting',          icon: '📒', section: 'Main Menu', path: '/accounting',       order: 8 },
  { key: 'clients',          label: 'Clients & Vendors',   icon: '👥', section: 'Main Menu', path: '/clients',          order: 9 },
  { key: 'payroll',          label: 'Payroll',             icon: '💼', section: 'Main Menu', path: '/payroll',          order: 10 },
  { key: 'attendance',       label: 'Attendance',          icon: '🕒', section: 'Main Menu', path: '/attendance',       order: 11 },
  { key: 'style-costing',    label: 'Style Costing',       icon: '💰', section: 'Main Menu', path: '/style-costing',    order: 12 },
  { key: 'reports',          label: 'Reports',             icon: '📊', section: 'Main Menu', path: '/reports',          order: 13 },

  // Application Settings
  { key: 'form-builder',     label: 'Form Builder',        icon: '📝', section: 'Application Settings', path: '/form-builder',     order: 1 },
  { key: 'page-builder',     label: 'Page Builder',        icon: '🎨', section: 'Application Settings', path: '/page-builder',     order: 2 },
  { key: 'template-builder', label: 'Template Builder',    icon: '🧩', section: 'Application Settings', path: '/template-builder', order: 3 },
  { key: 'template-list',    label: 'Template List',       icon: '📄', section: 'Application Settings', path: '/template-list',    order: 4 },
  // Menu Manager also does menu-to-page/API mapping; there is no separate
  // Menu Mapping screen.
  { key: 'menu-manager',     label: 'Menu Manager',        icon: '📋', section: 'Application Settings', path: '/menu-manager',     order: 5 },
  { key: 'form-rules',       label: 'Form Rules',          icon: '⚙️', section: 'Application Settings', path: '/form-rules',       order: 6 },
  { key: 'apis',             label: 'APIs',                icon: '🔗', section: 'Application Settings', path: '/apis',             order: 7 },
  { key: 'user-management',  label: 'User Management',     icon: '👤', section: 'Application Settings', path: '/user-management',  order: 8 },
  { key: 'chart-builder',    label: 'Create Charts',       icon: '📈', section: 'Application Settings', path: '/chart-builder',    order: 9 }
];

const SECTIONS = ['Main Menu', 'Application Settings'];

/**
 * The application's own screens, offered alongside custom pages when choosing
 * what a menu opens. Derived from the built-in menus because each one is
 * exactly a route the React app renders — there is no second list to drift.
 */
const APP_PAGES = BUILT_IN_MENUS.map(({ key, label, icon, section, path }) =>
  ({ key, label, icon, section, path }));

/** Only these routes may be bound; anything else is not a screen we ship. */
const isAppPath = (path) => APP_PAGES.some(p => p.path === path);

module.exports = { BUILT_IN_MENUS, SECTIONS, APP_PAGES, isAppPath };
