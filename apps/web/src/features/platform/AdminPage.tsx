/**
 * Super-admin console (§32 Phase 23) — only renders for platform operators
 * (403 otherwise). Impersonation REQUIRES a written reason; the loud banner
 * is driven by the X-Impersonation-* response headers in lib/api.
 */
import { useState } from 'react';
import { api, setAccessToken } from '../../lib/api';
import { Badge, Btn, C, Card, Err, Field, Row, S, Tbl, dateStr, useLoad } from '../../lib/ui';

interface OrgRow {
  id: string;
  name: string;
  type: string;
  plan: string;
  companies: number;
  subscriptionStatus: string;
  createdAt: string;
}
interface DeadLetter {
  _id: string;
  queue: string;
  jobId: string;
  error: string;
  failedAt: string;
  replayedAt: string | null;
}

export function AdminPage({ onImpersonated }: { onImpersonated: () => void }) {
  const orgs = useLoad(() =>
    api<{ organizations: OrgRow[] }>('GET', '/api/v1/admin/organizations'),
  );
  const dlq = useLoad(() => api<{ deadLetters: DeadLetter[] }>('GET', '/api/v1/admin/dlq'));
  const [targetUserId, setTargetUserId] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<unknown>(null);

  async function impersonate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const result = await api<{ token: string; sessionId: string }>(
        'POST',
        '/api/v1/admin/impersonate',
        {
          targetUserId,
          reason,
        },
      );
      setAccessToken(result.token); // 15-min token; every request is tagged + bannered
      onImpersonated();
    } catch (err) {
      setError(err);
    }
  }

  async function replay(id: string) {
    setError(null);
    try {
      await api('POST', `/api/v1/admin/dlq/${id}/replay`, {});
      dlq.reload();
    } catch (err) {
      setError(err);
    }
  }

  return (
    <div>
      <Err error={error} />
      <Card title="Organizations">
        <Err error={orgs.error} />
        <Tbl
          head={['Name', 'Type', 'Plan', 'Companies', 'Subscription', 'Created']}
          rows={(orgs.data?.organizations ?? []).map((o) => [
            o.name,
            o.type,
            <Badge key="p" value={o.plan} />,
            o.companies,
            <Badge key="s" value={o.subscriptionStatus} />,
            dateStr(o.createdAt),
          ])}
        />
      </Card>

      <Card title="Impersonate a user — impossible without a written reason">
        <form onSubmit={impersonate}>
          <Row>
            <Field label="Target user id (24-char)">
              <input
                style={{ ...S.input, width: 240 }}
                value={targetUserId}
                onChange={(e) => setTargetUserId(e.target.value)}
                required
              />
            </Field>
            <Field label="Reason (min 10 chars — audited verbatim)">
              <input
                style={{ ...S.input, width: 320 }}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
              />
            </Field>
            <Btn kind="danger">Impersonate</Btn>
          </Row>
        </form>
        <p style={{ color: C.muted, fontSize: '0.75rem', marginBottom: 0 }}>
          15-minute token · every request lands in the session's action log · every audit row is
          tagged · the banner stays on until the session ends. Ending it kills the token
          immediately.
        </p>
      </Card>

      <Card title="Dead-letter queue — inspect, fix, REPLAY">
        <Err error={dlq.error} />
        <Tbl
          head={['Queue', 'Job', 'Error', 'Failed at', 'Action']}
          empty="DLQ is empty — as it should be."
          rows={(dlq.data?.deadLetters ?? []).map((d) => [
            d.queue,
            d.jobId,
            <code key="e" style={{ fontSize: '0.75rem' }}>
              {d.error}
            </code>,
            dateStr(d.failedAt),
            d.replayedAt ? (
              <span style={{ color: C.muted, fontSize: '0.8rem' }}>replayed</span>
            ) : (
              <Btn small onClick={() => void replay(d._id)}>
                Replay
              </Btn>
            ),
          ])}
        />
      </Card>
    </div>
  );
}
