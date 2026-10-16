import React, { useState } from 'react';
import { CATEGORICAL, OTHER, SERIES, INK, foldCategories } from './palette';

/**
 * Charts for the page builder: bar, horizontal bar, line and donut.
 *
 * Rendered as inline SVG rather than pulling in a charting library — the shapes
 * are simple, and it keeps the dependency surface (and the audit surface) small.
 */

const fmt = (n) => {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 1e7) return `${(v / 1e7).toFixed(1)}Cr`;   // Indian numbering
  if (Math.abs(v) >= 1e5) return `${(v / 1e5).toFixed(1)}L`;
  if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
};

const Tooltip = ({ x, y, label, value }) => (
  <div className="pb-chart-tip" style={{ left: x, top: y }}>
    <strong>{label}</strong>
    <span>{fmt(value)}</span>
  </div>
);

/** Data as a table — the accessible equivalent of every chart here. */
const DataTable = ({ data, valueLabel }) => (
  <table className="pb-chart-table">
    <thead><tr><th>Category</th><th>{valueLabel || 'Value'}</th></tr></thead>
    <tbody>
      {data.map((d, i) => (
        <tr key={i}><td>{d.label}</td><td>{fmt(d.value)}</td></tr>
      ))}
    </tbody>
  </table>
);

const BarChart = ({ data, horizontal, onHover }) => {
  const W = 100, H = horizontal ? Math.max(data.length * 34 + 10, 80) : 180;
  const max = Math.max(...data.map(d => d.value), 1);

  if (horizontal) {
    const rowH = 30, barH = 16;
    return (
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="pb-svg" role="img">
        {data.map((d, i) => {
          const w = (d.value / max) * 68;
          return (
            <g key={i} onMouseEnter={e => onHover(e, d)} onMouseLeave={() => onHover(null)}>
              {/* Invisible full-width target: the bar itself is a thin hit area. */}
              <rect x="0" y={i * rowH} width={W} height={rowH} fill="transparent" />
              <rect x="30" y={i * rowH + (rowH - barH) / 2} width={Math.max(w, 0.5)} height={barH}
                    rx="2" fill={SERIES} />
            </g>
          );
        })}
      </svg>
    );
  }

  const slot = W / data.length;
  const barW = Math.min(slot * 0.6, 14);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="pb-svg" role="img">
      {[0.25, 0.5, 0.75, 1].map(f => (
        <line key={f} x1="0" x2={W} y1={H - f * (H - 24)} y2={H - f * (H - 24)}
              stroke={INK.grid} strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
      ))}
      {data.map((d, i) => {
        const h = (d.value / max) * (H - 30);
        return (
          <g key={i} onMouseEnter={e => onHover(e, d)} onMouseLeave={() => onHover(null)}>
            <rect x={i * slot} y="0" width={slot} height={H} fill="transparent" />
            <rect x={i * slot + (slot - barW) / 2} y={H - 6 - h} width={barW}
                  height={Math.max(h, 0.5)} rx="2" fill={SERIES} />
          </g>
        );
      })}
      <line x1="0" x2={W} y1={H - 6} y2={H - 6} stroke={INK.axis} strokeWidth="0.5"
            vectorEffect="non-scaling-stroke" />
    </svg>
  );
};

const LineChart = ({ data, onHover }) => {
  const W = 100, H = 180;
  const max = Math.max(...data.map(d => d.value), 1);
  const step = data.length > 1 ? W / (data.length - 1) : W;
  const y = v => H - 10 - (v / max) * (H - 30);
  const points = data.map((d, i) => [i * step, y(d.value)]);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="pb-svg" role="img">
      {[0.25, 0.5, 0.75, 1].map(f => (
        <line key={f} x1="0" x2={W} y1={H - 10 - f * (H - 30)} y2={H - 10 - f * (H - 30)}
              stroke={INK.grid} strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
      ))}
      <polyline points={points.map(p => p.join(',')).join(' ')} fill="none" stroke={SERIES}
                strokeWidth="2" vectorEffect="non-scaling-stroke"
                strokeLinejoin="round" strokeLinecap="round" />
      {points.map(([px, py], i) => (
        <g key={i} onMouseEnter={e => onHover(e, data[i])} onMouseLeave={() => onHover(null)}>
          <rect x={px - step / 2} y="0" width={step} height={H} fill="transparent" />
          {/* 2px surface ring keeps markers legible where the line passes behind them. */}
          <circle cx={px} cy={py} r="3" fill={SERIES} stroke={INK.surface} strokeWidth="1.5"
                  vectorEffect="non-scaling-stroke" />
        </g>
      ))}
    </svg>
  );
};

