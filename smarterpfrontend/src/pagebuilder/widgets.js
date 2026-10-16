/**
 * Widget catalogue for the page builder.
 *
 * Each entry describes what the palette shows, the props a new instance starts
 * with, and which property editors the inspector renders. Adding a widget type
 * means adding one entry here plus a case in PageRenderer.
 */

export const FIELD_TYPES = [
  { value: 'text',     label: 'Text input' },
  { value: 'number',   label: 'Number' },
  { value: 'email',    label: 'Email' },
  { value: 'date',     label: 'Date' },
  { value: 'textarea', label: 'Text area' },
  { value: 'select',   label: 'Dropdown' },
  { value: 'radio',    label: 'Radio buttons' },
  { value: 'checkbox', label: 'Checkbox' }
];

export const CHART_TYPES = [
  { value: 'bar',   label: 'Bar' },
  { value: 'hbar',  label: 'Horizontal bar' },
  { value: 'line',  label: 'Line' },
  { value: 'donut', label: 'Donut' }
];

export const METRICS = [
  { value: 'count', label: 'Count of records' },
  { value: 'sum',   label: 'Sum of' },
  { value: 'avg',   label: 'Average of' }
];

export const WIDGETS = {
  heading: {
    label: 'Heading', icon: 'H', group: 'Content',
    defaults: { text: 'Section heading', level: 'h2' }
  },
  text: {
    label: 'Text', icon: '¶', group: 'Content',
    defaults: { content: 'Describe this section.' }
  },
  divider: {
    label: 'Divider', icon: '—', group: 'Content',
    defaults: {}
  },
  stat: {
    label: 'Stat tile', icon: '▣', group: 'Data',
    defaults: { title: 'Total records', source: '', metric: 'count', metricColumn: '', caption: '' }
  },
  table: {
    label: 'Table', icon: '▤', group: 'Data',
    defaults: { title: 'Records', source: '', columns: [], limit: 25, orderBy: '', orderDir: 'desc' }
  },
  chart: {
    label: 'Chart', icon: '◔', group: 'Data',
    defaults: { title: 'Breakdown', source: '', chart: 'bar', groupBy: '', metric: 'count', metricColumn: '' }
  },
  // A chart made in Application Settings → Create Charts, shown by reference:
  // editing the chart updates every page that shows it.
  savedChart: {
    label: 'Saved chart', icon: '📈', group: 'Data',
    defaults: { chartId: null, title: '', showDescription: true }
  },
  // An existing form from Form Builder, chosen by its key. Fields are not
  // defined here: forms are built and maintained in Form Builder only.
  form: {
    label: 'Form', icon: '▥', group: 'Input',
    defaults: { formKey: '', title: '' }
  }
};

export const WIDGET_GROUPS = ['Content', 'Data', 'Input'];

export const newId = (prefix) =>
  `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const createWidget = (type) => ({
  id: newId('w'),
  type,
  props: JSON.parse(JSON.stringify(WIDGETS[type].defaults))
});

export const createColumn = (width = 12) => ({ id: newId('c'), width, widgets: [] });

export const createRow = (widths = [12]) => ({
  id: newId('r'),
  columns: widths.map(w => createColumn(w))
});

/** Layout presets offered when adding a row. */
export const ROW_PRESETS = [
  { label: 'Full width',    widths: [12] },
  { label: 'Two equal',     widths: [6, 6] },
  { label: 'Main + side',   widths: [8, 4] },
  { label: 'Side + main',   widths: [4, 8] },
  { label: 'Three equal',   widths: [4, 4, 4] },
  { label: 'Four equal',    widths: [3, 3, 3, 3] }
];

export const emptyLayout = () => ({ rows: [createRow([12])] });
