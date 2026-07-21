/**
 * GST (§32 Phase 12/14): GSTR-1 / GSTR-3B preparation (we prepare and
 * export — we don't file) and IMS reconciliation: sync inward invoices,
 * auto-match against the books, act accept / reject / pending.
 */
import { useState } from 'react';
import { api, qs } from '../../lib/api';
import {
  Badge,
  Btn,
  C,
  Card,
  Err,
  Field,
  Money,
  Row,
  S,
  Tbl,
  thisMonth,
  useLoad,
} from '../../lib/ui';

interface ImsRecord {
  _id: string;
  supplierGstin: string;
  documentNumber: string;
  documentDate?: string;
  taxableValuePaise?: number;
  totalTaxPaise?: number;
  matchStatus: string;
  action: string;
  remarks?: string;
  pushedBackAt?: string | null;
}
interface GstReturn {
  id: string;
  period: string;
  data: Record<string, unknown>;
}

const MATCH_COLOR: Record<string, string> = {
  matched: C.green,
  mismatch: C.amber,
  not_in_books: C.red,
};

function ReturnCard({ kind, period }: { kind: 'gstr1' | 'gstr3b'; period: string }) {
  const { data, error, busy } = useLoad(
    () => api<GstReturn>('GET', `/api/v1/gst/${kind}${qs({ period })}`),
    [kind, period],
  );
  const download = () => {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data.data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${kind.toUpperCase()}-${period}.json`;
    a.click();
  };
  return (
    <Card
      title={kind === 'gstr1' ? 'GSTR-1 (outward supplies)' : 'GSTR-3B (summary + ITC)'}
      actions={
        <Btn small kind="ghost" onClick={download} disabled={!data}>
          Export JSON
        </Btn>
      }
    >
      <Err error={error} />
      {busy && <p style={{ color: C.muted }}>Preparing…</p>}
      {data && (
        <pre
          style={{
            background: C.bg,
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            padding: '0.8rem',
            fontSize: '0.72rem',
            maxHeight: 260,
            overflow: 'auto',
          }}
        >
          {JSON.stringify(data.data, null, 2)}
        </pre>
      )}
      <p style={{ color: C.muted, fontSize: '0.75rem', marginBottom: 0 }}>
        GSTN-shape validated; every figure traces to journal entries (Returns → trace). We prepare —
        filing stays with you/your CA.
      </p>
    </Card>
  );
}

export function GstPage() {
  const [period, setPeriod] = useState(thisMonth());
  const [tab, setTab] = useState<'ims' | 'gstr1' | 'gstr3b'>('ims');
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState('');

  const ims = useLoad(
    () => api<{ records: ImsRecord[] }>('GET', `/api/v1/gst/ims${qs({ period })}`),
    [period],
  );

  async function sync() {
    setError(null);
    setNotice('');
    try {
      const result = await api<{ synced: number }>('POST', '/api/v1/gst/ims/sync', { period });
      setNotice(`Synced ${result.synced} inward records from the IMS.`);
      ims.reload();
    } catch (err) {
      setError(err);
    }
  }

  async function act(id: string, action: 'accept' | 'reject' | 'pending') {
    setError(null);
    try {
      await api('POST', `/api/v1/gst/ims/${id}/action`, {
        action,
        ...(action === 'reject' ? { remarks: 'rejected from UI' } : {}),
      });
      ims.reload();
    } catch (err) {
      setError(err);
    }
  }

  return (
    <div>
      <Card
        title="GST compliance"
        actions={
          <Row>
            <Field label="Period">
              <input
                style={{ ...S.input, margin: 0, width: 120 }}
                type="month"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
              />
            </Field>
            {(['ims', 'gstr1', 'gstr3b'] as const).map((t) => (
              <Btn key={t} small kind={tab === t ? 'primary' : 'ghost'} onClick={() => setTab(t)}>
                {t.toUpperCase()}
              </Btn>
            ))}
          </Row>
        }
      >
        <p style={{ color: C.muted, fontSize: '0.85rem', margin: 0 }}>
          IMS: accept/reject every supplier invoice before the 14th — no action = deemed accepted.
          FinPilot matches each against your bills and you act with one click.
        </p>
      </Card>

      {tab === 'ims' && (
        <Card
          title={`IMS inward records — ${period}`}
          actions={
            <Btn small onClick={() => void sync()}>
              Sync from IMS
            </Btn>
          }
        >
          <Err error={error} />
          <Err error={ims.error} />
          {notice && <p style={{ color: C.green, fontSize: '0.85rem' }}>{notice}</p>}
          <Tbl
            head={['Supplier GSTIN', 'Doc no.', 'Taxable', 'Match', 'Action taken', 'Act']}
            empty="No records — sync the period first."
            rows={(ims.data?.records ?? []).map((r) => [
              r.supplierGstin,
              r.documentNumber,
              <Money key="t" paise={r.taxableValuePaise ?? null} />,
              <span
                key="m"
                style={{ color: MATCH_COLOR[r.matchStatus] ?? C.muted, fontSize: '0.8rem' }}
              >
                {r.matchStatus.replace(/_/g, ' ')}
              </span>,
              <span key="s">
                <Badge value={r.action} />{' '}
                {r.pushedBackAt && (
                  <span style={{ color: C.muted, fontSize: '0.7rem' }}>pushed back</span>
                )}
              </span>,
              <span key="a" style={{ display: 'flex', gap: 4 }}>
                <Btn small kind="success" onClick={() => void act(r._id, 'accept')}>
                  Accept
                </Btn>
                <Btn small kind="danger" onClick={() => void act(r._id, 'reject')}>
                  Reject
                </Btn>
                <Btn small kind="ghost" onClick={() => void act(r._id, 'pending')}>
                  Pending
                </Btn>
              </span>,
            ])}
          />
          <p style={{ color: C.muted, fontSize: '0.75rem', marginBottom: 0 }}>
            "matched" = exact bill in your books · "not in books" = you never recorded it (possible
            fake — reject) · pending carries at most one period (§14.5).
          </p>
        </Card>
      )}
      {tab === 'gstr1' && <ReturnCard kind="gstr1" period={period} />}
      {tab === 'gstr3b' && <ReturnCard kind="gstr3b" period={period} />}
    </div>
  );
}
