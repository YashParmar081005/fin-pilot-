/**
 * Super-admin console (§32 Phase 23) — only renders for platform operators
 * (403 otherwise). It reads ACROSS tenants, which nothing else in the product
 * does, so every destructive control here demands a written reason and lands
 * in the admin audit trail on the last tab.
 *
 * Impersonation REQUIRES a reason; the loud banner is driven by the
 * X-Impersonation-* response headers in lib/api.
 */
import { useState } from 'react';
import { api, qs, setAccessToken } from '../../lib/api';
import { Badge, Btn, C, Card, Err, Field, Row, S, Tbl, dateStr, useLoad } from '../../lib/ui';

interface Overview {
  organizations: number;
  companies: number;
  users: number;
  disabledUsers: number;
  invoices: number;
  bills: number;
  companiesWithDisabledSections: number;
  plans: { plan: string; count: number }[];
}
interface OrgRow {
  id: string;
  name: string;
  type: string;
  plan: string;
  companies: number;
  subscriptionStatus: string;
  createdAt: string;
}
interface CompanyRow {
  id: string;
  legalName: string;
  gstin: string | null;
  stateCode: string;
  organizationName: string;
  plan: string;
  disabledModules: string[];
  createdAt: string;
}
interface CompanyDetail {
  id: string;
  legalName: string;
  gstin: string | null;
  stateCode: string;
  disabledModules: string[];
  organization: { id: string; name: string; plan: string } | null;
  stats: { invoices: number; bills: number; members: number };
  members: { id: string; email: string; name: string; disabled: boolean }[];
}
interface ModuleDef {
  key: string;
  label: string;
  description: string;
  routes: string[];
}
interface UserRow {
  id: string;
  email: string;
  name: string;
  disabled: boolean;
  superAdmin: boolean;
  companies: number;
  lastLoginAt: string | null;
  createdAt: string;
}
interface AuditRow {
  id: string;
  action: string;
  adminEmail: string;
  targetType: string;
  targetId: string;
  reason: string | null;
  meta: Record<string, unknown>;
  at: string;
}
interface DeadLetter {
  _id: string;
  queue: string;
  jobId: string;
  error: string;
  failedAt: string;
  replayedAt: string | null;
}

type Tab = 'overview' | 'organizations' | 'companies' | 'users' | 'dlq' | 'audit';
const TABS: { key: Tab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'organizations', label: 'Organizations' },
  { key: 'companies', label: 'Companies & sections' },
  { key: 'users', label: 'Users' },
  { key: 'dlq', label: 'Dead letters' },
  { key: 'audit', label: 'Audit trail' },
];

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div
      style={{
        border: `1px solid ${C.border}`,
        borderRadius: 10,
        padding: '0.75rem 1rem',
        minWidth: 140,
        flex: '1 1 140px',
      }}
    >
      <div style={{ fontSize: '1.6rem', fontWeight: 700, color: tone ?? C.text }}>{value}</div>
      <div style={{ color: C.muted, fontSize: '0.78rem' }}>{label}</div>
    </div>
  );
}

