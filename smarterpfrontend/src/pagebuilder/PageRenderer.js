import React, { useState, useEffect, useCallback } from 'react';
import { builderAPI } from '../services/api';
import Chart from './Chart';
import ChartRenderer from '../chartbuilder/ChartRenderer';
import './pagebuilder.css';

/**
 * Turns a saved page definition into a live page.
 *
 * The same component renders the builder's preview and the real page, so what
 * an author sees while editing is what a user gets — there is no second
 * rendering path to drift out of step.
 */

const fmtCell = (value, type) => {
  if (value === null || value === undefined || value === '') return '—';
  if (type === 'number') {
    const n = Number(value);
    return Number.isFinite(n) ? n.toLocaleString('en-IN') : value;
  }
  if (type === 'date') return String(value).slice(0, 10);
  if (type === 'datetime') return String(value).replace('T', ' ').slice(0, 16);
  return String(value);
};

const useAsync = (fn, deps, enabled = true) => {
  // Each result remembers which inputs produced it. Effects run after render,
  // so on the render where the inputs change (a chart or source just picked)
  // the stored result still belongs to the old inputs — often "not loading, no
  // data" — and a widget reading it would crash. A result for other inputs is
  // reported as loading instead.
  const key = JSON.stringify([enabled, ...deps]);
  const [state, setState] = useState({ key: null, loading: enabled, error: null, data: null });
  const run = useCallback(async () => {
    if (!enabled) return setState({ key, loading: false, error: null, data: null });
    setState(s => ({ ...s, key, loading: true, error: null }));
    try {
      const data = await fn();
      // Ignore a response that arrives after the inputs changed again.
      setState(s => (s.key === key ? { key, loading: false, error: null, data } : s));
    } catch (err) {
      // Surfaced in the widget rather than swallowed: a widget showing nothing
      // is indistinguishable from a widget with no data.
      setState(s => (s.key === key
        ? { key, loading: false, error: err?.response?.data?.message || err.message, data: null }
        : s));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { run(); }, [run]);
  if (state.key !== key) return { loading: enabled, error: null, data: null };
  return state;
};

const WidgetFrame = ({ title, children, className = '' }) => (
  <div className={`pb-widget ${className}`}>
    {title ? <h4 className="pb-widget-title">{title}</h4> : null}
    {children}
  </div>
);

const Placeholder = ({ children }) => <div className="pb-placeholder">{children}</div>;

const TableWidget = ({ props }) => {
  const { source, columns, limit, orderBy, orderDir, title } = props;
  const state = useAsync(async () => {
    const res = await builderAPI.rows(source, {
      columns: columns?.length ? columns.join(',') : undefined,
      limit: limit || 25,
      orderBy: orderBy || undefined,
      orderDir: orderDir || 'desc'
    });
    return res.data.data;
  }, [source, JSON.stringify(columns), limit, orderBy, orderDir], !!source);

  if (!source) return <WidgetFrame title={title}><Placeholder>Pick a data source</Placeholder></WidgetFrame>;
  if (state.loading) return <WidgetFrame title={title}><Placeholder>Loading…</Placeholder></WidgetFrame>;
  if (state.error) return <WidgetFrame title={title}><Placeholder>{state.error}</Placeholder></WidgetFrame>;

  const { columns: cols, rows } = state.data;
  return (
    <WidgetFrame title={title}>
      <div className="pb-table-scroll">
        <table className="pb-table">
          <thead>
            <tr>{cols.map(c => (
              <th key={c.key}>
                {c.label}
                {/* Authors need to know which columns are theirs vs the ERP's. */}
                {c.custom && <span className="pb-custom-flag" title="Custom column">custom</span>}
              </th>
            ))}</tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={cols.length} className="pb-empty-row">No records</td></tr>}
            {rows.map(r => (
              <tr key={r.__id}>
                {cols.map(c => <td key={c.key}>{fmtCell(r[c.key], c.type)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </WidgetFrame>
  );
};

const ChartWidget = ({ props }) => {
  const { source, groupBy, metric, metricColumn, chart, title } = props;
  const ready = !!source && !!groupBy && (metric === 'count' || !!metricColumn);
  const state = useAsync(async () => {
    const res = await builderAPI.aggregate(source, { groupBy, metric, metricColumn });
    return res.data.data;
  }, [source, groupBy, metric, metricColumn], ready);

  if (!ready) return <WidgetFrame title={title}><Placeholder>Choose a source, a grouping and a metric</Placeholder></WidgetFrame>;
  if (state.loading) return <WidgetFrame title={title}><Placeholder>Loading…</Placeholder></WidgetFrame>;
  if (state.error) return <WidgetFrame title={title}><Placeholder>{state.error}</Placeholder></WidgetFrame>;

  return (
    <WidgetFrame title={title}>
      <Chart type={chart} data={state.data} valueLabel={metric === 'count' ? 'Records' : metricColumn} />
    </WidgetFrame>
  );
};

/**
 * A chart from Create Charts. Fetched by id on every render of the page, so an
 * edit to the chart shows up on every page that uses it.
 */
const SavedChartWidget = ({ props }) => {
  const { chartId, title, showDescription } = props;
  const state = useAsync(async () => {
    const res = await builderAPI.embedChart(chartId);
    return res.data.data;
  }, [chartId], !!chartId);

  if (!chartId) return <WidgetFrame title={title}><Placeholder>Choose a saved chart</Placeholder></WidgetFrame>;
  if (state.loading) return <WidgetFrame title={title}><Placeholder>Loading…</Placeholder></WidgetFrame>;
  if (state.error || !state.data) {
    return (
      <WidgetFrame title={title}>
        <Placeholder>This chart is no longer available. It may have been deleted.</Placeholder>
      </WidgetFrame>
    );
  }

  const chart = state.data;
  return (
    <WidgetFrame title={title || chart.title}>
      {showDescription !== false && chart.description && <p className="pb-text">{chart.description}</p>}
      <ChartRenderer def={chart} />
    </WidgetFrame>
  );
};

const StatWidget = ({ props }) => {
  const { source, metric, metricColumn, title, caption } = props;
  const ready = !!source && (metric === 'count' || !!metricColumn);
  const state = useAsync(async () => {
    // A stat is an aggregate with no grouping; summing the grouped values gives
    // the same total without needing a second endpoint.
    const res = await builderAPI.rows(source, { limit: 1 });
    if (metric === 'count') {
      const all = await builderAPI.aggregate(source, { groupBy: res.data.data.columns[0].key, metric: 'count' });
      return all.data.data.reduce((s, d) => s + d.value, 0);
    }
    const all = await builderAPI.aggregate(source, {
      groupBy: res.data.data.columns[0].key, metric: 'sum', metricColumn
    });
    const total = all.data.data.reduce((s, d) => s + d.value, 0);
    return metric === 'avg' ? total / Math.max(all.data.data.length, 1) : total;
  }, [source, metric, metricColumn], ready);

  if (!ready) return <WidgetFrame className="pb-stat"><Placeholder>Pick a source and metric</Placeholder></WidgetFrame>;

  return (
    <div className="pb-widget pb-stat">
      <span className="pb-stat-label">{title}</span>
      <span className="pb-stat-value">
        {state.loading ? '…' : state.error ? '—' : Number(state.data || 0).toLocaleString('en-IN')}
      </span>
      {caption ? <span className="pb-stat-caption">{caption}</span> : null}
    </div>
  );
};

/**
 * A form placed on a page by reference to one built in Form Builder. Pages
 * pick from existing forms rather than defining fields of their own, so a form
 * is maintained in one place and every page showing it stays in step.
 */
const FormWidget = ({ props }) => {
  const { formKey } = props;
  const state = useAsync(async () => {
    const res = await builderAPI.page(formKey);
    return res.data.data;
  }, [formKey], !!formKey);

  if (!formKey) {
    // Inline fields: Form Builder's own preview, and pages saved before forms
    // were chosen by reference.
    if (props.fields) return <FormFields props={props} />;
    return <WidgetFrame title={props.title}><Placeholder>Choose a form</Placeholder></WidgetFrame>;
  }
  if (state.loading) return <WidgetFrame title={props.title}><Placeholder>Loading…</Placeholder></WidgetFrame>;

  const form = state.data;
  const def = form?.layout?.rows?.[0]?.columns?.[0]?.widgets?.find(w => w.type === 'form')?.props;
  if (state.error || !form || form.kind !== 'form' || !def) {
    return (
      <WidgetFrame title={props.title}>
        <Placeholder>This form is no longer available. It may have been deleted.</Placeholder>
      </WidgetFrame>
    );
  }
  if (form.status !== 'Active') {
    return <WidgetFrame title={props.title || form.title}><Placeholder>This form is inactive.</Placeholder></WidgetFrame>;
  }
  // Keyed by form, so switching forms starts with empty values.
  return <FormFields key={formKey} props={{ ...def, title: props.title || def.title || form.title }} />;
};

/** Renders a form definition's fields: { title, submitLabel, fields }. */
const FormFields = ({ props }) => {
  const [values, setValues] = useState({});
  const [submitted, setSubmitted] = useState(null);
  const set = (name, v) => setValues(prev => ({ ...prev, [name]: v }));

  const onSubmit = (e) => {
    e.preventDefault();
    // Custom forms have no destination table yet, so the values are echoed
    // rather than silently dropped, which would look like a working save.
    setSubmitted(values);
  };

  return (
    <WidgetFrame title={props.title}>
      <form className="pb-form" onSubmit={onSubmit}>
        {(props.fields || []).map(f => (
          <div className="pb-form-field" key={f.id}>
            <label>{f.label}{f.required && <span className="req">*</span>}</label>
            {f.type === 'textarea' && (
              <textarea rows="3" required={f.required} value={values[f.name] || ''}
                        onChange={e => set(f.name, e.target.value)} />
            )}
            {f.type === 'select' && (
              <select required={f.required} value={values[f.name] || ''}
                      onChange={e => set(f.name, e.target.value)}>
                <option value="">Select…</option>
                {(f.options || []).map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            )}
            {f.type === 'radio' && (
              <div className="pb-radio-group">
                {(f.options || []).map(o => (
                  <label key={o} className="pb-radio">
                    <input type="radio" name={f.id} value={o}
                           checked={values[f.name] === o}
                           onChange={e => set(f.name, e.target.value)} />
                    {o}
                  </label>
                ))}
              </div>
            )}
            {f.type === 'checkbox' && (
              <label className="pb-checkbox">
                <input type="checkbox" checked={!!values[f.name]}
                       onChange={e => set(f.name, e.target.checked)} />
                {f.placeholder || 'Yes'}
              </label>
            )}
            {['text', 'number', 'email', 'date'].includes(f.type) && (
              <input type={f.type} required={f.required} placeholder={f.placeholder || ''}
                     value={values[f.name] || ''} onChange={e => set(f.name, e.target.value)} />
            )}
          </div>
        ))}
        <button type="submit" className="pb-btn primary">{props.submitLabel || 'Submit'}</button>
        {submitted && (
          <pre className="pb-form-echo">
            Captured (not yet persisted):{'\n'}{JSON.stringify(submitted, null, 2)}
          </pre>
        )}
      </form>
    </WidgetFrame>
  );
};

export const renderWidget = (widget) => {
  const { type, props } = widget;
  switch (type) {
    case 'heading': {
      const Tag = props.level || 'h2';
      return <Tag className="pb-heading">{props.text}</Tag>;
    }
    case 'text':    return <p className="pb-text">{props.content}</p>;
    case 'divider': return <hr className="pb-divider" />;
    case 'stat':    return <StatWidget props={props} />;
    case 'table':   return <TableWidget props={props} />;
    case 'chart':   return <ChartWidget props={props} />;
    case 'savedChart': return <SavedChartWidget props={props} />;
    case 'form':    return <FormWidget props={props} />;
    default:        return <Placeholder>Unknown widget: {type}</Placeholder>;
  }
};

const PageRenderer = ({ layout }) => {
  if (!layout?.rows?.length) return <div className="pb-placeholder">This page has no content yet.</div>;
  return (
    <div className="pb-page">
      {layout.rows.map(row => (
        <div className="pb-row" key={row.id}>
          {row.columns.map(col => (
            <div className="pb-col" key={col.id} style={{ flex: `0 0 ${(col.width / 12) * 100}%` }}>
              {col.widgets.map(w => <div key={w.id}>{renderWidget(w)}</div>)}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};

export default PageRenderer;
