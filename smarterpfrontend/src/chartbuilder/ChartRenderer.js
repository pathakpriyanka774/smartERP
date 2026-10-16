import React, { useRef, useState } from 'react';
import { INK, chartDefaultColor } from '../pagebuilder/palette';
import './ChartRenderer.css';

/**
 * Renders a Create Charts definition: bar, horizontal bar, stacked bar, line,
 * area, pie and donut.
 *
 * Inline SVG, like the page-builder charts, rather than a charting library.
 * The geometry follows the dataviz mark specs: bars at most 24px thick with a
 * 4px rounded data-end and a square baseline, 2px lines, 8px markers with a
 * 2px surface ring, a 2px surface gap between touching fills, hairline
 * recessive grid, and text in ink tokens — never in the series colour.
 */

export const CHART_TYPES = [
  { id: 'bar', label: 'Bar', icon: '📊' },
  { id: 'hbar', label: 'Horizontal bar', icon: '📶' },
  { id: 'stacked', label: 'Stacked bar', icon: '🧱' },
  { id: 'line', label: 'Line', icon: '📈' },
  { id: 'area', label: 'Area', icon: '🏔️' },
  { id: 'pie', label: 'Pie', icon: '🥧' },
  { id: 'donut', label: 'Donut', icon: '🍩' }
];

export const isPieType = (type) => type === 'pie' || type === 'donut';

const W = 640;               // viewBox width; the SVG scales to its container
const BAR_MAX = 24;          // px — bars never fill their slot
const GAP = 2;               // px surface gap between touching marks

/** Resolved colour of each series (cartesian charts). */
export const seriesColors = (def) =>
  def.series.map((s, i) => s.color || chartDefaultColor(i, def.series.length));

/** Resolved colour of each category (pie/donut, or bars coloured per category). */
export const categoryColors = (def) =>
  def.labels.map((_, i) =>
    (def.sliceColors || [])[i] || chartDefaultColor(i, def.labels.length, isPieType(def.type)));

/** Whether this definition colours by category rather than by series. */
export const usesCategoryColors = (def) =>
  isPieType(def.type) ||
  (def.colorBy === 'category' && def.series.length === 1 && ['bar', 'hbar'].includes(def.type));

const makeFormatter = (options = {}) => (v) => {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  const n = Number(v);
  // Indian digit grouping: 12,34,567.
  const body = n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
  return `${options.valuePrefix || ''}${body}${options.valueSuffix || ''}`;
};

/** Axis ticks on round numbers covering [min, max]. */
const niceTicks = (min, max, count = 5) => {
  if (min === max) { max = min + 1; }
  const span = max - min;
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => span / s <= count) || 10 * mag;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks = [];
  for (let t = lo; t <= hi + step / 2; t += step) ticks.push(Number(t.toFixed(10)));
  return ticks;
};

/** Short axis tick text: 1.2L, 3.4Cr, 12k. */
const compact = (v) => {
  const a = Math.abs(v);
  if (a >= 1e7) return `${+(v / 1e7).toFixed(1)}Cr`;
  if (a >= 1e5) return `${+(v / 1e5).toFixed(1)}L`;
  if (a >= 1e3) return `${+(v / 1e3).toFixed(1)}k`;
  return String(+v.toFixed(2));
};

/**
 * A bar with a 4px rounded data-end and a square baseline end. `end` is the
 * side the data grows toward: 'top', 'bottom', 'right' or 'left'.
 */
const barPath = (x, y, w, h, end) => {
  const r = Math.min(4, w / 2, h / 2);
  if (w <= 0 || h <= 0) return '';
  switch (end) {
    case 'top':
      return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
    case 'bottom':
      return `M${x},${y} V${y + h - r} Q${x},${y + h} ${x + r},${y + h} H${x + w - r} Q${x + w},${y + h} ${x + w},${y + h - r} V${y} Z`;
    case 'right':
      return `M${x},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h - r} Q${x + w},${y + h} ${x + w - r},${y + h} H${x} Z`;
    default: // left
      return `M${x + w},${y} H${x + r} Q${x},${y} ${x},${y + r} V${y + h - r} Q${x},${y + h} ${x + r},${y + h} H${x + w} Z`;
  }
};

