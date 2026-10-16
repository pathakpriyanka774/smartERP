import React, { useEffect, useRef, useState } from 'react';
import './RowMenu.css';

/**
 * A small "More ▾" menu for row actions. Positioned against the window, so the
 * scrolling table cannot clip it; closes on outside click, Escape or scroll.
 */
const RowMenu = ({ label, items, disabled, buttonText = 'More ▾' }) => {
  const [pos, setPos] = useState(null);
  const ref = useRef(null);
  const toggleRef = useRef(null);
  const open = pos !== null;
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setPos(null); };
    const esc = (e) => { if (e.key === 'Escape') { setPos(null); toggleRef.current?.focus(); } };
    const dismiss = () => setPos(null);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    window.addEventListener('scroll', dismiss, true);
    window.addEventListener('resize', dismiss);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
      window.removeEventListener('scroll', dismiss, true);
      window.removeEventListener('resize', dismiss);
    };
  }, [open]);
  const toggle = () => {
    if (open) return setPos(null);
    const r = toggleRef.current.getBoundingClientRect();
    const width = 180;
    const below = window.innerHeight - r.bottom > 40 * items.length + 20;
    setPos({
      left: Math.max(8, Math.min(r.right - width, window.innerWidth - width - 8)),
      ...(below ? { top: r.bottom + 4 } : { bottom: window.innerHeight - r.top + 4 }),
      width
    });
  };
  return (
    <div className="row-menu" ref={ref}>
      <button type="button" ref={toggleRef} className="btn-action row-menu-toggle" aria-haspopup="menu" aria-expanded={open}
        aria-label={label} onClick={toggle} disabled={disabled}>
        {buttonText}
      </button>
      {open && (
        <ul className="row-menu-list" role="menu" style={pos}>
          {items.map(it => (
            <li key={it.key} role="none">
              <button type="button" role="menuitem" className={it.danger ? 'danger' : ''}
                onClick={() => { setPos(null); it.run(); }}>
                {it.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default RowMenu;
