/**
 * Whitelist of entities the page builder may read.
 *
 * This registry is the ONLY place a table, view or column name is allowed to
 * come from. Widget definitions reference a source by key and columns by key,
 * and every request is resolved against this file before any SQL is built —
 * so a crafted page definition cannot reach a table it was never granted, and
 * an identifier can never be interpolated straight from a request.
 *
 * `type` drives both formatting and what a chart may do with a column:
 * only `number` columns can be summed or averaged.
 */
const DATA_SOURCES = {
  employees: {
    // Employee records are HR data: Payroll holders only.
    permission: ['payroll'],
    label: 'Employees',
    from: 'Employees',
    key: 'EmployeeID',
    // Salary is deliberately excluded: pages are shareable, and compensation
    // is not something a page author should be able to surface by accident.
    columns: [
      { key: 'EmployeeCode', label: 'Code',        type: 'text' },
      { key: 'Name',         label: 'Name',        type: 'text' },
      { key: 'Department',   label: 'Department',  type: 'text' },
      { key: 'Position',     label: 'Position',    type: 'text' },
      { key: 'JoiningDate',  label: 'Joined',      type: 'date' },
      { key: 'Status',       label: 'Status',      type: 'text' }
    ]
  },

  attendance: {
    permission: ['attendance'],
    label: 'Attendance',
    from: 'vw_AttendanceDetail',
    key: 'AttendanceID',
    columns: [
      { key: 'EmployeeCode',   label: 'Code',       type: 'text' },
      { key: 'EmployeeName',   label: 'Employee',   type: 'text' },
      { key: 'Department',     label: 'Department', type: 'text' },
      { key: 'AttendanceDate', label: 'Date',       type: 'date' },
      { key: 'CheckInTime',    label: 'In',         type: 'datetime' },
      { key: 'CheckOutTime',   label: 'Out',        type: 'datetime' },
      { key: 'Status',         label: 'Status',     type: 'text' },
      { key: 'TotalHours',     label: 'Hours',      type: 'number' }
    ]
  },

  orders: {
    permission: ['orders'],
    label: 'Sales Orders',
    from: 'Orders',
    key: 'OrderID',
    columns: [
      { key: 'ClientName',   label: 'Client',   type: 'text' },
      { key: 'OrderDate',    label: 'Ordered',  type: 'date' },
      { key: 'DeliveryDate', label: 'Delivery', type: 'date' },
      { key: 'Status',       label: 'Status',   type: 'text' },
      { key: 'Priority',     label: 'Priority', type: 'text' },
      { key: 'TotalAmount',  label: 'Amount',   type: 'number' }
    ]
  },

  inventory: {
    permission: ['inventory'],
    label: 'Inventory',
    from: 'vw_InventoryStatus',
    key: 'ItemID',
    columns: [
      { key: 'ItemName',     label: 'Item',     type: 'text' },
      { key: 'Category',     label: 'Category', type: 'text' },
      { key: 'Quantity',     label: 'Quantity', type: 'number' },
      { key: 'Unit',         label: 'Unit',     type: 'text' },
      { key: 'ReorderLevel', label: 'Reorder',  type: 'number' },
      { key: 'Status',       label: 'Status',   type: 'text' }
    ]
  },

  clients: {
    permission: ['clients'],
    label: 'Clients',
    from: 'Clients',
    key: 'ClientID',
    columns: [
      { key: 'Name',   label: 'Name',   type: 'text' },
      { key: 'Type',   label: 'Type',   type: 'text' },
      { key: 'Email',  label: 'Email',  type: 'text' },
      { key: 'Phone',  label: 'Phone',  type: 'text' },
      { key: 'Status', label: 'Status', type: 'text' }
    ]
  },

  transactions: {
    permission: ['expenses'],
    label: 'Finance Transactions',
    from: 'FinanceTransactions',
    key: 'TransactionID',
    columns: [
      { key: 'Type',        label: 'Type',        type: 'text' },
      { key: 'Amount',      label: 'Amount',      type: 'number' },
      { key: 'Description', label: 'Description', type: 'text' },
      { key: 'TxnDate',     label: 'Date',        type: 'date' },
      { key: 'Category',    label: 'Category',    type: 'text' }
    ]
  },

  production_orders: {
    permission: ['production'],
    label: 'Production Orders',
    from: 'ProductionOrders',
    key: 'OrderID',
    columns: [
      { key: 'OrderCode',         label: 'Order',     type: 'text' },
      { key: 'ClientName',        label: 'Client',    type: 'text' },
      { key: 'TotalQuantity',     label: 'Target',    type: 'number' },
      { key: 'CompletedQuantity', label: 'Completed', type: 'number' },
      { key: 'Status',            label: 'Status',    type: 'text' },
      { key: 'Priority',          label: 'Priority',  type: 'text' },
      { key: 'DeadlineDate',      label: 'Deadline',  type: 'date' }
    ]
  },

  machines: {
    permission: ['production'],
    label: 'Machines',
    from: 'Machines',
    key: 'MachineID',
    columns: [
      { key: 'MachineCode',     label: 'Code',     type: 'text' },
      { key: 'MachineName',     label: 'Machine',  type: 'text' },
      { key: 'MachineType',     label: 'Type',     type: 'text' },
      { key: 'Status',          label: 'Status',   type: 'text' },
      { key: 'Location',        label: 'Location', type: 'text' },
      { key: 'CapacityPerHour', label: 'Capacity', type: 'number' }
    ]
  },

  styles: {
    permission: ['style-costing', 'production'],
    label: 'Styles',
    from: 'Styles',
    key: 'StyleID',
    columns: [
      { key: 'StyleCode',             label: 'Code',      type: 'text' },
      { key: 'StyleName',             label: 'Style',     type: 'text' },
      { key: 'Category',              label: 'Category',  type: 'text' },
      { key: 'EstimatedTimePerPiece', label: 'Mins/pc',   type: 'number' }
    ]
  }
};

const getSource = (key) => Object.prototype.hasOwnProperty.call(DATA_SOURCES, key)
  ? DATA_SOURCES[key]
  : null;

/** Resolve requested column keys against the registry, dropping anything unknown. */
const resolveColumns = (source, requested) => {
  if (!requested || !requested.length) return source.columns;
  const byKey = new Map(source.columns.map(c => [c.key, c]));
  return requested.map(k => byKey.get(k)).filter(Boolean);
};

const findColumn = (source, key) => source.columns.find(c => c.key === key) || null;

/**
 * Whether a user may read a source. Each source belongs to the area that owns
 * its data, and needs that area's permission — the page builder must not be a
 * way around the gateway (any logged-in user could read employee and
 * attendance rows through it). Admins read everything.
 */
const canReadSource = (user, source) => {
  if ((user?.role || '').toLowerCase() === 'admin') return true;
  const held = new Set(user?.permissions || []);
  return (source.permission || []).some(p => held.has(p));
};

/** Sources the user may read; all of them when no user is given. */
const listSources = (user) =>
  Object.entries(DATA_SOURCES)
    .filter(([, s]) => !user || canReadSource(user, s))
    .map(([key, s]) => ({ key, label: s.label, columns: s.columns }));

module.exports = { DATA_SOURCES, getSource, resolveColumns, findColumn, listSources, canReadSource };