// ---------------------------------------------------------------------------
// Cartesian: bar, hbar, stacked, line, area
// ---------------------------------------------------------------------------

const Cartesian = ({ def, fmt, onHover }) => {
  const { type, labels, series, options = {} } = def;
  const horizontal = type === 'hbar';
  const stacked = type === 'stacked';
  const isLine = type === 'line' || type === 'area';
  const sColors = seriesColors(def);
  const cColors = usesCategoryColors(def) ? categoryColors(def) : null;

  // Value extent: stacked bars stack, everything else plots raw values.
  const values = stacked
    ? labels.map((_, i) => series.reduce((sum, s) => sum + (s.values[i] || 0), 0))
    : series.flatMap(s => s.values.filter(v => v !== null));
  const vMin = Math.min(0, ...values);
  const vMax = Math.max(0, ...values);
  const ticks = niceTicks(vMin, vMax);
  const tMin = ticks[0], tMax = ticks[ticks.length - 1];

  const longest = Math.max(...labels.map(l => l.length), 1);
  const M = horizontal
    ? { top: 12, right: 24, bottom: options.xTitle ? 52 : 34, left: Math.min(150, 16 + longest * 7) }
    : { top: 16, right: 16, bottom: options.xTitle ? 64 : 46, left: options.yTitle ? 70 : 54 };
  const H = horizontal ? Math.max(200, labels.length * 34 + M.top + M.bottom) : 340;
  const pw = W - M.left - M.right;
  const ph = H - M.top - M.bottom;

  // Value scale runs along y (columns) or x (horizontal bars).
  const vLen = horizontal ? pw : ph;
  const scale = (v) => ((v - tMin) / (tMax - tMin)) * vLen;
  const zero = scale(0);
  const band = (horizontal ? ph : pw) / labels.length;

  const valueAxis = ticks.map(t => {
    const p = scale(t);
    return horizontal ? (
      <g key={t}>
        <line x1={M.left + p} x2={M.left + p} y1={M.top} y2={M.top + ph} stroke={INK.grid} strokeWidth="1" />
        <text x={M.left + p} y={M.top + ph + 16} textAnchor="middle" className="cr-tick">{compact(t)}</text>
      </g>
    ) : (
      <g key={t}>
        <line x1={M.left} x2={M.left + pw} y1={M.top + ph - p} y2={M.top + ph - p} stroke={INK.grid} strokeWidth="1" />
        <text x={M.left - 8} y={M.top + ph - p + 4} textAnchor="end" className="cr-tick">{compact(t)}</text>
      </g>
    );
  });

  // Category labels: thinned when they would collide, so text never overlaps.
  const every = horizontal ? 1 : Math.max(1, Math.ceil((longest * 6.5) / band));
  const categoryAxis = labels.map((l, i) => {
    if (i % every !== 0) return null;
    const c = (i + 0.5) * band;
    return horizontal ? (
      <text key={i} x={M.left - 8} y={M.top + c + 4} textAnchor="end" className="cr-cat">{l}</text>
    ) : (
      <text key={i} x={M.left + c} y={M.top + ph + 18} textAnchor="middle" className="cr-cat">{l}</text>
    );
  });

  const marks = [];
  const valueLabels = [];

  if (!isLine) {
    const nGroup = stacked ? 1 : series.length;
    // Bars capped at 24px; touching bars in a group are separated by the 2px gap.
    const barW = Math.min(BAR_MAX, (band * 0.72 - GAP * (nGroup - 1)) / nGroup);
    const groupW = barW * nGroup + GAP * (nGroup - 1);

    labels.forEach((_, i) => {
      const start = i * band + (band - groupW) / 2;
      let stackPos = 0;   // running stack height, in px from zero
      series.forEach((s, si) => {
        const v = s.values[i];
        if (v === null || v === undefined) return;
        const color = cColors ? cColors[i] : sColors[si];
        const offset = stacked ? start : start + si * (barW + GAP);
        const isTop = stacked && series.slice(si + 1).every(n => !n.values[i]);
        let len = Math.abs(scale(v) - zero);
        let from = v >= 0 ? zero : zero - len;
        if (stacked) {
          from = zero + stackPos;
          stackPos += len;
          // The surface gap between stacked segments comes out of the segment.
          if (!isTop && len > GAP) len -= GAP;
        }
        const end = stacked && !isTop ? null : (v >= 0 ? (horizontal ? 'right' : 'top') : (horizontal ? 'left' : 'bottom'));
        const d = horizontal
          ? barPath(M.left + from, M.top + offset, len, barW, end || 'none')
          : barPath(M.left + offset, M.top + ph - from - len, barW, len, end || 'none');
        const square = horizontal
          ? `M${M.left + from},${M.top + offset} h${len} v${barW} h${-len} Z`
          : `M${M.left + offset},${M.top + ph - from - len} h${barW} v${len} h${-barW} Z`;
        marks.push(<path key={`${si}-${i}`} d={end ? d : square} fill={color} />);

        if (options.showValues && (!stacked || isTop)) {
          // A stack is labelled once, with its total, at the top segment.
          const shown = stacked ? series.reduce((sum, n) => sum + (n.values[i] || 0), 0) : v;
          const tip = from + (stacked ? len + GAP : len);
          valueLabels.push(horizontal ? (
            <text key={`v${si}-${i}`} x={M.left + (v >= 0 ? tip + 6 : from - 6)} y={M.top + offset + barW / 2 + 4}
                  textAnchor={v >= 0 ? 'start' : 'end'} className="cr-value">{fmt(shown)}</text>
          ) : (
            <text key={`v${si}-${i}`} x={M.left + offset + barW / 2}
                  y={v >= 0 ? M.top + ph - tip - 6 : M.top + ph - from + 14}
                  textAnchor="middle" className="cr-value">{fmt(shown)}</text>
          ));
        }
      });
    });
  } else {
    series.forEach((s, si) => {
      const color = sColors[si];
      const pts = s.values.map((v, i) =>
        v === null || v === undefined ? null : [M.left + (i + 0.5) * band, M.top + ph - scale(v)]);
      // A missing value breaks the line rather than being drawn as zero.
      const runs = [];
      let run = [];
      pts.forEach(p => { if (p) run.push(p); else if (run.length) { runs.push(run); run = []; } });
      if (run.length) runs.push(run);

      runs.forEach((r, ri) => {
        const line = r.map(p => p.join(',')).join(' ');
        if (type === 'area' && r.length > 1) {
          const base = M.top + ph - zero;
          marks.push(
            <polygon key={`a${si}-${ri}`} fill={color} fillOpacity="0.1"
                     points={`${r[0][0]},${base} ${line} ${r[r.length - 1][0]},${base}`} />
          );
        }
        marks.push(
          <polyline key={`l${si}-${ri}`} points={line} fill="none" stroke={color}
                    strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        );
      });
      pts.forEach((p, i) => p && marks.push(
        <circle key={`m${si}-${i}`} cx={p[0]} cy={p[1]} r="4" fill={color}
                stroke={INK.surface} strokeWidth="2" />
      ));

      // Selective labels: the end value of each line, not a number per point.
      const last = [...pts].reverse().find(Boolean);
      if (options.showValues && last) {
        const v = s.values[pts.lastIndexOf(last)];
        valueLabels.push(
          <text key={`ve${si}`} x={last[0]} y={last[1] - 10} textAnchor="middle" className="cr-value">{fmt(v)}</text>
        );
      }
    });
  }

  // One hover target per category, the full height of its band — far bigger
  // than the marks, so small bars and dots are easy to hit.
  const targets = labels.map((l, i) => (
    <rect key={`h${i}`} fill="transparent"
          {...(horizontal
            ? { x: M.left, y: M.top + i * band, width: pw, height: band }
            : { x: M.left + i * band, y: M.top, width: band, height: ph })}
          onMouseMove={e => onHover(e, i)} onMouseLeave={() => onHover(null)} />
  ));

  const baseline = horizontal
    ? <line x1={M.left + zero} x2={M.left + zero} y1={M.top} y2={M.top + ph} stroke={INK.axis} strokeWidth="1" />
    : <line x1={M.left} x2={M.left + pw} y1={M.top + ph - zero} y2={M.top + ph - zero} stroke={INK.axis} strokeWidth="1" />;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="cr-svg" role="img"
         aria-label={`${def.title || 'Chart'}: ${type} chart of ${labels.length} categories`}>
      {valueAxis}
      {baseline}
      {marks}
      {valueLabels}
      {categoryAxis}
      {options.xTitle && (
        <text x={M.left + pw / 2} y={H - 8} textAnchor="middle" className="cr-axis-title">{options.xTitle}</text>
      )}
      {options.yTitle && !horizontal && (
        <text transform={`translate(16 ${M.top + ph / 2}) rotate(-90)`} textAnchor="middle"
              className="cr-axis-title">{options.yTitle}</text>
      )}
      {targets}
    </svg>
  );
};

