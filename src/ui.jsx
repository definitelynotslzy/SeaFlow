// Shared layout and UI components. Every screen is built from these.
import { createContext, useContext, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore, myAlerts, ROLE_LABEL } from './store.jsx';
import { LOGO } from './logo.js';
import { logoutUser } from "./logout.js";

/** Navigation context: { nav, back, reset, toast } — provided by App. */
export const NavCtx = createContext(null);
export const useNav = () => useContext(NavCtx);

/* ---------- Icons (one consistent stroke set) ---------- */

const PATHS = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  list: 'M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01',
  receipt: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6',
  bell: 'M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6M10 19a2 2 0 0 0 4 0',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  inbox: 'M3 13h5l1.5 3h5L16 13h5M5 5h14l2 8v6H3v-6z',
  pulse: 'M3 12h4l3-8 4 16 3-8h4',
  settings: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M16 4v4M10 10v4M18 16v4',
  file: 'M14 3H6v18h12V7zM14 3v4h4M9 13h6M9 17h6',
  lock: 'M6 11h12v9H6zM9 11V8a3 3 0 0 1 6 0v3',
  upload: 'M12 16V5M7 9l5-5 5 5M5 19h14',
  check: 'M5 12.5 10 17l9-10',
  alert: 'M12 4 2.5 20h19zM12 10v5M12 17.5h.01',
  back: 'M15 5l-7 7 7 7',
  plus: 'M12 5v14M5 12h14',
  logout: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10',
  wifi: 'M3 9a14 14 0 0 1 18 0M6.5 12.5a9 9 0 0 1 11 0M10 16a3.5 3.5 0 0 1 4 0M12 19.5h.01',
  x: 'M6 6l12 12M18 6 6 18',
  wave: 'M3 9c2.5-3 5-3 7.5 0s5 3 7.5 0M3 15c2.5-3 5-3 7.5 0s5 3 7.5 0',
  mail: 'M3 6h18v12H3zM3 7l9 6 9-6',
  chevron: 'M6 9l6 6 6-6',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7.5V12l3 2',
};

export function Icon({ name, size = 18 }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}

/* ---------- App shell ---------- */

const TABS = {
  agency: [
    { to: 'm.home', icon: 'home', label: 'Home' },
    { to: 'm.list', icon: 'list', label: 'Endorsements' },
    { to: 'm.billing', icon: 'receipt', label: 'Billing' },
    { to: 'alerts', icon: 'bell', label: 'Alerts' },
    { to: 'profile', icon: 'user', label: 'Profile' },
  ],

staff: [
  { to: 's.dash', icon: 'home', label: 'Dashboard' },
  { to: 's.queue', icon: 'inbox', label: 'Queue' },
  { to: 's.active', icon: 'pulse', label: 'Active' },
  { to: 's.billing', icon: 'receipt', label: 'Billing' },
  { to: 'alerts', icon: 'bell', label: 'Alerts' },
  { to: 'profile', icon: 'user', label: 'Profile' },
],

  admin: [
    { to: 'a.overview', icon: 'home', label: 'Overview' },
    { to: 'a.manage', icon: 'settings', label: 'Manage' },
    { to: 'a.audit', icon: 'file', label: 'Audit log' },
    { to: 'alerts', icon: 'bell', label: 'Alerts' },
    { to: 'profile', icon: 'user', label: 'Profile' },
  ],
};

/*
 * The official SeaFlow logo (embedded in logo.js).
 * It is always shown as-is, never cropped, stretched or recoloured, on a white
 * rounded tile, because the artwork uses white inside its shapes and navy
 * outlines that would disappear on the navy panels.
 */
export function Logo({ size = 'sm' }) {
  return (
    <span className={`logo-tile ${size}`}>
      <img src={LOGO} alt="SeaFlow logo" />
    </span>
  );
}

function Brand({ className = 'brand', sub, size }) {
  return (
    <div className={className}>
      <Logo size={size} />
      <span>
        SeaFlow
        {sub && <small>{sub}</small>}
      </span>
    </div>
  );
}

/**
 * Page frame.
 * Signed in: sidebar (bottom tabs on phones) + top bar + scrolling content.
 * Signed out: brand panel + centred form column. `wide` widens that column.
 */
