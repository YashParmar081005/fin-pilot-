/** Billing (§32 Phase 23): plan, live usage vs limits, Razorpay subscribe. */
import { useState } from 'react';
import { api } from '../../lib/api';
import { Badge, Btn, C, Card, Err, Row, Tbl, useLoad } from '../../lib/ui';

interface Billing {
  plan: string;
  status: string;
  month: string;
  limits: {
    maxCompanies: number;
    maxUsers: number;
    maxInvoicesMonth: number;
    aiTokensMonth: number;
    ocrPagesMonth: number;
  };
  usage: { aiTokens: number; ocrPages: number; invoices: number };
}

function UsageBar({ used, max }: { used: number; max: number }) {
  const pct = Math.min(100, Math.round((used / Math.max(1, max)) * 100));
  const color = pct >= 90 ? C.red : pct >= 70 ? C.amber : C.green;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 220 }}>
      <div style={{ flex: 1, height: 8, background: C.bg, borderRadius: 999 }}>
        <div style={{ width: `${pct}%`, height: 8, background: color, borderRadius: 999 }} />
      </div>
      <span style={{ fontSize: '0.78rem', color: C.muted, whiteSpace: 'nowrap' }}>
        {used.toLocaleString('en-IN')} / {max.toLocaleString('en-IN')}
      </span>
    </div>
  );
}

export function BillingPage() {
  const billing = useLoad(() => api<Billing>('GET', '/api/v1/billing'));
  const [error, setError] = useState<unknown>(null);
  const [checkout, setCheckout] = useState<string | null>(null);

  async function subscribe(plan: string) {
    setError(null);
    try {
      const { subscription } = await api<{ subscription: { shortUrl: string } }>(
        'POST',
        '/api/v1/billing/subscribe',
        { plan },
      );
      setCheckout(subscription.shortUrl);
    } catch (err) {
      setError(err);
    }
  }

  const d = billing.data;
  return (
    <Card title="Plan & usage">
      <Err error={billing.error} />
      <Err error={error} />
      {d && (
        <>
          <Row>
            <h2 style={{ margin: 0, textTransform: 'capitalize' }}>{d.plan}</h2>
            <Badge value={d.status} />
            <span style={{ color: C.muted, fontSize: '0.85rem' }}>
              usage for {d.month} (org-wide)
            </span>
          </Row>
          <div style={{ margin: '1rem 0' }}>
            <Tbl
              head={['Meter', 'Usage vs limit']}
              rows={[
                [
                  'Invoices / month',
                  <UsageBar key="i" used={d.usage.invoices} max={d.limits.maxInvoicesMonth} />,
                ],
                [
                  'AI tokens / month',
                  <UsageBar key="a" used={d.usage.aiTokens} max={d.limits.aiTokensMonth} />,
                ],
                [
                  'OCR pages / month',
                  <UsageBar key="o" used={d.usage.ocrPages} max={d.limits.ocrPagesMonth} />,
                ],
                ['Seats', `${d.limits.maxUsers} max`],
                ['Companies', `${d.limits.maxCompanies} max`],
              ]}
            />
          </div>
          {checkout ? (
            <p style={{ fontSize: '0.9rem' }}>
              Complete the checkout at{' '}
              <a href={checkout} target="_blank" rel="noreferrer" style={{ color: C.accent }}>
                {checkout}
              </a>{' '}
              — your plan activates on the payment webhook.
            </p>
          ) : (
            <Row>
              {['starter', 'professional', 'enterprise']
                .filter((p) => p !== d.plan)
                .map((p) => (
                  <Btn key={p} small kind="ghost" onClick={() => void subscribe(p)}>
                    Upgrade to {p}
                  </Btn>
                ))}
            </Row>
          )}
          <p style={{ color: C.muted, fontSize: '0.75rem', marginBottom: 0 }}>
            Hitting a limit returns 402 with this upgrade path — only the org owner can subscribe;
            Razorpay hosts the checkout.
          </p>
        </>
      )}
    </Card>
  );
}
