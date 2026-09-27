/** Billing (§32 Phase 23): plan, live usage vs limits, Razorpay subscribe. */
import { useState } from 'react';
import { formatINR } from '@finpilot/shared';
import { api } from '../../lib/api';
import { Badge, Btn, C, Card, Err, Row, Tbl, useLoad } from '../../lib/ui';

interface Limits {
  maxCompanies: number;
  maxUsers: number;
  maxInvoicesMonth: number;
  aiTokensMonth: number;
  ocrPagesMonth: number;
}
interface Billing {
  plan: string;
  status: string;
  month: string;
  limits: Limits;
  usage: { aiTokens: number; ocrPages: number; invoices: number };
}
interface PlanRow {
  key: string;
  pricePaise: number;
  limits: Limits;
  current: boolean;
  subscribable: boolean;
  configured: boolean;
}
interface Catalogue {
  currentPlan: string;
  status: string;
  razorpayConfigured: boolean;
  plans: PlanRow[];
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

const n = (v: number) => v.toLocaleString('en-IN');
/** "1 company", not "1 companies". */
const plural = (v: number, one: string, many: string) => `${n(v)} ${v === 1 ? one : many}`;

export function BillingPage() {
  const billing = useLoad(() => api<Billing>('GET', '/api/v1/billing'));
  const catalogue = useLoad(() => api<Catalogue>('GET', '/api/v1/billing/plans'));
  const [error, setError] = useState<unknown>(null);
  const [checkout, setCheckout] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function subscribe(plan: string) {
    setError(null);
    setBusy(plan);
    try {
      const { subscription } = await api<{ subscription: { shortUrl: string } }>(
        'POST',
        '/api/v1/billing/subscribe',
        { plan },
      );
      setCheckout(subscription.shortUrl);
      // Razorpay hosts the checkout; opening it is the whole handoff.
      window.open(subscription.shortUrl, '_blank', 'noopener');
    } catch (err) {
      setError(err);
    } finally {
      setBusy(null);
    }
  }

  const d = billing.data;
  const cat = catalogue.data;

  return (
    <div>
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
          </>
        )}
      </Card>

      <Card title="Plans">
        <Err error={catalogue.error} />

        {cat && !cat.razorpayConfigured && (
          <p
            style={{
              color: C.amber,
              fontSize: '0.85rem',
              border: `1px solid ${C.amber}`,
              borderRadius: 8,
              padding: '0.6rem 0.8rem',
              marginTop: 0,
            }}
          >
            Razorpay is not configured on this server, so the paid plans cannot be started yet. Set
            RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET and the per-plan ids in the API environment. Test
            keys work — Razorpay hosts the checkout either way.
          </p>
        )}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
            gap: 12,
          }}
        >
          {(cat?.plans ?? []).map((p) => (
            <div
              key={p.key}
              style={{
                border: `1px solid ${p.current ? C.accent : C.border}`,
                background: p.current ? C.panel2 : 'transparent',
                borderRadius: 10,
                padding: '0.9rem 1rem',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontWeight: 700, textTransform: 'capitalize', fontSize: '1.05rem' }}>
                  {p.key}
                </span>
                {p.current && <Badge value="active" />}
              </div>

              <div>
                <span style={{ fontSize: '1.5rem', fontWeight: 700 }}>
                  {p.pricePaise === 0 ? 'Free' : formatINR(p.pricePaise)}
                </span>
                {p.pricePaise > 0 && (
                  <span style={{ color: C.muted, fontSize: '0.8rem' }}> / month</span>
                )}
              </div>

              <ul
                style={{
                  margin: 0,
                  paddingLeft: '1.1rem',
                  color: C.muted,
                  fontSize: '0.8rem',
                  lineHeight: 1.7,
                }}
              >
                <li>{plural(p.limits.maxCompanies, 'company', 'companies')}</li>
                <li>{plural(p.limits.maxUsers, 'user', 'users')}</li>
                <li>{plural(p.limits.maxInvoicesMonth, 'invoice', 'invoices')} / month</li>
                <li>{plural(p.limits.ocrPagesMonth, 'OCR page', 'OCR pages')} / month</li>
                <li>{n(p.limits.aiTokensMonth)} AI tokens / month</li>
              </ul>

              <div style={{ marginTop: 'auto' }}>
                {p.current ? (
                  <span style={{ color: C.muted, fontSize: '0.8rem' }}>Your current plan</span>
                ) : p.key === 'free' ? (
                  <span style={{ color: C.muted, fontSize: '0.8rem' }}>
                    Downgrades are handled by support
                  </span>
                ) : p.subscribable ? (
                  <Btn small onClick={() => void subscribe(p.key)} disabled={busy !== null}>
                    {busy === p.key ? 'Opening checkout…' : `Subscribe to ${p.key}`}
                  </Btn>
                ) : (
                  <span style={{ color: C.amber, fontSize: '0.78rem' }}>
                    {p.configured ? 'Razorpay keys missing' : 'No Razorpay plan id configured'}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>

        {checkout && (
          <p style={{ fontSize: '0.88rem', marginBottom: 0 }}>
            Checkout opened in a new tab. If it was blocked, use{' '}
            <a href={checkout} target="_blank" rel="noreferrer" style={{ color: C.accent }}>
              this link
            </a>
            . Your plan activates when Razorpay sends the subscription webhook — not when the tab
            closes.
          </p>
        )}

        <p style={{ color: C.muted, fontSize: '0.75rem', marginBottom: 0 }}>
          Only the org owner can subscribe. Hitting a limit returns 402 carrying the upgrade path,
          and limits are copied onto the organization when the plan activates.
        </p>
      </Card>
    </div>
  );
}