/* ── the section switchboard for one company ─────────────────────────────── */
function CompanySections({ companyId, onSaved }: { companyId: string; onSaved: () => void }) {
  const detail = useLoad(
    () => api<{ company: CompanyDetail }>('GET', `/api/v1/admin/companies/${companyId}`),
    [companyId],
  );
  const modules = useLoad(() => api<{ modules: ModuleDef[] }>('GET', '/api/v1/admin/modules'));
  const [draft, setDraft] = useState<string[] | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const company = detail.data?.company;
  const disabled = draft ?? company?.disabledModules ?? [];
  const dirty =
    draft !== null &&
    JSON.stringify([...disabled].sort()) !==
      JSON.stringify([...(company?.disabledModules ?? [])].sort());

  function toggle(key: string) {
    const next = disabled.includes(key) ? disabled.filter((k) => k !== key) : [...disabled, key];
    setDraft(next);
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api('PATCH', `/api/v1/admin/companies/${companyId}/modules`, {
        disabledModules: disabled,
        reason,
      });
      setDraft(null);
      setReason('');
      detail.reload();
      onSaved();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  if (detail.busy) return <p style={{ color: C.muted }}>Loading…</p>;
  if (!company) return <Err error={detail.error} />;

  return (
    <div>
      <Row>
        <Stat label="Invoices" value={company.stats.invoices} />
        <Stat label="Bills" value={company.stats.bills} />
        <Stat label="Members" value={company.stats.members} />
      </Row>

      <p style={{ color: C.muted, fontSize: '0.82rem', marginTop: 14 }}>
        Switching a section off is enforced by the API, not just hidden in the nav — the routes it
        owns answer 403 for everyone in this company. The chart of accounts and the journal are not
        listed: every posting lands in them, so they cannot be switched off.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
        {(modules.data?.modules ?? []).map((m) => {
          const off = disabled.includes(m.key);
          return (
            <label
              key={m.key}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
                border: `1px solid ${off ? C.red : C.border}`,
                background: off ? 'transparent' : C.panel2,
                borderRadius: 8,
                padding: '0.6rem 0.8rem',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={!off}
                onChange={() => toggle(m.key)}
                style={{ marginTop: 3 }}
              />
              <span>
                <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{m.label}</span>{' '}
                <span style={{ color: off ? C.red : C.green, fontSize: '0.75rem' }}>
                  {off ? 'OFF' : 'on'}
                </span>
                <div style={{ color: C.muted, fontSize: '0.78rem' }}>{m.description}</div>
                <code style={{ color: C.muted, fontSize: '0.7rem' }}>{m.routes.join('  ')}</code>
              </span>
            </label>
          );
        })}
      </div>

      <Row>
        <Field label="Reason (min 10 chars — audited verbatim)">
          <input
            style={{ ...S.input, width: 380 }}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="why these sections are changing"
          />
        </Field>
        <Btn onClick={() => void save()} disabled={!dirty || reason.trim().length < 10 || busy}>
          {busy ? 'Saving…' : 'Save sections'}
        </Btn>
        {dirty && (
          <Btn kind="ghost" onClick={() => setDraft(null)}>
            Reset
          </Btn>
        )}
      </Row>
      <Err error={error} />
    </div>
  );
}

export function AdminPage({ onImpersonated }: { onImpersonated: () => void }) {
  const [tab, setTab] = useState<Tab>('overview');
  const [error, setError] = useState<unknown>(null);

  const overview = useLoad(() => api<Overview>('GET', '/api/v1/admin/overview'));
  const orgs = useLoad(() =>
    api<{ organizations: OrgRow[] }>('GET', '/api/v1/admin/organizations'),
  );
  const [companyQ, setCompanyQ] = useState('');
  const companies = useLoad(
    () => api<{ companies: CompanyRow[] }>('GET', `/api/v1/admin/companies${qs({ q: companyQ })}`),
    [companyQ],
  );
  const [userQ, setUserQ] = useState('');
  const users = useLoad(
    () => api<{ users: UserRow[] }>('GET', `/api/v1/admin/users${qs({ q: userQ })}`),
    [userQ],
  );
  const dlq = useLoad(() => api<{ deadLetters: DeadLetter[] }>('GET', '/api/v1/admin/dlq'));
  const audit = useLoad(() => api<{ audit: AuditRow[] }>('GET', '/api/v1/admin/audit'));

  const [openCompany, setOpenCompany] = useState<string | null>(null);
  const [targetUserId, setTargetUserId] = useState('');
  const [reason, setReason] = useState('');

  async function impersonate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const result = await api<{ token: string; sessionId: string }>(
        'POST',
        '/api/v1/admin/impersonate',
        { targetUserId, reason },
      );
      setAccessToken(result.token); // 15-min token; every request tagged + bannered
      onImpersonated();
    } catch (err) {
      setError(err);
    }
  }

  async function setUserDisabled(user: UserRow) {
    const why = window.prompt(
      `${user.disabled ? 'Re-enable' : 'Disable'} ${user.email}. Reason (min 10 chars, audited):`,
      '',
    );
    if (!why || why.trim().length < 10) return;
    setError(null);
    try {
      await api('PATCH', `/api/v1/admin/users/${user.id}/status`, {
        disabled: !user.disabled,
        reason: why,
      });
      users.reload();
      overview.reload();
      audit.reload();
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
      <Card
        title="Platform console"
        actions={
          <Row>
            {TABS.map((t) => (
              <Btn
                key={t.key}
                small
                kind={tab === t.key ? 'primary' : 'ghost'}
                onClick={() => setTab(t.key)}
              >
                {t.label}
              </Btn>
            ))}
          </Row>
        }
      >
        <p style={{ color: C.muted, fontSize: '0.82rem', margin: 0 }}>
          Every company and every organization on the platform, above the tenant boundary. Changes
          that affect a customer require a written reason and appear in the audit trail.
        </p>
      </Card>

      <Err error={error} />

      {tab === 'overview' && (
        <Card title="Platform at a glance">
          <Err error={overview.error} />
          <Row>
            <Stat label="Organizations" value={overview.data?.organizations ?? 0} />
            <Stat label="Companies" value={overview.data?.companies ?? 0} />
            <Stat label="Users" value={overview.data?.users ?? 0} />
            <Stat
              label="Disabled users"
              value={overview.data?.disabledUsers ?? 0}
              tone={overview.data?.disabledUsers ? C.red : undefined}
            />
          </Row>
          <Row>
            <Stat label="Invoices" value={overview.data?.invoices ?? 0} />
            <Stat label="Bills" value={overview.data?.bills ?? 0} />
            <Stat
              label="Companies with sections off"
              value={overview.data?.companiesWithDisabledSections ?? 0}
              tone={overview.data?.companiesWithDisabledSections ? C.amber : undefined}
            />
          </Row>
          <p style={{ color: C.muted, fontSize: '0.8rem', marginBottom: 4, marginTop: 16 }}>
            Organizations by plan
          </p>
          <Row>
            {(overview.data?.plans ?? []).map((p) => (
              <span key={p.plan} style={{ fontSize: '0.85rem' }}>
                <Badge value={p.plan} /> {p.count}
              </span>
            ))}
          </Row>
        </Card>
      )}

      {tab === 'organizations' && (
        <>
          <Card title={`Organizations · ${orgs.data?.organizations.length ?? 0}`}>
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
              15-minute token · every request lands in the session&apos;s action log · every audit
              row is tagged · the banner stays on until the session ends. The console itself is
              off-limits while impersonating.
            </p>
          </Card>
        </>
      )}

      {tab === 'companies' && (
        <Card
          title={`Companies · ${companies.data?.companies.length ?? 0}`}
          actions={
            <input
              style={{ ...S.input, margin: 0, width: 220 }}
              placeholder="search legal name…"
              value={companyQ}
              onChange={(e) => setCompanyQ(e.target.value)}
            />
          }
        >
          <Err error={companies.error} />
          <Tbl
            head={['Company', 'Organization', 'Plan', 'State', 'GSTIN', 'Sections off', '']}
            empty="No companies match."
            rows={(companies.data?.companies ?? []).map((c) => [
              c.legalName,
              c.organizationName,
              <Badge key="p" value={c.plan} />,
              c.stateCode,
              c.gstin ?? '—',
              c.disabledModules.length === 0 ? (
                <span key="m" style={{ color: C.green, fontSize: '0.8rem' }}>
                  all on
                </span>
              ) : (
                <span key="m" style={{ color: C.red, fontSize: '0.8rem' }}>
                  {c.disabledModules.join(', ')}
                </span>
              ),
              <Btn
                key="b"
                small
                kind={openCompany === c.id ? 'primary' : 'ghost'}
                onClick={() => setOpenCompany(openCompany === c.id ? null : c.id)}
              >
                {openCompany === c.id ? 'Close' : 'Sections'}
              </Btn>,
            ])}
          />
          {openCompany && (
            <div
              style={{
                marginTop: 14,
                borderTop: `1px solid ${C.border}`,
                paddingTop: 14,
              }}
            >
              <CompanySections
                companyId={openCompany}
                onSaved={() => {
                  companies.reload();
                  overview.reload();
                  audit.reload();
                }}
              />
            </div>
          )}
        </Card>
      )}

      {tab === 'users' && (
        <Card
          title={`Users · ${users.data?.users.length ?? 0}`}
          actions={
            <input
              style={{ ...S.input, margin: 0, width: 220 }}
              placeholder="search email…"
              value={userQ}
              onChange={(e) => setUserQ(e.target.value)}
            />
          }
        >
          <Err error={users.error} />
          <Tbl
            head={['Email', 'Name', 'Companies', 'Status', 'Last login', 'Id', 'Action']}
            empty="No users match."
            rows={(users.data?.users ?? []).map((u) => [
              u.email,
              u.name,
              u.companies,
              u.superAdmin ? (
                <Badge key="s" value="operator" />
              ) : u.disabled ? (
                <Badge key="s" value="rejected" />
              ) : (
                <Badge key="s" value="active" />
              ),
              u.lastLoginAt ? dateStr(u.lastLoginAt) : '—',
              <code key="i" style={{ fontSize: '0.7rem', color: C.muted }}>
                {u.id}
              </code>,
              u.superAdmin ? (
                <span key="a" style={{ color: C.muted, fontSize: '0.78rem' }}>
                  ops-only
                </span>
              ) : (
                <Btn
                  key="a"
                  small
                  kind={u.disabled ? 'success' : 'danger'}
                  onClick={() => void setUserDisabled(u)}
                >
                  {u.disabled ? 'Enable' : 'Disable'}
                </Btn>
              ),
            ])}
          />
          <p style={{ color: C.muted, fontSize: '0.75rem', marginBottom: 0 }}>
            Disabling revokes every session immediately; login and refresh both refuse afterwards.
            An access token already in flight stays valid for at most its 15-minute life. Platform
            operators cannot be disabled here — that flag is set out of band.
          </p>
        </Card>
      )}

      {tab === 'dlq' && (
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
      )}

      {tab === 'audit' && (
        <Card title="Admin audit trail — what operators did, and why">
          <Err error={audit.error} />
          <Tbl
            head={['When', 'Operator', 'Action', 'Target', 'Reason']}
            empty="Nothing yet."
            rows={(audit.data?.audit ?? []).map((a) => [
              dateStr(a.at),
              a.adminEmail,
              <Badge key="a" value={a.action} />,
              <span key="t" style={{ fontSize: '0.78rem' }}>
                {a.targetType}
                <br />
                <code style={{ color: C.muted, fontSize: '0.7rem' }}>{a.targetId}</code>
              </span>,
              <span key="r" style={{ fontSize: '0.8rem' }}>
                {a.reason ?? '—'}
              </span>,
            ])}
          />
        </Card>
      )}
    </div>
  );
}