// ---------------------------------------------------------------------------
// Pie & donut
// ---------------------------------------------------------------------------

const Pie = ({ def, fmt, onHover }) => {
  const values = def.series[0].values.map(v => Math.max(0, v || 0));
  const total = values.reduce((a, b) => a + b, 0);
  const colors = categoryColors(def);
  const donut = def.type === 'donut';
  const S = 320, C = S / 2, R = 140, r = donut ? 84 : 0;

  if (!total) return <div className="cr-empty">All values are zero — nothing to draw yet.</div>;

  const point = (a, rad) => [C + rad * Math.cos(a), C + rad * Math.sin(a)];
  let angle = -Math.PI / 2;
  const slices = values.map((v, i) => {
    const sweep = (v / total) * Math.PI * 2;
    const from = angle;
    angle += sweep;
    if (!v) return null;
    // A single slice is a full ring; an arc from a point to itself draws nothing.
    if (sweep >= Math.PI * 2 - 1e-6) {
      return (
        <g key={i} onMouseMove={e => onHover(e, i)} onMouseLeave={() => onHover(null)}>
          <circle cx={C} cy={C} r={R} fill={colors[i]} />
          {donut && <circle cx={C} cy={C} r={r} fill={INK.surface} />}
        </g>
      );
    }
    const large = sweep > Math.PI ? 1 : 0;
    const [x1, y1] = point(from, R), [x2, y2] = point(angle, R);
    const d = donut
      ? (() => {
          const [x3, y3] = point(angle, r), [x4, y4] = point(from, r);
          return `M${x1},${y1} A${R},${R} 0 ${large} 1 ${x2},${y2} L${x3},${y3} A${r},${r} 0 ${large} 0 ${x4},${y4} Z`;
        })()
      : `M${C},${C} L${x1},${y1} A${R},${R} 0 ${large} 1 ${x2},${y2} Z`;
    // The 2px surface-coloured stroke is the gap between neighbouring slices.
    return (
      <path key={i} d={d} fill={colors[i]} stroke={INK.surface} strokeWidth={GAP}
            strokeLinejoin="round" onMouseMove={e => onHover(e, i)} onMouseLeave={() => onHover(null)} />
    );
  });

  return (
    <svg viewBox={`0 0 ${S} ${S}`} className="cr-svg cr-svg-pie" role="img"
         aria-label={`${def.title || 'Chart'}: ${def.type} chart of ${def.labels.length} slices`}>
      {slices}
      {donut && (
        <>
          <text x={C} y={C - 2} textAnchor="middle" className="cr-total">{fmt(total)}</text>
          <text x={C} y={C + 18} textAnchor="middle" className="cr-total-label">TOTAL</text>
        </>
      )}
    </svg>
  );
};

