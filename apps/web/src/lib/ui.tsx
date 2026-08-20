/**
 * The shared UI kit. All colors are CSS variables from index.css, so every
 * page follows the light/dark toggle with no per-page work. Money is
 * formatted ONLY here via formatINR (I1: display formatting happens once,
 * at the React boundary) and rendered in the mono numerals face.
 */
import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { formatINR } from '@finpilot/shared';
import { RequestError } from './api';

/** Theme tokens as var() references — safe in inline styles everywhere. */
export const C = {
  bg: 'var(--bg)',
  panel: 'var(--panel)',
  panel2: 'var(--panel-2)',
  border: 'var(--border)',
  text: 'var(--text)',
  muted: 'var(--muted)',
  accent: 'var(--accent)',
  accent2: 'var(--accent-2)',
  accentSoft: 'var(--accent-soft)',
  accentText: 'var(--on-accent)',
  green: 'var(--green)',
  red: 'var(--red)',
  amber: 'var(--amber)',
};

// ── theme ───────────────────────────────────────────────────────────────────

export type Theme = 'light' | 'dark';

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem('fp-theme', theme); // a preference, never a token
  } catch {
    /* private mode — fine */
  }
}

export function initTheme(): Theme {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem('fp-theme');
  } catch {
    /* ignore */
  }
  const theme: Theme =
    stored === 'light' || stored === 'dark'
      ? stored
      : window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
  applyTheme(theme);
  return theme;
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(
    (document.documentElement.dataset.theme as Theme) ?? 'light',
  );
  return (
    <button
      className="fp-btn"
      title={theme === 'light' ? 'Switch to dark' : 'Switch to light'}
      onClick={() => {
        const next = theme === 'light' ? 'dark' : 'light';
        applyTheme(next);
        setTheme(next);
      }}
      style={{
        background: C.panel2,
        color: C.text,
        border: `1px solid ${C.border}`,
        borderRadius: 999,
        width: 42,
        height: 42,
        fontSize: '1.15rem',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {theme === 'light' ? '🌙' : '☀️'}
    </button>
  );
}

// ── primitives ──────────────────────────────────────────────────────────────

export const S: Record<string, CSSProperties> = {
  input: {
    display: 'block',
    width: '100%',
    boxSizing: 'border-box',
    margin: 0,
    height: 52,
    padding: '0 1rem',
    borderRadius: 8,
    border: `1px solid ${C.border}`,
    background: C.panel,
    color: C.text,
    fontSize: '0.95rem',
    fontFamily: 'inherit',
  },
  label: { fontSize: '0.8rem', color: C.text, fontWeight: 500 },
};

export function Btn({
  children,
  onClick,
  kind = 'primary',
  disabled,
  small,
  type,
}: {
  children: ReactNode;
  onClick?: () => void;
  kind?: 'primary' | 'ghost' | 'danger' | 'success';
  disabled?: boolean;
  small?: boolean;
  type?: 'submit' | 'button';
}) {
  const styles: CSSProperties =
    kind === 'primary'
      ? { background: C.accent, color: C.accentText, borderRadius: 8, fontWeight: 500 }
      : kind === 'danger'
        ? { background: C.red, color: '#fff', borderRadius: 8, fontWeight: 500 }
        : kind === 'success'
          ? { background: C.green, color: '#fff', borderRadius: 8, fontWeight: 500 }
          : { background: C.panel, color: C.text, border: `1px solid ${C.text}`, borderRadius: 8, fontWeight: 500 };
  return (
    <button
      type={type ?? (onClick ? 'button' : 'submit')}
      onClick={onClick}
      disabled={disabled}
      className="fp-btn"
      style={{
        padding: small ? '0 1rem' : '0 1.6rem',
        height: small ? 40 : 52,
        fontSize: small ? '0.85rem' : '0.95rem',
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? 'default' : 'pointer',
        fontFamily: 'inherit',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxSizing: 'border-box',
        ...styles,
      }}
    >
      {children}
    </button>
  );
}

export function Card({
  title,
  children,
  actions,
}: {
  title?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="fp-card" style={{ padding: '1.4rem 1.6rem', marginBottom: '1.25rem', borderRadius: 14 }}>
      {(title || actions) && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1rem',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 600, color: C.text }}>{title}</h3>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            {actions}
          </div>
        </div>
      )}
      {children}
    </section>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={S.label}>{label}</span>
      {children}
    </label>
  );
}