export function Shell({ title, back, tab, wide, children }) {
  const { state, dispatch } = useStore();
  const { back: goBack, reset } = useNav();
  const session = state.session;


const handleLogout = async () => {
  const success = await logoutUser(dispatch, state);

  if (!success) {
    alert("Unable to log out. Please try again.");
  }
};


  if (!session) {
    return (
      <div className="auth">
        <aside className="auth-art">
          {/* Decorative wave lines; purely visual. */}
          <svg className="auth-waves" viewBox="0 0 600 220" preserveAspectRatio="none" aria-hidden="true">
            <path d="M0 60c60-36 120-36 180 0s120 36 180 0 120-36 180 0 60 18 60 18" />
            <path d="M0 110c60-36 120-36 180 0s120 36 180 0 120-36 180 0 60 18 60 18" />
            <path d="M0 160c60-36 120-36 180 0s120 36 180 0 120-36 180 0 60 18 60 18" />
          </svg>
          <div className="auth-art-in">
            <Brand size="lg" sub="NGC Medical Specialists Clinic" />
            <p className="auth-foot">
              <Icon name="lock" size={14} /> Authorized users only. Every access to patient information is logged.
            </p>
          </div>
        </aside>
        <main className="auth-main">
          <div className={`auth-box${wide ? ' wide' : ''}`}>
            <Brand className="auth-brand" />
            {back && (
              <button className="btn ghost sm" style={{ marginBottom: 16, marginLeft: -12 }} onClick={goBack}>
                <Icon name="back" size={15} /> Back
              </button>
            )}
            {children}
          </div>
        </main>
      </div>
    );
  }

  // Staff only see the tabs that match their assignment.
const tabs = TABS[session.role];
  const hasAlerts = myAlerts(state).length > 0;

  return (
    <div className="app">
      <aside className="side">
        <Brand sub="NGC Medical Specialists Clinic" />
        <nav className="tabs" aria-label="Main">
          {tabs.map((t) => (
            <button key={t.to} className={t.to === tab ? 'on' : ''} onClick={() => reset(t.to)}>
              <Icon name={t.icon} />
              {t.label}
              {t.to === 'alerts' && hasAlerts && <span className="dot" />}
            </button>
          ))}
        </nav>
        <div className="side-foot">
          Signed in as
          <b>{session.name}</b>
          {ROLE_LABEL[session.role]}
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <div className="topbar-title">
            {back && (
              <button className="icon-btn" onClick={goBack} aria-label="Back"><Icon name="back" /></button>
            )}
            <h1>{title}</h1>
          </div>
          <div className="topbar-actions">
            <span className="who">{session.name}</span>
            <button className="icon-btn" onClick={() => reset('alerts')} aria-label="Alerts">
              <Icon name="bell" />
              {hasAlerts && <i />}
            </button>
            <button className="btn sm danger" onClick={handleLogout}>
  <Icon name="logout" size={15} /> Log out
</button>
          </div>
        </header>
        <div className="content">
          <div className="content-in">{children}</div>
        </div>
      </div>
    </div>
  );
}

/** Page heading: title and description on the left, page actions on the right. */
export function Intro({ title, sub, children }) {
  return (
    <div className="intro">
      <div>
        <h2>{title}</h2>
        {sub && <p>{sub}</p>}
      </div>
      {children && <div className="intro-actions">{children}</div>}
    </div>
  );
}