// ---------------------------------------------------------------------------
// Frame: tooltip, legend, table view
// ---------------------------------------------------------------------------

const ChartRenderer = ({ def }) => {
  const box = useRef(null);
  const [tip, setTip] = useState(null);
  const [table, setTable] = useState(false);

  const fmt = makeFormatter(def.options);
  const pie = isPieType(def.type);
  const series = pie ? def.series.slice(0, 1) : def.series;
  const view = { ...def, series };

  const hasData = def.labels.length && series.length &&
    series.some(s => s.values.some(v => v !== null && v !== undefined));

  const onHover = (e, i) => {
    if (!e) return setTip(null);
    const b = box.current.getBoundingClientRect();
    setTip({ i, x: e.clientX - b.left, y: e.clientY - b.top });
  };

  const sColors = seriesColors(view);
  const cColors = categoryColors(view);
  const byCategory = usesCategoryColors(view);
  const total = pie ? series[0].values.reduce((a, v) => a + Math.max(0, v || 0), 0) : 0;
  const pct = (v) => (total ? ` (${((Math.max(0, v || 0) / total) * 100).toFixed(1)}%)` : '');

  // Legend whenever identity needs one: every pie, any chart with two or more
  // series, and bars coloured per category. A single series is named by the
  // title, so a one-swatch legend would only restate it.
  const legend = pie || byCategory
    ? def.labels.map((l, i) => ({ key: i, color: cColors[i], text: l, value: pie ? fmt(series[0].values[i]) + pct(series[0].values[i]) : null }))
    : series.length > 1
      ? series.map((s, i) => ({ key: i, color: sColors[i], text: s.name }))
      : [];

  return (
    <div className="cr-frame">
      <div className="cr-plot" ref={box}>
        {!hasData ? (
          <div className="cr-empty">Enter some values to see the chart.</div>
        ) : table ? (
          <table className="cr-table">
            <thead>
              <tr>
                <th>{def.options?.xTitle || 'Category'}</th>
                {series.map((s, i) => <th key={i}>{s.name}</th>)}
              </tr>
            </thead>
            <tbody>
              {def.labels.map((l, i) => (
                <tr key={i}>
                  <td>{l}</td>
                  {series.map((s, si) => <td key={si}>{fmt(s.values[i])}{pie ? pct(s.values[i]) : ''}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        ) : pie ? (
          <Pie def={view} fmt={fmt} onHover={onHover} />
        ) : (
          <Cartesian def={view} fmt={fmt} onHover={onHover} />
        )}

        {tip && !table && hasData && (
          <div className="cr-tip" style={{ left: tip.x + 14, top: tip.y + 10 }}>
            <strong>{def.labels[tip.i]}</strong>
            {series.map((s, si) => (
              <span key={si} className="cr-tip-row">
                <i style={{ background: byCategory ? cColors[tip.i] : sColors[si] }} />
                {series.length > 1 && <em>{s.name}</em>}
                <b>{fmt(s.values[tip.i])}{pie ? pct(s.values[tip.i]) : ''}</b>
              </span>
            ))}
          </div>
        )}
      </div>

      {legend.length > 0 && !table && (
        <ul className="cr-legend">
          {legend.map(item => (
            <li key={item.key}>
              <span className="cr-swatch" style={{ background: item.color }} />
              {item.text}
              {item.value && <b>{item.value}</b>}
            </li>
          ))}
        </ul>
      )}

      {hasData && (
        <button type="button" className="cr-toggle" onClick={() => setTable(!table)}>
          {table ? 'Show chart' : 'Show data table'}
        </button>
      )}
    </div>
  );
};

export default ChartRenderer;
