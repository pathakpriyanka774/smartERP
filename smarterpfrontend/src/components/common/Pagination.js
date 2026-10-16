import React from 'react';
import './Pagination.css';
import { formatNumber } from '../../utils/format';

/**
 * Page controls for a server-paginated list.
 *   <Pagination pagination={list.pagination} onPage={list.setPage} disabled={list.loading} />
 */
export default function Pagination({ pagination, onPage, disabled = false, label = 'records' }) {
  if (!pagination) return null;
  const { page, pageSize, total, totalPages } = pagination;
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);
  return (
    <nav className="pager" aria-label="Pagination">
      <span className="pager-info">
        {total === 0 ? `No ${label}` : `${formatNumber(first, { decimals: 0 })}–${formatNumber(last, { decimals: 0 })} of ${formatNumber(total, { decimals: 0 })} ${label}`}
      </span>
      <div className="pager-buttons">
        <button type="button" onClick={() => onPage(1)} disabled={disabled || page <= 1} aria-label="First page">«</button>
        <button type="button" onClick={() => onPage(page - 1)} disabled={disabled || page <= 1} aria-label="Previous page">‹ Prev</button>
        <span className="pager-page" aria-current="page">Page {page} of {totalPages}</span>
        <button type="button" onClick={() => onPage(page + 1)} disabled={disabled || page >= totalPages} aria-label="Next page">Next ›</button>
        <button type="button" onClick={() => onPage(totalPages)} disabled={disabled || page >= totalPages} aria-label="Last page">»</button>
      </div>
    </nav>
  );
}

/** A search box for the same lists. */
export function SearchBox({ value, onChange, placeholder = 'Search…', label = 'Search' }) {
  return (
    <input
      type="search"
      className="pager-search"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={label}
    />
  );
}
