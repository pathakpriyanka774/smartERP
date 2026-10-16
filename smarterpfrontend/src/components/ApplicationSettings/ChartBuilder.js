import React, { useEffect, useMemo, useState } from 'react';
import { builderAPI } from '../../services/api';
import ChartRenderer, {
  CHART_TYPES, isPieType, seriesColors, categoryColors
} from '../../chartbuilder/ChartRenderer';
import './ChartBuilder.css';

/**
 * Application Settings → Create Charts.
 *
 * Charts are authored by hand: categories down the side, one column of values
 * per series, a colour per series (or per slice for pie/donut), and a live
 * preview. Saved charts are stored by the page-builder service in SavedCharts.
 */

const MAX_SERIES = 8;
const MAX_ROWS = 50;
const MAX_SLICES = 8;     // colours never repeat, so per-category colour caps here

let nextKey = 1;
const key = () => nextKey++;

const STARTER = () => ({
  id: null,
  title: '',
  description: '',
  type: 'bar',
  colorBy: 'series',
  options: { showValues: false, xTitle: '', yTitle: '', valuePrefix: '', valueSuffix: '' },
  series: [{ key: key(), name: 'Series 1', color: null }],
  rows: [
    { key: key(), label: 'Q1', color: null, values: ['120'] },
    { key: key(), label: 'Q2', color: null, values: ['180'] },
    { key: key(), label: 'Q3', color: null, values: ['150'] },
    { key: key(), label: 'Q4', color: null, values: ['210'] }
  ]
});

/** A saved chart (API shape) as an editable draft. */
const toDraft = (c) => ({
  id: c.id,
  title: c.title || '',
  description: c.description || '',
  type: c.type,
  colorBy: c.colorBy || 'series',
  options: {
    showValues: !!c.options?.showValues,
    xTitle: c.options?.xTitle || '',
    yTitle: c.options?.yTitle || '',
    valuePrefix: c.options?.valuePrefix || '',
    valueSuffix: c.options?.valueSuffix || ''
  },
  series: c.series.map(s => ({ key: key(), name: s.name, color: s.color || null })),
  rows: c.labels.map((label, i) => ({
    key: key(),
    label,
    color: (c.sliceColors || [])[i] || null,
    values: c.series.map(s => (s.values[i] === null || s.values[i] === undefined ? '' : String(s.values[i])))
  }))
});

/** The draft as a chart definition — what the preview renders and the API stores. */
const toDefinition = (d) => {
  const pie = isPieType(d.type);
  const series = (pie ? d.series.slice(0, 1) : d.series).map((s, si) => ({
    name: s.name.trim() || `Series ${si + 1}`,
    color: s.color,
    values: d.rows.map(r => {
      const raw = (r.values[si] ?? '').toString().trim();
      return raw === '' ? null : Number(raw);
    })
  }));
  return {
    title: d.title.trim(),
    description: d.description.trim(),
    type: d.type,
    labels: d.rows.map(r => r.label.trim()),
    series,
    colorBy: pie ? 'series' : d.colorBy,
    sliceColors: d.rows.map(r => r.color),
    options: d.options
  };
};

/** Problems to fix before saving; empty when the draft is valid. */
const problems = (d) => {
  const list = [];
  const pie = isPieType(d.type);
  if (!d.title.trim()) list.push('Give the chart a title.');
  if (!d.rows.length) list.push('Add at least one category.');
  if (d.rows.some(r => !r.label.trim())) list.push('Every category needs a label.');
  if (pie && d.rows.length > MAX_SLICES) list.push(`A ${d.type} chart can show at most ${MAX_SLICES} slices — use a bar chart for more.`);
  if (!pie && d.colorBy === 'category' && d.rows.length > MAX_SLICES) {
    list.push(`Colouring each bar separately allows at most ${MAX_SLICES} bars.`);
  }
  const used = pie ? d.series.slice(0, 1) : d.series;
  used.forEach((s, si) => d.rows.forEach(r => {
    const raw = (r.values[si] ?? '').toString().trim();
    if (raw !== '' && !Number.isFinite(Number(raw))) list.push(`"${raw}" in ${s.name || `series ${si + 1}`} is not a number.`);
    if (raw !== '' && Number(raw) < 0 && (pie || d.type === 'stacked')) {
      list.push(`${d.type === 'stacked' ? 'Stacked bar' : 'Pie and donut'} charts cannot show negative values.`);
    }
  }));
  return [...new Set(list)];
};

const typeLabel = (id) => CHART_TYPES.find(t => t.id === id)?.label || id;

