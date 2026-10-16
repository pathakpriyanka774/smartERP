import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import './Drawer.css';

/**
 * A right-hand slide-over panel for forms and details.
 * Escape or the backdrop closes it (unless `busy`); focus moves into the panel
 * on open and back to whatever had it on close.
 */
export default function Drawer({ title, subtitle, onClose, busy = false, width = 560, children }) {
  const panel = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    const first = panel.current?.querySelector('input, select, textarea, button:not(.drawer-close)');
    (first || panel.current)?.focus();
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onClose(); };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      if (previous && previous.focus) previous.focus();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return createPortal(
    <div className="drawer-root">
      <div className="drawer-backdrop" onClick={() => !busy && onClose()} aria-hidden="true" />
      <aside className="drawer-panel" role="dialog" aria-modal="true" aria-label={title}
        ref={panel} tabIndex={-1} style={{ '--drawer-width': `${width}px` }}>
        <header className="drawer-head">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button type="button" className="drawer-close" onClick={onClose} disabled={busy} aria-label="Close">×</button>
        </header>
        <div className="drawer-body">{children}</div>
      </aside>
    </div>,
    document.body
  );
}
