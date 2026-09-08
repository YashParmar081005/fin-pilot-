/**
 * The owner's homepage: KPI stat tiles, the health gauge, the 13-week cash
 * band chart, weekly in/out flows, quick actions, and everything that needs
 * attention — all from engine-computed numbers (I9 applies to the AI; the
 * dashboard reads the same tool APIs directly).
 */
import { api, qs } from '../../lib/api';
import { Badge, Btn, C, Card, Err, Money, Tbl, dateStr, thisMonth, useLoad } from '../../lib/ui';
import { CashBandChart, FlowMirrorChart, HealthGauge, compactINR } from './charts';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Money01Icon,
  Mail01Icon,
  Upload01Icon,
  BarChartIcon,
  Invoice01Icon,
  FileDownloadIcon,
  Camera01Icon,
  MoneySend01Icon,
  BankIcon,
  ShieldCheck,
  AiMagicIcon,
  AlarmClockIcon,
  CheckmarkCircle01Icon,
  Search01Icon,
} from '@hugeicons/core-free-icons';

interface Health {
  overall: number;
  components: Array<{ key: string; score: number; drivers: Record<string, unknown> }>;
}
interface CashFlow {
  asOf: string;
  openingCashPaise: number;
  weeks: Array<{ week: string; inflowDuePaise: number; outflowDuePaise: number }>;
  p10: number[];
  p50: number[];
  p90: number[];
  monthsOfHistory: number;
  caveat: string;
}
interface Anomalies {
  signals: Array<{
    rule: string;
    severity: string;
    detail?: Record<string, unknown>;
    message?: string;
  }>;
}
interface Aged {
  totalPaise: number;
  buckets: Record<string, number>;
}
interface Pnl {
  totalIncomePaise: number;
  totalExpensesPaise: number;
  netProfitPaise: number;
}
interface InvoiceRow {
  id: string;
  invoiceNumber: string | null;
  partySnapshot: { name: string };
  issueDate: string;
  dueDate: string;
  status: string;
  grandTotalPaise: number;
  amountDuePaise: number;
}
interface BillRow {
  status: string;
}
interface Billing {
  plan: string;
  limits: { maxInvoicesMonth: number; aiTokensMonth: number };
  usage: { invoices: number; aiTokens: number };
}
interface ImsRecord {
  action: string;
}

const go = (route: string) => {
  window.location.hash = route;
};