const DonutChart = ({ data, onHover }) => {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const R = 42, r = 26, C = 50;
  let angle = -Math.PI / 2;

  const arc = (from, to) => {
    const large = to - from > Math.PI ? 1 : 0;
    const p = (rad, radius) => [C + radius * Math.cos(rad), C + radius * Math.sin(rad)];
    const [x1, y1] = p(from, R), [x2, y2] = p(to, R);
    const [x3, y3] = p(to, r), [x4, y4] = p(from, r);
    return `M${x1},${y1} A${R},${R} 0 ${large} 1 ${x2},${y2} L${x3},${y3} A${r},${r} 0 ${large} 0 ${x4},${y4} Z`;
  };

  return (
    <svg viewBox="0 0 100 100" className="pb-svg pb-svg-square" role="img">
      {data.map((d, i) => {
        const sweep = (d.value / total) * Math.PI * 2;
        const from = angle;
        angle += sweep;
        return (
          <path key={i} d={arc(from, angle)}
                fill={d.isOther ? OTHER : CATEGORICAL[i % CATEGORICAL.length]}
                stroke={INK.surface} strokeWidth="1.5"
                onMouseEnter={e => onHover(e, d)} onMouseLeave={() => onHover(null)} />
        );
      })}
      <text x="50" y="49" textAnchor="middle" fontSize="9" fontWeight="600" fill={INK.primary}>
        {fmt(total)}
      </text>
      <text x="50" y="57" textAnchor="middle" fontSize="4.5" fill={INK.muted}>TOTAL</text>
    </svg>
  );
};

const Chart = ({ type = 'bar', data = [], valueLabel, height }) => {
  const [tip, setTip] = useState(null);
  const [showTable, setShowTable] = useState(false);

  const onHover = (e, d) => {
    if (!e || !d) return setTip(null);
    const box = e.currentTarget.ownerSVGElement.getBoundingClientRect();
    setTip({ x: e.clientX - box.left + 12, y: e.clientY - box.top - 8, label: d.label, value: d.value });
  };

  if (!data.length) return <div className="pb-chart-empty">No data for this selection</div>;

  const rows = type === 'donut' ? foldCategories(data) : data;
  const isHorizontal = type === 'hbar';

  return (
    <div className="pb-chart">
      <div className="pb-chart-body" style={height ? { height } : undefined}>
        {showTable ? (
          <DataTable data={rows} valueLabel={valueLabel} />
        ) : (
          <>
            {(type === 'bar' || type === 'hbar') && <BarChart data={rows} horizontal={isHorizontal} onHover={onHover} />}
            {type === 'line' && <LineChart data={rows} onHover={onHover} />}
            {type === 'donut' && <DonutChart data={rows} onHover={onHover} />}
            {tip && <Tooltip {...tip} />}
          </>
        )}
      </div>

      {/* Categories are named in text, so identity never rests on colour alone. */}
      {type === 'donut' ? (
        <ul className="pb-chart-legend">
          {rows.map((d, i) => (
            <li key={i}>
              <span className="swatch" style={{ background: d.isOther ? OTHER : CATEGORICAL[i % CATEGORICAL.length] }} />
              {d.label} <b>{fmt(d.value)}</b>
            </li>
          ))}
        </ul>
      ) : (
        <ul className={`pb-chart-axis ${isHorizontal ? 'vertical' : ''}`}>
          {rows.map((d, i) => (
            <li key={i} title={`${d.label}: ${fmt(d.value)}`}>
              <span className="cat">{d.label}</span>
              <span className="val">{fmt(d.value)}</span>
            </li>
          ))}
        </ul>
      )}

      <button className="pb-chart-toggle" onClick={() => setShowTable(!showTable)}>
        {showTable ? 'Show chart' : 'Show data table'}
      </button>
    </div>
  );
};

export default Chart;