export function Row({ children, gap = 12 }: { children: ReactNode; gap?: number }) {
  return (
    <div style={{ display: 'flex', gap, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '1rem' }}>
      {children}
    </div>
  );
}

export function Tbl({
  head,
  rows,
  empty,
}: {
  head: ReactNode[];
  rows: ReactNode[][];
  empty?: string;
}) {
  if (rows.length === 0) {
    return <p style={{ color: C.muted, fontSize: '0.9rem' }}>{empty ?? 'Nothing here yet.'}</p>;
  }
  return (
    <div style={{ overflowX: 'auto' }}>
      <table
        className="fp-table"
        style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.87rem' }}
      >
        <thead>
          <tr>
            {head.map((h, i) => (
              <th
                key={i}
                style={{
                  textAlign: 'left',
                  padding: '0.5rem 0.65rem',
                  borderBottom: `2px solid ${C.border}`,
                  color: C.muted,
                  fontWeight: 700,
                  fontSize: '0.72rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  whiteSpace: 'nowrap',
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((cell, j) => (
                <td
                  key={j}
                  style={{ padding: '0.5rem 0.65rem', borderBottom: `1px solid ${C.border}` }}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Money({ paise, colored }: { paise: number | null | undefined; colored?: boolean }) {
  if (paise === null || paise === undefined) return <span style={{ color: C.muted }}>—</span>;
  const color = colored ? (paise < 0 ? C.red : C.green) : C.text;
  return (
    <span className="fp-mono" style={{ color, fontSize: '0.95em' }}>
      {formatINR(paise)}
    </span>
  );
}

const BADGE_COLORS: Record<string, string> = {
  draft: C.muted,
  issued: C.accent,
  paid: C.green,
  partially_paid: C.amber,
  overdue: C.red,
  cancelled: C.red,
  posted: C.green,
  reversed: C.amber,
  approved: C.green,
  pending_approval: C.amber,
  rejected: C.red,
  active: C.green,
  accept: C.green,
  reject: C.red,
  pending: C.amber,
  no_action: C.muted,
  proposed: C.amber,
  confirmed: C.green,
  expired: C.muted,
  generated: C.green,
  failed: C.red,
  extracted: C.green,
  uploaded: C.amber,
};

export function Badge({ value }: { value: string }) {
  const color = BADGE_COLORS[value] ?? C.muted;
  return (
    <span
      style={{
        border: `1px solid ${color}`,
        color,
        borderRadius: 999,
        padding: '0.08rem 0.6rem',
        fontSize: '0.72rem',
        fontWeight: 600,
        whiteSpace: 'nowrap',
      }}
    >
      {value.replace(/_/g, ' ')}
    </span>
  );
}

export function Err({ error }: { error: unknown }) {
  if (!error) return null;
  const msg =
    error instanceof RequestError
      ? `${error.error.code}: ${error.error.message}${error.error.details ? ' — ' + JSON.stringify(error.error.details) : ''}`
      : String(error);
  return (
    <p
      className="fp-msg"
      style={{
        color: C.red,
        fontSize: '0.85rem',
        whiteSpace: 'pre-wrap',
        background: 'color-mix(in srgb, var(--red) 9%, transparent)',
        border: `1px solid color-mix(in srgb, var(--red) 30%, transparent)`,
        borderRadius: 10,
        padding: '0.5rem 0.75rem',
      }}
    >
      {msg}
    </p>
  );
}

export function dateStr(value: string | Date | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/** '2,500.50' rupees → 250050 paise. NaN-safe: returns 0. */
export function rupeesToPaise(rupees: string): number {
  const n = Number(rupees.replace(/,/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export function thisMonth(): string {
  return new Date().toISOString().slice(0, 7);
}
export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Load-on-mount hook with reload + error surface. */
export function useLoad<T>(
  fn: () => Promise<T>,
  deps: unknown[] = [],
): {
  data: T | null;
  error: unknown;
  busy: boolean;
  reload: () => void;
} {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(true);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  useEffect(() => {
    let alive = true;
    setBusy(true);
    setError(null);
    fn()
      .then((d) => alive && setData(d))
      .catch((e: unknown) => alive && setError(e))
      .finally(() => alive && setBusy(false));
    return () => {
      alive = false;
    };
    // deps are caller-provided by design; fn identity is intentionally ignored
  }, [...deps, tick]);
  return { data, error, busy, reload };
}
