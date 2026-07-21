/**
 * The shared UI kit — one dark theme, zero dependencies. Money is formatted
 * ONLY here via formatINR (I1: display formatting happens once, at the React
 * boundary). Rupee inputs convert to integer paise on the way out.
 */
import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { formatINR } from '@finpilot/shared';
import { RequestError } from './api';

export const C = {
  bg: '#0F172A',
  panel: '#1E293B',
  panel2: '#243044',
  border: '#334155',
  text: '#E2E8F0',
  muted: '#94A3B8',
  accent: '#0EA5E9',
  accentText: '#082F49',
  green: '#34D399',
  red: '#F87171',
  amber: '#FBBF24',
};

export const S: Record<string, CSSProperties> = {
  input: {
    display: 'block',
    width: '100%',
    boxSizing: 'border-box',
    margin: '0.25rem 0 0.75rem',
    padding: '0.5rem 0.7rem',
    borderRadius: 8,
    border: `1px solid ${C.border}`,
    background: C.bg,
    color: C.text,
    fontSize: '0.9rem',
  },
  label: { fontSize: '0.8rem', color: C.muted },
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
  const bg =
    kind === 'primary'
      ? C.accent
      : kind === 'danger'
        ? C.red
        : kind === 'success'
          ? C.green
          : C.border;
  const fg = kind === 'ghost' ? C.text : C.accentText;
  return (
    <button
      type={type ?? (onClick ? 'button' : 'submit')}
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: small ? '0.3rem 0.7rem' : '0.5rem 1.1rem',
        borderRadius: 8,
        border: 'none',
        background: bg,
        color: fg,
        fontWeight: 600,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        fontSize: small ? '0.8rem' : '0.9rem',
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
    <section
      style={{
        background: C.panel,
        borderRadius: 12,
        padding: '1.1rem 1.3rem',
        marginBottom: '1rem',
        border: `1px solid ${C.border}`,
      }}
    >
      {(title || actions) && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '0.8rem',
          }}
        >
          <h3 style={{ margin: 0, fontSize: '1rem' }}>{title}</h3>
          <div style={{ display: 'flex', gap: 8 }}>{actions}</div>
        </div>
      )}
      {children}
    </section>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: 'block' }}>
      <span style={S.label}>{label}</span>
      {children}
    </label>
  );
}

export function Row({ children, gap = 12 }: { children: ReactNode; gap?: number }) {
  return (
    <div style={{ display: 'flex', gap, flexWrap: 'wrap', alignItems: 'flex-end' }}>{children}</div>
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
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.87rem' }}>
        <thead>
          <tr>
            {head.map((h, i) => (
              <th
                key={i}
                style={{
                  textAlign: 'left',
                  padding: '0.45rem 0.6rem',
                  borderBottom: `2px solid ${C.border}`,
                  color: C.muted,
                  fontWeight: 600,
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
                  style={{ padding: '0.45rem 0.6rem', borderBottom: `1px solid ${C.border}` }}
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
  return <span style={{ fontVariantNumeric: 'tabular-nums', color }}>{formatINR(paise)}</span>;
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
        padding: '0.05rem 0.55rem',
        fontSize: '0.72rem',
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
  return <p style={{ color: C.red, fontSize: '0.85rem', whiteSpace: 'pre-wrap' }}>{msg}</p>;
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