/** Card with an optional header row (title, description, action). */
export function Card({ title, sub, action, flush, className = '', children }) {
  return (
    <section className={`card${flush ? ' flush' : ''} ${className}`}>
      {(title || action) && (
        <header className="card-h">
          <div>
            <h3>{title}</h3>
            {sub && <p>{sub}</p>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

/* ---------- Small components ---------- */

const CHIP_TONE = {
  Pending: 'amber', 'Non-reporting Status': 'amber', 'Update requested': 'amber', New: 'amber',
  Accepted: 'blue', 'Cash basis': 'slate', Reviewed: 'slate', 'Reach Maximum Medical Improvement': 'slate',
  'Treatment in Progress': 'teal',
  'Fit to Work': 'green', 'Fit to Work with Disability': 'green', Active: 'green', Sent: 'green',
  'Stop Treatment': 'red', Expired: 'red', Suspended: 'red', Rejected: 'red', Flagged: 'red', Deactivated: 'red',
};

export function Chip({ children, tone }) {
  return <span className={`chip ${tone || CHIP_TONE[children] || 'slate'}`}>{children}</span>;
}

/** Label + control + optional hint and error text. */
export function Field({ label, error, hint, className = '', children }) {
  return (
    <div className={`field${error ? ' bad' : ''} ${className}`}>
      <label>
        <span>{label}</span>
        {children}
      </label>
      {hint && <small>{hint}</small>}
      {error && error.trim() && <em>{error}</em>}
    </div>
  );
}

/**
 * File attachment. Only the file name is kept, but onPick also receives the
 * picked file itself so the form can check its type and size first.
 * `accept` limits what the file window offers; it is only a hint to the browser.
 */
export function FilePick({ file, onPick, onRemove, empty = 'No file attached', pickLabel = 'Upload', accept = 'application/pdf,image/*' }) {
  const input = useRef(null);
  return (
    <div className="filerow">
      <Icon name="file" size={16} />
      <span>{file || empty}</span>
      {file ? (
        <button type="button" className="btn sm" onClick={onRemove}>Remove</button>
      ) : (
        <button type="button" className="btn sm" onClick={() => input.current.click()}>
          <Icon name="upload" size={14} /> {pickLabel}
        </button>
      )}
      <input
        ref={input}
        type="file"
        accept={accept}
        hidden
        onChange={(ev) => {
          const f = ev.target.files[0];
          if (f) onPick(f.name, f);
          ev.target.value = '';
        }}
      />
    </div>
  );
}

/** A stored file with a View action (demo files have nothing to open). */
export function FileRow({ label, file, locked, record }) {
  const { toast } = useNav();
  const { dispatch } = useStore();
  // locked: clinic staff outside the clinic network cannot open the file or see its name.
  if (locked) {
    const tryOpen = () => {
      dispatch({ type: 'logDenied', id: record, detail: `Tried to open the ${label.toLowerCase()} outside the clinic network` });
      toast('Restricted outside the clinic network. Request break-glass access to open it.');
    };
    return (
      <div className="filerow">
        <Icon name="lock" size={16} />
        <span>{label ? `${label}: ` : ''}restricted outside the clinic network</span>
        <button className="link" onClick={tryOpen}>View</button>
      </div>
    );
  }
  const open = () => {
    dispatch({ type: 'logFile', id: record, label, file });
    toast(`${file} is a demo file`);
  };
  return (
    <div className="filerow">
      <Icon name="file" size={16} />
      <span>{label ? `${label}: ` : ''}{file}</span>
      <button className="link" onClick={open}>View</button>
    </div>
  );
}

export function Note({ tone = 'amber', icon, title, className = '', children }) {
  return (
    <div className={`note ${tone} ${className}`} role={tone === 'red' ? 'alert' : undefined}>
      {icon && <Icon name={icon} size={16} />}
      <div>
        {title && <b>{title}</b>}
        {children}
      </div>
    </div>
  );
}

export function Empty({ text, icon = 'inbox' }) {
  return (
    <div className="empty">
      <span className="icon-wrap"><Icon name={icon} size={20} /></span>
      {text}
    </div>
  );
}

/**
 * Dashboard tile. Renders a button when it leads somewhere.
 * tone: amber | teal | green | blue | red | slate (by the meaning of the number).
 * solid: tinted background, for the numbers that matter most on a page.
 */
export function Stat({ value, label, tone = 'slate', icon, solid, onClick }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag className={`stat t-${tone}${solid ? ' solid' : ''}`} onClick={onClick}>
      {icon && <span className="stat-icon"><Icon name={icon} size={18} /></span>}
      <span className="stat-text">
        <strong>{value}</strong>
        <span>{label}</span>
      </span>
    </Tag>
  );
}

/**
 * Label/value pairs. `cols` lays them out two per row;
 * `compact` tightens them for record cards.
 */
export function Details({ items, cols, compact }) {
  return (
    <dl className={`dl${cols ? ' cols' : ''}${compact ? ' compact' : ''}`}>
      {items.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ---------- Dropdown ---------- */

/**
 * Custom dropdown used everywhere in place of the native <select>.
 *
 * options: strings, or { value, label } objects. onChange receives the value.
 * searchable: adds a search box (for long lists).
 * clearable: shows a clear button that sets the value back to ''.
 * size="sm": compact variant for tables.
 *
 * The option panel is rendered in a portal with fixed positioning, so tables,
 * cards and dialogs never clip it. It flips above the control when there is
 * no room below. Keyboard: arrows, Home/End, Enter, Escape, Tab.
 */
export function Select({
  value, onChange, options, placeholder = 'Select', searchable, clearable, disabled, size, ariaLabel,
}) {
  const opts = options.map((o) => (o !== null && typeof o === 'object' ? o : { value: o, label: String(o) }));
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState(null);
  const trigger = useRef(null);
  const panel = useRef(null);
  const listId = useId();
  const current = opts.find((o) => o.value === value);
  const needle = query.trim().toLowerCase();
  const shown = needle ? opts.filter((o) => o.label.toLowerCase().includes(needle)) : opts;

  // Work out where the panel goes, relative to the viewport.
  const place = () => {
    const r = trigger.current.getBoundingClientRect();
    const below = window.innerHeight - r.bottom;
    const up = below < 240 && r.top > below;
    const width = Math.max(r.width, 200);
    setPos({
      left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)),
      width,
      maxHeight: Math.min(320, Math.max(140, (up ? r.top : below) - 16)),
      ...(up ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }),
    });
  };

  const openMenu = () => {
    if (disabled) return;
    place();
    setQuery('');
    setActive(Math.max(0, opts.findIndex((o) => o.value === value)));
    setOpen(true);
  };
  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) trigger.current?.focus();
  };
  const choose = (o) => {
    onChange(o.value);
    close();
  };

  // While open: close on an outside press, follow the control when the page scrolls or resizes.
  useEffect(() => {
    if (!open) return undefined;
    const outside = (ev) => {
      if (!panel.current?.contains(ev.target) && !trigger.current?.contains(ev.target)) setOpen(false);
    };
    const follow = (ev) => {
      if (ev.target instanceof Node && panel.current?.contains(ev.target)) return; // scrolling the options
      place();
    };
    document.addEventListener('mousedown', outside);
    document.addEventListener('touchstart', outside);
    window.addEventListener('scroll', follow, true);
    window.addEventListener('resize', follow);
    return () => {
      document.removeEventListener('mousedown', outside);
      document.removeEventListener('touchstart', outside);
      window.removeEventListener('scroll', follow, true);
      window.removeEventListener('resize', follow);
    };
  }, [open]);

  // Keep the highlighted option in view.
  useEffect(() => {
    if (open) panel.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  const onKeyDown = (ev) => {
    if (!open) {
      if (['ArrowDown', 'ArrowUp'].includes(ev.key)) { ev.preventDefault(); openMenu(); }
      return;
    }
    if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); close(); }
    else if (ev.key === 'ArrowDown') { ev.preventDefault(); setActive((a) => Math.min(shown.length - 1, a + 1)); }
    else if (ev.key === 'ArrowUp') { ev.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (ev.key === 'Home') { ev.preventDefault(); setActive(0); }
    else if (ev.key === 'End') { ev.preventDefault(); setActive(shown.length - 1); }
    else if (ev.key === 'Enter' || (ev.key === ' ' && !searchable)) {
      ev.preventDefault();
      if (shown[active]) choose(shown[active]);
    } else if (ev.key === 'Tab') close(false);
  };

  const canClear = clearable && !disabled && value !== '' && value != null;

  return (
    <div className={`select${size === 'sm' ? ' sm' : ''}${open ? ' open' : ''}${canClear ? ' has-clear' : ''}`} onKeyDown={onKeyDown}>
      <button
        type="button"
        ref={trigger}
        className="select-trigger"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => (open ? close() : openMenu())}
      >
        <span className={current ? undefined : 'placeholder'}>{current ? current.label : placeholder}</span>
        <Icon name="chevron" size={16} />
      </button>
      {canClear && (
        <button type="button" className="select-clear" aria-label="Clear selection" onClick={() => onChange('')}>
          <Icon name="x" size={14} />
        </button>
      )}
      {open && createPortal(
        <div ref={panel} className="select-panel" style={pos}>
          {searchable && (
            <div className="select-search">
              <input
                autoFocus
                type="text"
                value={query}
                placeholder="Search"
                aria-label="Search options"
                onChange={(ev) => { setQuery(ev.target.value); setActive(0); }}
              />
            </div>
          )}
          <ul id={listId} role="listbox">
            {shown.length === 0 && <li className="select-empty">No options match "{query}"</li>}
            {shown.map((o, i) => (
              <li
                key={String(o.value)}
                role="option"
                aria-selected={o.value === value}
                data-active={i === active}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(ev) => ev.preventDefault()}
                onClick={() => choose(o)}
              >
                <span>{o.label}</span>
                {o.value === value && <Icon name="check" size={15} />}
              </li>
            ))}
          </ul>
        </div>,
        document.body,
      )}
    </div>
  );
}

/* ---------- Data display ---------- */

/**
 * Data table with paging. On phones each row becomes a stacked record.
 * columns: [{ head, cell: (row) => node, className?, stop? }]
 * `stop` keeps clicks in that cell (buttons, selects) from opening the row.
 */
export function Table({ columns, rows, rowKey, onRow, empty = 'Nothing to show.', size = 10, pager = true }) {
  const [page, setPage] = useState(0);
  if (rows.length === 0) return <Empty text={empty} />;
  const pages = Math.ceil(rows.length / size);
  const p = Math.min(page, pages - 1);
  const shown = rows.slice(p * size, p * size + size);

  return (
    <>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>{columns.map((c) => <th key={c.head} className={c.className}>{c.head}</th>)}</tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr
                key={rowKey(r)}
                className={onRow ? 'click' : undefined}
                tabIndex={onRow ? 0 : undefined}
                onClick={onRow ? () => onRow(r) : undefined}
                onKeyDown={onRow ? (ev) => { if (ev.key === 'Enter' && ev.target === ev.currentTarget) onRow(r); } : undefined}
              >
                {columns.map((c) => (
                  <td
                    key={c.head}
                    data-label={c.head}
                    className={c.className}
                    onClick={c.stop ? (ev) => ev.stopPropagation() : undefined}
                  >
                    {c.cell(r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pager && (
        <div className="pager">
          <span>Showing {p * size + 1} to {Math.min(rows.length, (p + 1) * size)} of {rows.length}</span>
          {pages > 1 && (
            <div className="actions">
              <button className="btn sm" disabled={p === 0} onClick={() => setPage(p - 1)}>Previous</button>
              <button className="btn sm" disabled={p >= pages - 1} onClick={() => setPage(p + 1)}>Next</button>
            </div>
          )}
        </div>
      )}
    </>
  );
}

/** Grid of cards with a "Load more" control. */
export function Paged({ items, size = 6, render, empty = 'Nothing to show.' }) {
  const [n, setN] = useState(size);
  if (items.length === 0) return <Card><Empty text={empty} /></Card>;
  return (
    <>
      <div className="card-grid">{items.slice(0, n).map(render)}</div>
      <div className="pager">
        <span>Showing {Math.min(n, items.length)} of {items.length}</span>
        {items.length > n && (
          <button className="btn sm" onClick={() => setN(n + size)}>Load {Math.min(size, items.length - n)} more</button>
        )}
      </div>
    </>
  );
}

/* ---------- Overlays ---------- */

/** Dialog for confirmations and short forms. Esc or the backdrop closes it. */
export function Modal({ title, sub, wide, onClose, footer, children }) {
  useEffect(() => {
    const onKey = (ev) => { if (ev.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="overlay" onMouseDown={(ev) => { if (ev.target === ev.currentTarget) onClose(); }}>
      <div className={`modal${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <header>
          <div>
            <h3>{title}</h3>
            {sub && <p>{sub}</p>}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
        </header>
        <div className="modal-b">{children}</div>
        {footer && <footer>{footer}</footer>}
      </div>
    </div>
  );
}