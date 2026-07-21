/** Health score + 13-week cash forecast + anomaly signals (§32 Phase 21). */
import { api } from '../../lib/api';
import { Badge, C, Card, Err, Money, Tbl, dateStr, useLoad } from '../../lib/ui';

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
  asOf: string;
  signals: Array<{
    rule: string;
    severity: string;
    detail?: Record<string, unknown>;
    message?: string;
  }>;
}

function scoreColor(score: number): string {
  return score >= 70 ? C.green : score >= 40 ? C.amber : C.red;
}

export function DashboardPage() {
  const health = useLoad(() => api<Health>('GET', '/api/v1/forecast/health'));
  const cash = useLoad(() => api<CashFlow>('GET', '/api/v1/forecast/cash-flow'));
  const anomalies = useLoad(() => api<Anomalies>('GET', '/api/v1/forecast/anomalies'));

  return (
    <div>
      <Card title="Business health">
        <Err error={health.error} />
        {health.data && (
          <div style={{ display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
            <div
              style={{
                fontSize: '2.6rem',
                fontWeight: 700,
                color: scoreColor(health.data.overall),
                minWidth: 90,
              }}
            >
              {health.data.overall}
              <span style={{ fontSize: '1rem', color: C.muted }}>/100</span>
            </div>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              {health.data.components.map((component) => (
                <div key={component.key} title={JSON.stringify(component.drivers, null, 2)}>
                  <div style={{ fontSize: '0.75rem', color: C.muted }}>{component.key}</div>
                  <div style={{ fontWeight: 600, color: scoreColor(component.score) }}>
                    {component.score}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        <p style={{ color: C.muted, fontSize: '0.75rem', marginBottom: 0 }}>
          Hover a component for its sub-formula drivers — every score is explainable, none is an LLM
          guess.
        </p>
      </Card>

      <Card title="13-week cash flow forecast (deterministic Monte Carlo — P10 / P50 / P90)">
        <Err error={cash.error} />
        {cash.data && (
          <>
            <p style={{ color: C.muted, fontSize: '0.85rem' }}>
              Opening cash <Money paise={cash.data.openingCashPaise} /> · as of{' '}
              {dateStr(cash.data.asOf)} · {cash.data.monthsOfHistory} months of history
              {cash.data.caveat ? ` · ${cash.data.caveat}` : ''}
            </p>
            <Tbl
              head={['Week', 'Inflow due', 'Outflow due', 'P10 (worst)', 'P50', 'P90 (best)']}
              rows={cash.data.weeks.map((week, i) => [
                week.week,
                <Money key="i" paise={week.inflowDuePaise} />,
                <Money key="o" paise={week.outflowDuePaise} />,
                <Money key="p10" paise={cash.data!.p10[i]} colored />,
                <Money key="p50" paise={cash.data!.p50[i]} colored />,
                <Money key="p90" paise={cash.data!.p90[i]} colored />,
              ])}
            />
          </>
        )}
      </Card>

      <Card title="Anomaly signals (duplicates, Benford, vendor bank-detail changes)">
        <Err error={anomalies.error} />
        {anomalies.data && (
          <Tbl
            head={['Rule', 'Severity', 'Detail']}
            empty="No anomalies flagged."
            rows={anomalies.data.signals.map((signal) => [
              signal.rule,
              <Badge key="s" value={signal.severity} />,
              <code key="d" style={{ fontSize: '0.75rem' }}>
                {signal.message ?? JSON.stringify(signal.detail)}
              </code>,
            ])}
          />
        )}
      </Card>
    </div>
  );
}
