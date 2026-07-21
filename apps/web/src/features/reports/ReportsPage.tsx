/**
 * Reports (§32 Phase 17): TB, P&L, Balance Sheet, Cash Flow, AR/AP aging —
 * all as-of a date, all exportable as CSV through the queue. Rendering is
 * shape-generic: any *Paise number becomes ₹ exactly once, here (I1).
 */
import { useState, type ReactNode } from 'react';
import { api, apiBlob, qs } from '../../lib/api';
import { Btn, C, Card, Err, Field, Money, Row, S, Tbl, today, useLoad } from '../../lib/ui';

const REPORTS = [
  { key: 'trial-balance', label: 'Trial balance' },
  { key: 'profit-loss', label: 'Profit & loss' },
  { key: 'balance-sheet', label: 'Balance sheet' },
  { key: 'cash-flow', label: 'Cash flow' },
  { key: 'aged-receivables', label: 'AR aging' },
  { key: 'aged-payables', label: 'AP aging' },
] as const;

function isPaiseKey(key: string): boolean {
  return /paise$/i.test(key);
}

function cell(key: string, value: unknown): ReactNode {
  if (typeof value === 'number' && isPaiseKey(key)) return <Money paise={value} />;
  if (value === null || value === undefined) return '—';
  if (typeof value === 'object')
    return <code style={{ fontSize: '0.7rem' }}>{JSON.stringify(value)}</code>;
  return String(value);
}

/** Arrays of objects → tables; scalar maps → definition rows; recurse. */
function Render({ value, label }: { value: unknown; label?: string }) {
  if (Array.isArray(value)) {
    const rows = value.filter((v) => v && typeof v === 'object') as Array<Record<string, unknown>>;
    if (rows.length === 0)
      return <p style={{ color: C.muted, fontSize: '0.85rem' }}>{label ?? 'list'}: empty</p>;
    const cols = Object.keys(rows[0]!).filter(
      (k) => !['accountId', 'partyId', 'id', '_id'].includes(k),
    );
    return (
      <div style={{ marginBottom: '0.8rem' }}>
        {label && (
          <h4 style={{ margin: '0.4rem 0', color: C.muted, fontSize: '0.8rem' }}>{label}</h4>
        )}
        <Tbl head={cols} rows={rows.map((r) => cols.map((k) => cell(k, r[k])))} />
      </div>
    );
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    const scalars = entries.filter(([, v]) => typeof v !== 'object' || v === null);
    const nested = entries.filter(([, v]) => typeof v === 'object' && v !== null);
    return (
      <div>
        {label && (
          <h4 style={{ margin: '0.4rem 0', color: C.muted, fontSize: '0.8rem' }}>{label}</h4>
        )}
        {scalars.length > 0 && (
          <Tbl head={scalars.map(([k]) => k)} rows={[scalars.map(([k, v]) => cell(k, v))]} />
        )}
        {nested.map(([k, v]) => (
          <Render key={k} value={v} label={k} />
        ))}
      </div>
    );
  }
  return <span>{String(value)}</span>;
}

export function ReportsPage() {
  const [report, setReport] = useState<(typeof REPORTS)[number]['key']>('profit-loss');
  const [asOf, setAsOf] = useState(today());
  const [exportState, setExportState] = useState('');
  const [error, setError] = useState<unknown>(null);

  const {
    data,
    error: loadError,
    busy,
  } = useLoad(
    () => api<Record<string, unknown>>('GET', `/api/v1/reports/${report}${qs({ asOf })}`),
    [report, asOf],
  );

  async function exportCsv() {
    setError(null);
    setExportState('queueing…');
    try {
      const { jobId } = await api<{ jobId: string }>(
        'POST',
        `/api/v1/reports/${report}/export${qs({ asOf })}`,
        {},
        { idem: false },
      );
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        const job = await api<{ status: string; error?: string }>('GET', `/api/v1/jobs/${jobId}`);
        setExportState(`export ${job.status}`);
        if (job.status === 'completed') {
          const csv = await apiBlob(`/api/v1/jobs/${jobId}/download`);
          const a = document.createElement('a');
          a.href = URL.createObjectURL(csv);
          a.download = `${report}-${asOf}.csv`;
          a.click();
          setExportState('');
          return;
        }
        if (job.status === 'failed') throw new Error(job.error ?? 'export failed');
      }
      throw new Error('export timed out');
    } catch (err) {
      setError(err);
      setExportState('');
    }
  }

  return (
    <Card
      title="Reports"
      actions={
        <Row>
          <Field label="As of">
            <input
              style={{ ...S.input, margin: 0 }}
              type="date"
              value={asOf}
              onChange={(e) => setAsOf(e.target.value)}
            />
          </Field>
          <Btn small kind="ghost" onClick={() => void exportCsv()} disabled={!!exportState}>
            {exportState || 'Export CSV'}
          </Btn>
        </Row>
      }
    >
      <Row>
        {REPORTS.map((r) => (
          <Btn
            key={r.key}
            small
            kind={report === r.key ? 'primary' : 'ghost'}
            onClick={() => setReport(r.key)}
          >
            {r.label}
          </Btn>
        ))}
      </Row>
      <div style={{ marginTop: '0.8rem' }}>
        <Err error={error} />
        <Err error={loadError} />
        {busy ? <p style={{ color: C.muted }}>Computing…</p> : data && <Render value={data} />}
      </div>
    </Card>
  );
}
