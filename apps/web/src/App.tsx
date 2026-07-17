import { useEffect, useState } from 'react';
import { formatINR, healthResponseSchema, type HealthResponse } from '@finpilot/shared';

// Phase 0 shell — proves web ⇄ api ⇄ infra wiring and the shared contract package.
// Real features (auth, dashboard, invoices…) arrive feature-sliced from Phase 2 onward.

const styles = {
  page: {
    fontFamily: 'system-ui, sans-serif',
    minHeight: '100vh',
    display: 'grid',
    placeItems: 'center',
    background: '#0F172A',
    color: '#E2E8F0',
    margin: 0,
  },
  card: {
    background: '#1E293B',
    borderRadius: 12,
    padding: '2rem 2.5rem',
    maxWidth: 460,
    boxShadow: '0 8px 30px rgba(0,0,0,0.35)',
  },
  row: { display: 'flex', justifyContent: 'space-between', gap: '2rem', margin: '0.4rem 0' },
} satisfies Record<string, React.CSSProperties>;

const badge = (ok: boolean): React.CSSProperties => ({
  display: 'inline-block',
  padding: '0.15rem 0.6rem',
  borderRadius: 999,
  fontSize: '0.8rem',
  fontWeight: 600,
  background: ok ? '#065F46' : '#7F1D1D',
  color: ok ? '#6EE7B7' : '#FCA5A5',
});

export function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/healthz')
      .then((r) => r.json())
      .then((data) => setHealth(healthResponseSchema.parse(data)))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'unreachable'));
  }, []);

  return (
    <div style={styles.page}>
      <main style={styles.card}>
        <h1 style={{ marginTop: 0 }}>FinPilot AI</h1>
        <p style={{ color: '#94A3B8' }}>
          Phase 0 — repo and rails. Shared contract check: {formatINR(150000)}
        </p>
        {error && <p style={badge(false)}>API unreachable: {error}</p>}
        {health && (
          <>
            <div style={styles.row}>
              <span>API</span>
              <span style={badge(health.status === 'ok')}>{health.status}</span>
            </div>
            <div style={styles.row}>
              <span>MongoDB (replica set)</span>
              <span style={badge(health.components.mongo === 'connected')}>
                {health.components.mongo}
              </span>
            </div>
            <div style={styles.row}>
              <span>Redis</span>
              <span style={badge(health.components.redis === 'connected')}>
                {health.components.redis}
              </span>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
