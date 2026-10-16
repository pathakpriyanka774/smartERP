/**
 * Single source of truth for application navigation.
 *
 * The Sidebar renders from this and the Menu Manager seeds its list from it.
 * Each previously kept its own hard-coded copy, so a module added to one was
 * invisible in the other — adding an entry here now surfaces it in both.
 *
 * `id` is derived from `path` because the Sidebar highlights the active item by
 * comparing the id against the current pathname; deriving it keeps the two from
 * disagreeing.
 */
const withIds = (items, section) =>
  items.map((item, index) => ({
    ...item,
    id: item.path.replace(/^\//, ''),
    section,
    order: index + 1
  }));

export const MAIN_MENU = withIds([
  { label: 'Dashboard',         icon: '🏠', path: '/dashboard' },
  { label: 'Orders',            icon: '📦', path: '/orders' },
  { label: 'Sales Invoices',    icon: '🧾', path: '/invoices' },
  { label: 'Inventory',         icon: '📋', path: '/inventory' },
  { label: 'Purchases',         icon: '🛒', path: '/purchases' },
  { label: 'Production',        icon: '🏭', path: '/production' },
  { label: 'Expenses & Finance', icon: '💰', path: '/expenses' },
  { label: 'Accounting',        icon: '📒', path: '/accounting' },
  { label: 'Clients & Vendors', icon: '👥', path: '/clients' },
  { label: 'Payroll',           icon: '💼', path: '/payroll' },
  { label: 'Attendance',        icon: '🕒', path: '/attendance' },
  { label: 'Style Costing',     icon: '💰', path: '/style-costing' },
  { label: 'Reports',           icon: '📊', path: '/reports' }
], 'Main Menu');

export const APP_SETTINGS_MENU = withIds([
  { label: 'Form Builder',     icon: '📝', path: '/form-builder' },
  { label: 'Page Builder',     icon: '🎨', path: '/page-builder' },
  { label: 'Template Builder', icon: '🧩', path: '/template-builder' },
  { label: 'Template List',    icon: '📄', path: '/template-list' },
  { label: 'Menu Manager',     icon: '📋', path: '/menu-manager' },
  { label: 'Form Rules',       icon: '⚙️', path: '/form-rules' },
  { label: 'APIs',             icon: '🔗', path: '/apis' },
  { label: 'User Management',  icon: '👤', path: '/user-management' },
  { label: 'Create Charts',    icon: '📈', path: '/chart-builder' },
  // Admin-only screens: not grantable as permissions (the audit log holds
  // personal data; settings change what every invoice says).
  { label: 'Company Settings', icon: '🏢', path: '/company-settings', adminOnly: true },
  { label: 'Audit Log',        icon: '🔍', path: '/audit-log', adminOnly: true }
], 'Application Settings');

/** Every navigable menu item, flattened — used by the Menu Manager listing. */
export const ALL_MENU_ITEMS = [...MAIN_MENU, ...APP_SETTINGS_MENU];

/**
 * Whether the user may open a menu. Admins hold every menu implicitly.
 *
 * The sidebar, the route guard and the landing page all ask this one question,
 * so they cannot disagree about what a user sees. Presentation only: the
 * gateway and services enforce the same permissions on every request.
 */
const ADMIN_ONLY = new Set(['company-settings', 'audit-log']);

export const canOpen = (user, menuKey) =>
  (user?.role || '').toLowerCase() === 'admin' ||
  (!ADMIN_ONLY.has(menuKey) && (user?.permissions || []).includes(menuKey));

/**
 * Where to send the user after login, or from a screen they may not open: the
 * first menu, in sidebar order, that they hold. Not always the dashboard — a
 * user granted only Attendance would otherwise land on "No access" every time.
 * null when they hold no menu at all.
 */
export const landingPath = (user) => {
  const first = ALL_MENU_ITEMS.find(item => canOpen(user, item.id));
  return first ? first.path : null;
};