function StatTile({
  label,
  paise,
  caption,
  icon,
  tone,
  onClick,
}: {
  label: string;
  paise: number | null;
  caption: string;
  icon: React.ReactNode;
  tone?: 'good' | 'bad';
  onClick?: () => void;
}) {
  return (
    <div
      className="fp-card fp-tile"
      onClick={onClick}
      style={{
        padding: '1.25rem 1.4rem',
        flex: '1 1 300px',
        minWidth: 300,
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span
          style={{
            fontSize: '0.8rem',
            fontWeight: 700,
            color: C.muted,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
          }}
        >
          {label}
        </span>
        <span
          style={{
            width: 50,
            height: 50,
            borderRadius: 14,
            background: C.accentSoft,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {icon}
        </span>
      </div>
      <div
        className="fp-mono"
        style={{
          fontSize: '1.75rem',
          fontWeight: 700,
          margin: '0.55rem 0 0.2rem',
          color: tone === 'good' ? C.green : tone === 'bad' ? C.red : C.text,
        }}
      >
        {paise === null ? '…' : compactINR(paise)}
      </div>
      <div style={{ fontSize: '0.82rem', color: C.muted }}>{caption}</div>
    </div>
  );
}

const QUICK_ACTIONS: Array<[React.ReactNode, string, string]> = [
  [<HugeiconsIcon key="1" icon={Invoice01Icon} size={30} />, 'New invoice', 'invoices'],
  [<HugeiconsIcon key="2" icon={FileDownloadIcon} size={30} />, 'Record a bill', 'bills'],
  [<HugeiconsIcon key="3" icon={Camera01Icon} size={30} />, 'Scan a bill', 'documents'],
  [<HugeiconsIcon key="4" icon={MoneySend01Icon} size={30} />, 'Record payment', 'payments'],
  [<HugeiconsIcon key="5" icon={BankIcon} size={30} />, 'Reconcile bank', 'banking'],
  [<HugeiconsIcon key="6" icon={ShieldCheck} size={30} />, 'GST & IMS', 'gst'],
  [<HugeiconsIcon key="7" icon={AiMagicIcon} size={30} />, 'Ask Copilot', 'copilot'],
  [<HugeiconsIcon key="8" icon={BarChartIcon} size={30} />, 'Run reports', 'reports'],
];

export function DashboardPage() {
  const health = useLoad(() => api<Health>('GET', '/api/v1/forecast/health'));
  const cash = useLoad(() => api<CashFlow>('GET', '/api/v1/forecast/cash-flow'));
  const anomalies = useLoad(() => api<Anomalies>('GET', '/api/v1/forecast/anomalies'));
  const ar = useLoad(() => api<Aged>('GET', '/api/v1/reports/aged-receivables'));
  const ap = useLoad(() => api<Aged>('GET', '/api/v1/reports/aged-payables'));
  const pnl = useLoad(() => api<Pnl>('GET', '/api/v1/reports/profit-loss'));
  const invoices = useLoad(() => api<{ invoices: InvoiceRow[] }>('GET', '/api/v1/invoices'));
  const bills = useLoad(() => api<{ bills: BillRow[] }>('GET', '/api/v1/bills'));
  const expenses = useLoad(() => api<{ expenses: BillRow[] }>('GET', '/api/v1/expenses'));
  const billing = useLoad(() => api<Billing>('GET', '/api/v1/billing'));
  const ims = useLoad(() =>
    api<{ records: ImsRecord[] }>('GET', `/api/v1/gst/ims${qs({ period: thisMonth() })}`).catch(
      () => ({ records: [] }),
    ),
  );

  const weekLabels = (cash.data?.weeks ?? []).map((_, i) => `W${i + 1}`);
  // `status === 'overdue'` is stamped by a nightly cron, so between the due
  // date and that tick an invoice is past due while still labelled "issued" —
  // the tile said "nothing overdue" while the health score read 100% overdue.
  // Anything still owed past its due date counts, whatever the stored label.
  const isOverdue = (i: InvoiceRow): boolean =>
    i.status === 'overdue' ||
    (i.amountDuePaise > 0 &&
      i.status !== 'draft' &&
      i.status !== 'paid' &&
      i.status !== 'cancelled' &&
      new Date(i.dueDate).getTime() < Date.now());
  const overdue = (invoices.data?.invoices ?? []).filter(isOverdue);
  const overduePaise = overdue.reduce((s, i) => s + i.amountDuePaise, 0);
  const pendingApprovals =
    (bills.data?.bills ?? []).filter((b) => b.status === 'pending_approval').length +
    (expenses.data?.expenses ?? []).filter((x) => x.status === 'pending_approval').length;
  const imsUnactioned = (ims.data?.records ?? []).filter((r) => r.action === 'no_action').length;
  const recent = (invoices.data?.invoices ?? []).slice(0, 5);

  const attention: Array<{
    icon: React.ReactNode;
    text: string;
    route: string;
    severity: 'bad' | 'warn' | 'ok';
  }> = [];
  if (overdue.length > 0)
    attention.push({
      icon: <HugeiconsIcon icon={AlarmClockIcon} size={28} />,
      text: `${overdue.length} overdue invoice(s) worth ${compactINR(overduePaise)}`,
      route: 'invoices',
      severity: 'bad',
    });
  if (pendingApprovals > 0)
    attention.push({
      icon: <HugeiconsIcon icon={CheckmarkCircle01Icon} size={28} />,
      text: `${pendingApprovals} bill/expense approval(s) waiting on you`,
      route: 'bills',
      severity: 'warn',
    });
  if (imsUnactioned > 0)
    attention.push({
      icon: <HugeiconsIcon icon={ShieldCheck} size={28} />,
      text: `${imsUnactioned} IMS record(s) unactioned — deemed accepted after the 14th`,
      route: 'gst',
      severity: 'bad',
    });
  for (const s of (anomalies.data?.signals ?? []).slice(0, 3))
    attention.push({
      icon: <HugeiconsIcon icon={Search01Icon} size={28} />,
      text: `${s.rule}: ${s.message ?? JSON.stringify(s.detail)}`,
      route: 'reports',
      severity: 'warn',
    });

  return (
    <div>
      {/* KPI tiles */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: '1.5rem' }}>
        <StatTile
          label="Cash on hand"
          paise={cash.data?.openingCashPaise ?? null}
          caption={`as of ${cash.data ? dateStr(cash.data.asOf) : '…'}`}
          icon={<HugeiconsIcon icon={Money01Icon} size={30} />}
          onClick={() => go('banking')}
        />
        <StatTile
          label="Receivables"
          paise={ar.data?.totalPaise ?? null}
          caption={
            overdue.length
              ? `${overdue.length} overdue — ${compactINR(overduePaise)}`
              : 'nothing overdue'
          }
          icon={<HugeiconsIcon icon={Mail01Icon} size={30} />}
          tone={overdue.length ? 'bad' : undefined}
          onClick={() => go('invoices')}
        />
        <StatTile
          label="Payables"
          paise={ap.data?.totalPaise ?? null}
          caption="what you owe vendors"
          icon={<HugeiconsIcon icon={Upload01Icon} size={30} />}
          onClick={() => go('bills')}
        />
        <StatTile
          label="Net profit (FY)"
          paise={pnl.data?.netProfitPaise ?? null}
          caption={
            pnl.data
              ? `${compactINR(pnl.data.totalIncomePaise)} in · ${compactINR(pnl.data.totalExpensesPaise)} out`
              : '…'
          }
          icon={<HugeiconsIcon icon={BarChartIcon} size={30} />}
          tone={pnl.data ? (pnl.data.netProfitPaise >= 0 ? 'good' : 'bad') : undefined}
          onClick={() => go('reports')}
        />
      </div>

      {/* health + forecast */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(280px, 1fr) minmax(0, 2.5fr)',
          gap: 20,
          marginBottom: 20,
        }}
      >
        <Card title="Business health">
          <Err error={health.error} />
          {health.data && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 12,
                padding: '0.5rem 0',
              }}
            >
              <HealthGauge score={health.data.overall} />
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                {health.data.components.map((comp) => (
                  <span
                    key={comp.key}
                    title={JSON.stringify(comp.drivers, null, 2)}
                    style={{
                      fontSize: '0.78rem',
                      border: `1px solid ${C.border}`,
                      borderRadius: 999,
                      padding: '0.2rem 0.65rem',
                      color: comp.score >= 70 ? C.green : comp.score >= 40 ? C.amber : C.red,
                      cursor: 'help',
                    }}
                  >
                    {comp.key} {comp.score}
                  </span>
                ))}
              </div>
              <p style={{ color: C.muted, fontSize: '0.78rem', textAlign: 'center', margin: 0 }}>
                Hover a component for its sub-formula — every score is explainable.
              </p>
            </div>
          )}
        </Card>
        <Card title="Projected cash — 13 weeks (P10 / P50 / P90)">
          <Err error={cash.error} />
          {cash.data && (
            <>
              <CashBandChart
                labels={weekLabels}
                p10={cash.data.p10}
                p50={cash.data.p50}
                p90={cash.data.p90}
              />
              <p style={{ color: C.muted, fontSize: '0.78rem', margin: '0.6rem 0 0' }}>
                Deterministic Monte Carlo from {cash.data.monthsOfHistory} month(s) of history — not
                an LLM.
                {cash.data.caveat ? ` ${cash.data.caveat}` : ''}
              </p>
            </>
          )}
        </Card>
      </div>

      {/* flows + quick actions */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 2.5fr) minmax(280px, 1fr)',
          gap: 20,
          marginTop: 20,
        }}
      >
        <Card title="Money due in vs out, by week">
          <Err error={cash.error} />
          {cash.data && (
            <FlowMirrorChart
              labels={weekLabels}
              inflow={cash.data.weeks.map((w) => w.inflowDuePaise)}
              outflow={cash.data.weeks.map((w) => w.outflowDuePaise)}
            />
          )}
        </Card>
        <Card title="Quick actions">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {QUICK_ACTIONS.map(([icon, label, route]) => (
              <div
                key={route}
                className="fp-card fp-quick"
                onClick={() => go(route)}
                style={{ padding: '0.9rem 0.6rem', textAlign: 'center', animation: 'none' }}
              >
                <div
                  style={{
                    fontSize: '1.5rem',
                    marginBottom: 6,
                    display: 'flex',
                    justifyContent: 'center',
                  }}
                >
                  {icon}
                </div>
                <div style={{ fontSize: '0.82rem', fontWeight: 700 }}>{label}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* attention + recent + plan */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(320px, 1fr) minmax(0, 1.8fr)',
          gap: 20,
          marginTop: 20,
        }}
      >
        <div>
          <Card title="Needs your attention">
            {attention.length === 0 ? (
              <p style={{ color: C.green, fontSize: '0.92rem', margin: 0 }}>
                ✓ All clear — nothing waiting on you.
              </p>
            ) : (
              attention.map((a, i) => (
                <div
                  key={i}
                  onClick={() => go(a.route)}
                  style={{
                    display: 'flex',
                    gap: 12,
                    alignItems: 'center',
                    padding: '0.65rem 0.8rem',
                    borderRadius: 12,
                    cursor: 'pointer',
                    background:
                      a.severity === 'bad'
                        ? 'color-mix(in srgb, var(--red) 8%, transparent)'
                        : 'color-mix(in srgb, var(--amber) 10%, transparent)',
                    marginBottom: 8,
                    fontSize: '0.88rem',
                    fontWeight: 500,
                  }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center' }}>{a.icon}</span>
                  <span>{a.text}</span>
                </div>
              ))
            )}
          </Card>
          <Card title={`Plan — ${billing.data?.plan ?? '…'}`}>
            {billing.data && (
              <div style={{ fontSize: '0.8rem', display: 'grid', gap: 8 }}>
                <div>
                  <div style={{ color: C.muted, marginBottom: 3 }}>
                    Invoices this month · {billing.data.usage.invoices}/
                    {billing.data.limits.maxInvoicesMonth}
                  </div>
                  <div style={{ height: 7, background: C.panel2, borderRadius: 999 }}>
                    <div
                      style={{
                        height: 7,
                        borderRadius: 999,
                        background: `linear-gradient(90deg, ${C.accent}, ${C.accent2})`,
                        width: `${Math.min(100, (billing.data.usage.invoices / Math.max(1, billing.data.limits.maxInvoicesMonth)) * 100)}%`,
                        transition: 'width 0.6s ease',
                      }}
                    />
                  </div>
                </div>
                <div>
                  <div style={{ color: C.muted, marginBottom: 3 }}>
                    AI tokens · {billing.data.usage.aiTokens.toLocaleString('en-IN')}/
                    {billing.data.limits.aiTokensMonth.toLocaleString('en-IN')}
                  </div>
                  <div style={{ height: 7, background: C.panel2, borderRadius: 999 }}>
                    <div
                      style={{
                        height: 7,
                        borderRadius: 999,
                        background: `linear-gradient(90deg, ${C.accent}, ${C.accent2})`,
                        width: `${Math.min(100, (billing.data.usage.aiTokens / Math.max(1, billing.data.limits.aiTokensMonth)) * 100)}%`,
                        transition: 'width 0.6s ease',
                      }}
                    />
                  </div>
                </div>
                <Btn small kind="ghost" onClick={() => go('billing')}>
                  Manage plan
                </Btn>
              </div>
            )}
          </Card>
        </div>
        <Card
          title="Recent invoices"
          actions={
            <Btn small kind="ghost" onClick={() => go('invoices')}>
              View all
            </Btn>
          }
        >
          <Err error={invoices.error} />
          <Tbl
            head={['Number', 'Customer', 'Date', 'Status', 'Total', 'Due']}
            empty="No invoices yet — create your first from Quick actions."
            rows={recent.map((inv) => [
              inv.invoiceNumber ?? <i style={{ color: C.muted }}>draft</i>,
              inv.partySnapshot?.name,
              dateStr(inv.issueDate),
              <Badge key="s" value={inv.status} />,
              <Money key="t" paise={inv.grandTotalPaise} />,
              <Money key="d" paise={inv.amountDuePaise} />,
            ])}
          />
        </Card>
      </div>
    </div>
  );
}