const ChartBuilder = () => {
  const [charts, setCharts] = useState([]);
  const [draft, setDraft] = useState(null);       // null = list view
  const [notice, setNotice] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const flash = (type, text) => {
    setNotice({ type, text });
    if (type === 'success') setTimeout(() => setNotice(null), 3000);
  };

  const load = () => {
    setLoading(true);
    builderAPI.charts()
      .then(res => setCharts(res.data.data || []))
      .catch(err => flash('error', err.response?.data?.message || 'Could not load charts'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const definition = useMemo(() => (draft ? toDefinition(draft) : null), [draft]);
  const issues = draft ? problems(draft) : [];

  // --- draft editing --------------------------------------------------------

  const set = (patch) => setDraft(d => ({ ...d, ...patch }));
  const setOption = (patch) => setDraft(d => ({ ...d, options: { ...d.options, ...patch } }));
  const setRow = (rk, patch) => setDraft(d => ({ ...d, rows: d.rows.map(r => (r.key === rk ? { ...r, ...patch } : r)) }));
  const setValue = (rk, si, value) => setDraft(d => ({
    ...d,
    rows: d.rows.map(r => (r.key === rk ? { ...r, values: r.values.map((v, i) => (i === si ? value : v)) } : r))
  }));
  const setSeries = (sk, patch) => setDraft(d => ({ ...d, series: d.series.map(s => (s.key === sk ? { ...s, ...patch } : s)) }));

  const addRow = () => setDraft(d => ({
    ...d,
    rows: [...d.rows, { key: key(), label: `Item ${d.rows.length + 1}`, color: null, values: d.series.map(() => '') }]
  }));
  const removeRow = (rk) => setDraft(d => ({ ...d, rows: d.rows.filter(r => r.key !== rk) }));
  const moveRow = (rk, dir) => setDraft(d => {
    const i = d.rows.findIndex(r => r.key === rk);
    const j = i + dir;
    if (j < 0 || j >= d.rows.length) return d;
    const rows = [...d.rows];
    [rows[i], rows[j]] = [rows[j], rows[i]];
    return { ...d, rows };
  });
  const addSeries = () => setDraft(d => ({
    ...d,
    series: [...d.series, { key: key(), name: `Series ${d.series.length + 1}`, color: null }],
    rows: d.rows.map(r => ({ ...r, values: [...r.values, ''] }))
  }));
  const removeSeries = (si) => setDraft(d => ({
    ...d,
    series: d.series.filter((_, i) => i !== si),
    rows: d.rows.map(r => ({ ...r, values: r.values.filter((_, i) => i !== si) }))
  }));
  const resetColors = () => setDraft(d => ({
    ...d,
    series: d.series.map(s => ({ ...s, color: null })),
    rows: d.rows.map(r => ({ ...r, color: null }))
  }));

  // --- persistence ----------------------------------------------------------

  const save = async () => {
    if (issues.length) return flash('error', issues[0]);
    setSaving(true);
    try {
      const res = draft.id
        ? await builderAPI.updateChart(draft.id, definition)
        : await builderAPI.createChart(definition);
      setDraft(toDraft(res.data.data));
      flash('success', `Saved "${res.data.data.title}"`);
      load();
    } catch (err) {
      flash('error', err.response?.data?.message || 'Could not save the chart');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (chart) => {
    if (!window.confirm(`Delete the chart "${chart.title}"? This cannot be undone.`)) return;
    const done = () => {
      flash('success', `Deleted "${chart.title}"`);
      if (draft?.id === chart.id) setDraft(null);
      load();
    };
    try {
      await builderAPI.deleteChart(chart.id);
      done();
    } catch (err) {
      // Still placed on pages: name them and ask again, since those pages
      // would otherwise show an empty widget.
      const pages = err.response?.status === 409 ? err.response.data.pages || [] : null;
      if (!pages) return flash('error', err.response?.data?.message || 'Could not delete the chart');
      const ok = window.confirm(
        `"${chart.title}" is shown on ${pages.length} page${pages.length === 1 ? '' : 's'}: ` +
        `${pages.join(', ')}.\n\nDelete it anyway? Those pages will show "chart no longer available".`);
      if (!ok) return;
      try {
        await builderAPI.deleteChart(chart.id, true);
        done();
      } catch (e2) {
        flash('error', e2.response?.data?.message || 'Could not delete the chart');
      }
    }
  };

  const duplicate = (chart) => {
    const d = toDraft(chart);
    setDraft({ ...d, id: null, title: `${d.title} (copy)` });
    setNotice(null);
  };

  const noticeEl = notice && <div className={`cb-notice ${notice.type}`}>{notice.text}</div>;

  // --- list view ------------------------------------------------------------

  if (!draft) {
    return (
      <div className="cb">
        <div className="cb-head">
          <div>
            <h2>Create Charts</h2>
            <p className="cb-hint">Build pie, donut, bar, line and area charts from your own values and colours.</p>
          </div>
          <button className="cb-btn primary" onClick={() => { setDraft(STARTER()); setNotice(null); }}>
            + New chart
          </button>
        </div>
        {noticeEl}

        {loading ? (
          <div className="cb-empty">Loading charts…</div>
        ) : !charts.length ? (
          <div className="cb-empty">
            No charts yet. Click <b>New chart</b> to create your first one.
          </div>
        ) : (
          <div className="cb-grid">
            {charts.map(c => (
              <div key={c.id} className="cb-card">
                <div className="cb-card-head">
                  <div>
                    <h3>{c.title}</h3>
                    <span className="cb-meta">{typeLabel(c.type)} · updated {c.updated}</span>
                    <span className="cb-meta">
                      {c.usedOn?.length
                        ? `On page${c.usedOn.length === 1 ? '' : 's'}: ${c.usedOn.join(', ')}`
                        : 'Not on any page yet — add it in Page Builder with the “Saved chart” widget'}
                    </span>
                  </div>
                </div>
                <div className="cb-card-preview"><ChartRenderer def={c} /></div>
                <div className="cb-actions">
                  <button className="cb-btn sm" onClick={() => { setDraft(toDraft(c)); setNotice(null); }}>Edit</button>
                  <button className="cb-btn sm" onClick={() => duplicate(c)}>Duplicate</button>
                  <button className="cb-btn sm danger" onClick={() => remove(c)}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // --- editor ---------------------------------------------------------------

  const pie = isPieType(draft.type);
  const singleBar = !pie && draft.series.length === 1 && ['bar', 'hbar'].includes(draft.type);
  const perCategory = pie || (singleBar && draft.colorBy === 'category');
  const sColors = seriesColors(definition);
  const cColors = categoryColors(definition);
  const visibleSeries = pie ? draft.series.slice(0, 1) : draft.series;

  return (
    <div className="cb">
      <div className="cb-head">
        <div>
          <h2>{draft.id ? 'Edit chart' : 'New chart'}</h2>
          <p className="cb-hint">
            Changes show in the preview as you type. Nothing is stored until you save.
            {draft.id && charts.find(c => c.id === draft.id)?.usedOn?.length > 0 &&
              ` Saving updates it on: ${charts.find(c => c.id === draft.id).usedOn.join(', ')}.`}
          </p>
        </div>
        <div className="cb-actions">
          <button className="cb-btn" onClick={() => { setDraft(null); setNotice(null); }}>← Back to charts</button>
          <button className="cb-btn primary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : draft.id ? 'Save changes' : 'Save chart'}
          </button>
        </div>
      </div>
      {noticeEl}

      <div className="cb-workspace">
        <div className="cb-editor">
          <section className="cb-panel">
            <label className="cb-label">Title
              <input value={draft.title} maxLength={150} placeholder="e.g. Quarterly sales"
                     onChange={e => set({ title: e.target.value })} />
            </label>
            <label className="cb-label">Description <span className="cb-optional">optional</span>
              <input value={draft.description} maxLength={500} placeholder="What this chart shows"
                     onChange={e => set({ description: e.target.value })} />
            </label>
          </section>

          <section className="cb-panel">
            <h4>Chart type</h4>
            <div className="cb-types" role="radiogroup" aria-label="Chart type">
              {CHART_TYPES.map(t => (
                <button key={t.id} type="button" role="radio" aria-checked={draft.type === t.id}
                        className={`cb-type ${draft.type === t.id ? 'active' : ''}`}
                        onClick={() => set({ type: t.id })}>
                  <span className="cb-type-icon">{t.icon}</span>{t.label}
                </button>
              ))}
            </div>
            {pie && draft.series.length > 1 && (
              <p className="cb-warn">
                {typeLabel(draft.type)} charts show one set of values, so only
                “{draft.series[0].name}” is used. Your other series are kept if you switch back.
              </p>
            )}
          </section>

          <section className="cb-panel">
            <div className="cb-panel-head">
              <h4>Data</h4>
              <div className="cb-actions">
                {!pie && (
                  <button className="cb-btn sm" onClick={addSeries} disabled={draft.series.length >= MAX_SERIES}
                          title={draft.series.length >= MAX_SERIES ? `At most ${MAX_SERIES} series` : ''}>
                    + Series
                  </button>
                )}
                <button className="cb-btn sm" onClick={addRow}
                        disabled={draft.rows.length >= (pie ? MAX_SLICES : MAX_ROWS)}>
                  + {pie ? 'Slice' : 'Category'}
                </button>
              </div>
            </div>

            <div className="cb-table-wrap">
              <table className="cb-table">
                <thead>
                  <tr>
                    <th>{pie ? 'Slice' : 'Category'}</th>
                    {visibleSeries.map((s, si) => (
                      <th key={s.key}>
                        <div className="cb-series-head">
                          {!perCategory && (
                            <input type="color" className="cb-color" aria-label={`Colour of ${s.name}`}
                                   value={sColors[si]} onChange={e => setSeries(s.key, { color: e.target.value })} />
                          )}
                          <input className="cb-series-name" value={s.name} maxLength={60}
                                 aria-label={`Name of series ${si + 1}`}
                                 onChange={e => setSeries(s.key, { name: e.target.value })} />
                          {!pie && draft.series.length > 1 && (
                            <button className="cb-icon-btn" title="Remove series" onClick={() => removeSeries(si)}>✕</button>
                          )}
                        </div>
                      </th>
                    ))}
                    {perCategory && <th className="cb-col-color">Colour</th>}
                    <th aria-label="Row actions" />
                  </tr>
                </thead>
                <tbody>
                  {draft.rows.map((r, ri) => (
                    <tr key={r.key}>
                      <td>
                        <input value={r.label} maxLength={60} aria-label={`Label of row ${ri + 1}`}
                               onChange={e => setRow(r.key, { label: e.target.value })} />
                      </td>
                      {visibleSeries.map((s, si) => (
                        <td key={s.key}>
                          <input className="cb-num" inputMode="decimal" value={r.values[si] ?? ''}
                                 placeholder="—" aria-label={`${s.name}, ${r.label}`}
                                 onChange={e => setValue(r.key, si, e.target.value)} />
                        </td>
                      ))}
                      {perCategory && (
                        <td className="cb-col-color">
                          <input type="color" className="cb-color" aria-label={`Colour of ${r.label}`}
                                 value={cColors[ri]} onChange={e => setRow(r.key, { color: e.target.value })} />
                        </td>
                      )}
                      <td className="cb-row-actions">
                        <button className="cb-icon-btn" title="Move up" disabled={ri === 0} onClick={() => moveRow(r.key, -1)}>↑</button>
                        <button className="cb-icon-btn" title="Move down" disabled={ri === draft.rows.length - 1} onClick={() => moveRow(r.key, 1)}>↓</button>
                        <button className="cb-icon-btn" title="Remove" disabled={draft.rows.length <= 1} onClick={() => removeRow(r.key)}>✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="cb-hint">Leave a cell empty for “no value”. Lines break at an empty cell instead of dropping to zero.</p>
          </section>

          <section className="cb-panel">
            <div className="cb-panel-head">
              <h4>Colours & options</h4>
              <button className="cb-btn sm" onClick={resetColors}>Reset colours</button>
            </div>
            {singleBar && (
              <label className="cb-check">
                <input type="checkbox" checked={draft.colorBy === 'category'}
                       onChange={e => set({ colorBy: e.target.checked ? 'category' : 'series' })} />
                Colour each bar separately
              </label>
            )}
            <label className="cb-check">
              <input type="checkbox" checked={draft.options.showValues}
                     onChange={e => setOption({ showValues: e.target.checked })} />
              Show values on the chart
            </label>
            {!pie && (
              <div className="cb-row2">
                <label className="cb-label">{draft.type === 'hbar' ? 'Value axis title' : 'X-axis title'}
                  <input value={draft.options.xTitle} maxLength={60} placeholder="e.g. Quarter"
                         onChange={e => setOption({ xTitle: e.target.value })} />
                </label>
                {draft.type !== 'hbar' && (
                  <label className="cb-label">Y-axis title
                    <input value={draft.options.yTitle} maxLength={60} placeholder="e.g. Sales"
                           onChange={e => setOption({ yTitle: e.target.value })} />
                  </label>
                )}
              </div>
            )}
            <div className="cb-row2">
              <label className="cb-label">Value prefix
                <input value={draft.options.valuePrefix} maxLength={5} placeholder="e.g. ₹"
                       onChange={e => setOption({ valuePrefix: e.target.value })} />
              </label>
              <label className="cb-label">Value suffix
                <input value={draft.options.valueSuffix} maxLength={10} placeholder="e.g. % or pcs"
                       onChange={e => setOption({ valueSuffix: e.target.value })} />
              </label>
            </div>
          </section>
        </div>

        <aside className="cb-preview">
          <div className="cb-preview-card">
            <h3>{draft.title.trim() || 'Untitled chart'}</h3>
            {draft.description.trim() && <p className="cb-hint">{draft.description}</p>}
            <ChartRenderer def={definition} />
          </div>
          {issues.length > 0 && (
            <ul className="cb-issues">
              {issues.map(i => <li key={i}>{i}</li>)}
            </ul>
          )}
        </aside>
      </div>
    </div>
  );
};

export default ChartBuilder;
