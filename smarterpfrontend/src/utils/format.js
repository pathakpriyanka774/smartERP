/**
 * Shared formatting for amounts, numbers and dates.
 *
 * One place, so every screen shows money the same way: Indian rupees with
 * Indian digit grouping (₹12,34,567.50), and dates in the business time zone
 * (IST). Screens used to hard-code "$" and US formats.
 */
export const CURRENCY = 'INR';
export const LOCALE = 'en-IN';
export const TIME_ZONE = 'Asia/Kolkata';

const toNumber = (v) => (v === null || v === undefined || v === '' ? null : Number(v));

/** ₹12,34,567.50 — or "—" for no value. */
export const formatMoney = (value, { decimals = 2 } = {}) => {
  const n = toNumber(value);
  if (n === null || Number.isNaN(n)) return '—';
  return new Intl.NumberFormat(LOCALE, {
    style: 'currency', currency: CURRENCY, minimumFractionDigits: decimals, maximumFractionDigits: decimals
  }).format(n);
};

/** Compact rupees for KPI tiles: ₹1.2L, ₹3.4Cr, ₹12.5k. */
export const formatMoneyCompact = (value) => {
  const n = toNumber(value);
  if (n === null || Number.isNaN(n)) return '—';
  const a = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (a >= 1e7) return `${sign}₹${(a / 1e7).toFixed(2)}Cr`;
  if (a >= 1e5) return `${sign}₹${(a / 1e5).toFixed(2)}L`;
  if (a >= 1e3) return `${sign}₹${(a / 1e3).toFixed(1)}k`;
  return formatMoney(n, { decimals: 0 });
};

/** 12,34,567 (Indian grouping), up to 2 decimals. */
export const formatNumber = (value, { decimals = 2 } = {}) => {
  const n = toNumber(value);
  if (n === null || Number.isNaN(n)) return '—';
  return new Intl.NumberFormat(LOCALE, { maximumFractionDigits: decimals }).format(n);
};

export const formatPercent = (value, decimals = 1) => {
  const n = toNumber(value);
  if (n === null || Number.isNaN(n)) return '—';
  return `${n.toFixed(decimals)}%`;
};

/** 09 Oct 2026 — accepts YYYY-MM-DD or ISO strings. */
export const formatDate = (value) => {
  if (!value) return '—';
  const s = String(value);
  // A bare date is a calendar day, not an instant: never shift it by time zone.
  const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00Z`) : new Date(s);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(LOCALE, {
    day: '2-digit', month: 'short', year: 'numeric',
    timeZone: /^\d{4}-\d{2}-\d{2}$/.test(s) ? 'UTC' : TIME_ZONE
  }).format(d);
};

/** 09 Oct 2026, 14:05 IST */
export const formatDateTime = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(LOCALE, {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TIME_ZONE
  }).format(d);
};

/** Today's date in IST as YYYY-MM-DD (toISOString would give the UTC date). */
export const todayIST = () => {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date()).reduce((acc, x) => ({ ...acc, [x.type]: x.value }), {});
  return `${p.year}-${p.month}-${p.day}`;
};

/** The current month in IST as YYYY-MM. */
export const monthIST = () => todayIST().slice(0, 7);

/** "Sep 2026" from "2026-09". */
export const formatMonth = (ym) => {
  if (!/^\d{4}-\d{2}$/.test(ym || '')) return ym || '—';
  return new Intl.DateTimeFormat(LOCALE, { month: 'short', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${ym}-01T00:00:00Z`));
};

/** The message the server sent with an error, or a fallback. */
export const errorMessage = (err, fallback = 'Something went wrong') =>
  err?.response?.data?.message || err?.response?.data?.error || (err?.message === 'Network Error'
    ? 'Cannot reach the server. Check your connection and try again.'
    : fallback);

/**
 * Download rows as a CSV file (opens in Excel). `columns` is a list of
 * { key, label } or [key, label]; values are quoted so commas and quotes survive.
 */
export const downloadCsv = (filename, rows, columns) => {
  const cols = columns.map(c => (Array.isArray(c) ? { key: c[0], label: c[1] } : c));
  const cell = (v) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [cols.map(c => cell(c.label)).join(','), ...rows.map(r => cols.map(c => cell(
    typeof c.key === 'function' ? c.key(r) : r[c.key])).join(','))];
  // BOM so Excel opens UTF-8 (₹, non-English names) correctly.
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};
