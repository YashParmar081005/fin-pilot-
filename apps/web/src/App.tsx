/**
 * FinPilot shell: login/register → company → the grouped sidebar. Hash
 * routing, zero router deps. The impersonation banner is LOUD by design
 * (§32 Phase 23) and driven by response headers captured in lib/api.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  api,
  getImpersonation,
  onImpersonationChange,
  setAccessToken,
  setCompanyId,
} from './lib/api';
import { Btn, C, Card, Err, Field, Row, S, useLoad } from './lib/ui';
import { AccountsTree, type AccountRow } from './features/accounts/AccountsTree';
import { JournalPage } from './features/journal/JournalPage';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { TrialBalancePage } from './features/ledger/TrialBalancePage';
import { PartiesPage } from './features/parties/PartiesPage';
import { InvoicesPage } from './features/sales/InvoicesPage';
import { BillsPage } from './features/purchases/BillsPage';
import { PaymentsPage } from './features/money/PaymentsPage';
import { BankingPage } from './features/money/BankingPage';
import { DocumentsPage } from './features/documents/DocumentsPage';
import { GstPage } from './features/compliance/GstPage';
import { ReportsPage } from './features/reports/ReportsPage';
import { CopilotPage } from './features/copilot/CopilotPage';
import { NotificationsPage } from './features/platform/NotificationsPage';
import { MembersPage } from './features/platform/MembersPage';
import { BillingPage } from './features/platform/BillingPage';
import { AdminPage } from './features/platform/AdminPage';

interface PublicUser {
  id: string;
  email: string;
  name: string;
}
interface CompanyRow {
  id: string;
  legalName: string;
  role: { key: string; name: string };
}

// ── auth ────────────────────────────────────────────────────────────────────

function AuthCard({ onLoggedIn }: { onLoggedIn: (user: PublicUser) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'register') {
        await api('POST', '/api/v1/auth/register', { email, password, name });
      }
      const data = await api<{ accessToken: string; user: PublicUser }>(
        'POST',
        '/api/v1/auth/login',
        {
          email,
          password,
        },
      );
      setAccessToken(data.accessToken);
      onLoggedIn(data.user);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 420, margin: '8vh auto' }}>
      <Card title={undefined}>
        <h1 style={{ marginTop: 0 }}>FinPilot AI</h1>
        <p style={{ color: C.muted, marginTop: -8 }}>
          Cloud accounting for Indian SMEs — the AI narrates numbers the engine computes.
        </p>
        <form onSubmit={submit}>
          {mode === 'register' && (
            <Field label="Your name">
              <input
                style={S.input}
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </Field>
          )}
          <Field label="Email">
            <input
              style={S.input}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </Field>
          <Field label="Password">
            <input
              style={S.input}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </Field>
          <Err error={error} />
          <Row>
            <Btn disabled={busy}>
              {busy ? '…' : mode === 'login' ? 'Sign in' : 'Create account'}
            </Btn>
            <Btn kind="ghost" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
              {mode === 'login' ? 'New here? Register' : 'Have an account? Sign in'}
            </Btn>
          </Row>
        </form>
      </Card>
    </div>
  );
}

// ── company pick / create ───────────────────────────────────────────────────

function CompanyPicker({
  user,
  onPicked,
}: {
  user: PublicUser;
  onPicked: (c: CompanyRow) => void;
}) {
  const companies = useLoad(() => api<{ companies: CompanyRow[] }>('GET', '/api/v1/companies'));
  const [legalName, setLegalName] = useState('');
  const [stateCode, setStateCode] = useState('24');
  const [gstin, setGstin] = useState('');
  const [error, setError] = useState<unknown>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api('POST', '/api/v1/companies', {
        legalName,
        stateCode,
        booksBeginDate: `${new Date().getFullYear()}-04-01`,
        ...(gstin ? { gstin } : {}),
      });
      companies.reload();
    } catch (err) {
      setError(err);
    }
  }

  return (
    <div style={{ maxWidth: 520, margin: '8vh auto' }}>
      <Card title={`Choose a company — ${user.email}`}>
        <Err error={companies.error} />
        {(companies.data?.companies ?? []).map((c) => (
          <div key={c.id} style={{ margin: '0.5rem 0' }}>
            <Btn onClick={() => onPicked(c)}>
              {c.legalName} <span style={{ fontWeight: 400 }}>— {c.role.name}</span>
            </Btn>
          </div>
        ))}
      </Card>
      <Card title="Create a company">
        <form onSubmit={create}>
          <Field label="Legal name">
            <input
              style={S.input}
              value={legalName}
              onChange={(e) => setLegalName(e.target.value)}
              required
            />
          </Field>
          <Row>
            <Field label="State code (24 = Gujarat)">
              <input
                style={{ ...S.input, width: 100 }}
                value={stateCode}
                onChange={(e) => setStateCode(e.target.value)}
                required
              />
            </Field>
            <Field label="GSTIN (optional)">
              <input
                style={{ ...S.input, width: 220 }}
                value={gstin}
                onChange={(e) => setGstin(e.target.value.toUpperCase())}
              />
            </Field>
          </Row>
          <Err error={error} />
          <Btn>Create</Btn>
        </form>
      </Card>
    </div>
  );
}

// ── ledger tab wrappers (fetch accounts once) ───────────────────────────────

function AccountsPageWrap() {
  const { data, error, reload } = useLoad(() =>
    api<{ accounts: AccountRow[] }>('GET', '/api/v1/accounts'),
  );
  const [busy, setBusy] = useState(false);
  async function seed() {
    setBusy(true);
    try {
      await api('POST', '/api/v1/accounts/import-template');
      reload();
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card title="Chart of accounts — Indian SME template, Schedule III groupings">
      <Err error={error} />
      {data && data.accounts.length === 0 && (
        <Btn onClick={() => void seed()} disabled={busy}>
          {busy ? 'Seeding…' : 'Seed the 60-account Indian SME chart'}
        </Btn>
      )}
      {data && data.accounts.length > 0 && <AccountsTree accounts={data.accounts} />}
    </Card>
  );
}

function JournalPageWrap() {
  const { data, error } = useLoad(() => api<{ accounts: AccountRow[] }>('GET', '/api/v1/accounts'));
  return (
    <div>
      <Err error={error} />
      {data && <JournalPage accounts={data.accounts} />}
    </div>
  );
}

// ── navigation ──────────────────────────────────────────────────────────────

const NAV: Array<{ group: string; items: Array<{ key: string; label: string }> }> = [
  { group: '', items: [{ key: 'dashboard', label: 'Dashboard' }] },
  {
    group: 'Core ledger',
    items: [
      { key: 'accounts', label: 'Chart of accounts' },
      { key: 'journal', label: 'Journal' },
      { key: 'trial-balance', label: 'Trial balance' },
      { key: 'parties', label: 'Parties & items' },
    ],
  },
  { group: 'Sales', items: [{ key: 'invoices', label: 'Invoicing' }] },
  {
    group: 'Purchases',
    items: [
      { key: 'bills', label: 'Bills & expenses' },
      { key: 'documents', label: 'Scan a bill (OCR)' },
    ],
  },
  {
    group: 'Money',
    items: [
      { key: 'payments', label: 'Payments' },
      { key: 'banking', label: 'Banking & reconciliation' },
    ],
  },
  { group: 'Compliance', items: [{ key: 'gst', label: 'GST & IMS' }] },
  { group: 'Reports', items: [{ key: 'reports', label: 'All reports' }] },
  { group: 'AI', items: [{ key: 'copilot', label: 'Copilot' }] },
  {
    group: 'Platform',
    items: [
      { key: 'notifications', label: 'Notifications' },
      { key: 'team', label: 'Team' },
      { key: 'billing', label: 'Billing' },
    ],
  },
];

function useHashRoute(): [string, (r: string) => void] {
  const [route, setRoute] = useState(window.location.hash.slice(1) || 'dashboard');
  useEffect(() => {
    const onHash = () => setRoute(window.location.hash.slice(1) || 'dashboard');
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return [
    route,
    (r: string) => {
      window.location.hash = r;
    },
  ];
}

function Shell({
  user,
  company,
  onSwitch,
  onLogout,
}: {
  user: PublicUser;
  company: CompanyRow;
  onSwitch: () => void;
  onLogout: () => void;
}) {
  const [route, go] = useHashRoute();
  const [isAdmin, setIsAdmin] = useState(false);
  const [unread, setUnread] = useState(0);
  const [imp, setImp] = useState(getImpersonation());

  useEffect(() => onImpersonationChange(setImp), []);
  useEffect(() => {
    api<{ organizations: unknown[] }>('GET', '/api/v1/admin/organizations')
      .then(() => setIsAdmin(true))
      .catch(() => setIsAdmin(false));
  }, []);
  const pollUnread = useCallback(() => {
    api<{ notifications: Array<{ readAt: string | null }> }>('GET', '/api/v1/notifications')
      .then((d) => setUnread(d.notifications.filter((n) => !n.readAt).length))
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    pollUnread();
    const t = setInterval(pollUnread, 30_000);
    return () => clearInterval(t);
  }, [pollUnread]);

  const PAGES: Record<string, React.ReactNode> = {
    dashboard: <DashboardPage />,
    accounts: <AccountsPageWrap />,
    journal: <JournalPageWrap />,
    'trial-balance': <TrialBalancePage />,
    parties: <PartiesPage />,
    invoices: <InvoicesPage />,
    bills: <BillsPage />,
    documents: <DocumentsPage />,
    payments: <PaymentsPage />,
    banking: <BankingPage />,
    gst: <GstPage />,
    reports: <ReportsPage />,
    copilot: <CopilotPage />,
    notifications: <NotificationsPage />,
    team: <MembersPage />,
    billing: <BillingPage />,
    admin: <AdminPage onImpersonated={() => go('dashboard')} />,
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <aside
        style={{
          width: 220,
          flexShrink: 0,
          background: C.panel,
          borderRight: `1px solid ${C.border}`,
          padding: '1rem 0.8rem',
        }}
      >
        <div style={{ fontWeight: 700, fontSize: '1.05rem', marginBottom: '1rem', paddingLeft: 8 }}>
          Fin<span style={{ color: C.accent }}>Pilot</span> AI
        </div>
        {NAV.map((section) => (
          <div key={section.group}>
            {section.group && (
              <div
                style={{
                  color: C.muted,
                  fontSize: '0.68rem',
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                  margin: '0.9rem 0 0.2rem',
                  paddingLeft: 8,
                }}
              >
                {section.group}
              </div>
            )}
            {section.items.map((item) => (
              <div
                key={item.key}
                onClick={() => go(item.key)}
                style={{
                  padding: '0.42rem 0.6rem',
                  borderRadius: 8,
                  cursor: 'pointer',
                  fontSize: '0.88rem',
                  background: route === item.key ? C.panel2 : 'transparent',
                  color: route === item.key ? C.text : C.muted,
                  display: 'flex',
                  justifyContent: 'space-between',
                }}
              >
                <span>{item.label}</span>
                {item.key === 'notifications' && unread > 0 && (
                  <span
                    style={{
                      background: C.red,
                      color: '#fff',
                      borderRadius: 999,
                      fontSize: '0.68rem',
                      padding: '0 0.4rem',
                    }}
                  >
                    {unread}
                  </span>
                )}
              </div>
            ))}
          </div>
        ))}
        {isAdmin && (
          <div>
            <div
              style={{
                color: C.muted,
                fontSize: '0.68rem',
                textTransform: 'uppercase',
                letterSpacing: 1,
                margin: '0.9rem 0 0.2rem',
                paddingLeft: 8,
              }}
            >
              Operator
            </div>
            <div
              onClick={() => go('admin')}
              style={{
                padding: '0.42rem 0.6rem',
                borderRadius: 8,
                cursor: 'pointer',
                fontSize: '0.88rem',
                background: route === 'admin' ? C.panel2 : 'transparent',
                color: route === 'admin' ? C.text : C.muted,
              }}
            >
              Admin console
            </div>
          </div>
        )}
      </aside>

      <div style={{ flex: 1, minWidth: 0 }}>
        {imp && (
          <div
            style={{
              background: C.red,
              color: '#fff',
              padding: '0.5rem 1rem',
              fontWeight: 700,
              textAlign: 'center',
            }}
          >
            ⚠ IMPERSONATION ACTIVE — you are acting as this user. Every action is logged to session{' '}
            {imp.sessionId.slice(-6)}.
          </div>
        )}
        <header
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '0.7rem 1.4rem',
            borderBottom: `1px solid ${C.border}`,
          }}
        >
          <div style={{ fontWeight: 600 }}>{company.legalName}</div>
          <Row gap={8}>
            <span style={{ color: C.muted, fontSize: '0.82rem' }}>
              {user.email} · {company.role.name}
            </span>
            <Btn small kind="ghost" onClick={onSwitch}>
              Switch company
            </Btn>
            <Btn small kind="ghost" onClick={onLogout}>
              Sign out
            </Btn>
          </Row>
        </header>
        <main style={{ padding: '1.2rem 1.4rem', maxWidth: 1080 }}>
          {PAGES[route] ?? <DashboardPage />}
        </main>
      </div>
    </div>
  );
}

// ── root ────────────────────────────────────────────────────────────────────

export function App() {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [company, setCompany] = useState<CompanyRow | null>(null);

  function logout() {
    void api('POST', '/api/v1/auth/logout', {}).catch(() => undefined);
    setAccessToken(null);
    setCompanyId(null);
    setUser(null);
    setCompany(null);
  }

  return (
    <div
      style={{
        fontFamily: 'system-ui, sans-serif',
        minHeight: '100vh',
        background: C.bg,
        color: C.text,
      }}
    >
      {!user && <AuthCard onLoggedIn={setUser} />}
      {user && !company && (
        <CompanyPicker
          user={user}
          onPicked={(c) => {
            setCompanyId(c.id);
            setCompany(c);
          }}
        />
      )}
      {user && company && (
        <Shell user={user} company={company} onSwitch={() => setCompany(null)} onLogout={logout} />
      )}
    </div>
  );
}
