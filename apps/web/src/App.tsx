/**
 * FinPilot shell: a real auth page (login/register) → company → the grouped
 * sidebar. Hash routing, zero router deps. Light/dark themes ride on CSS
 * variables (index.css). The impersonation banner is LOUD by design (§32
 * Phase 23) and driven by response headers captured in lib/api.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  api,
  getImpersonation,
  onImpersonationChange,
  setAccessToken,
  setCompanyId,
} from './lib/api';
import { Btn, C, Card, Err, Field, Row, S, ThemeToggle, useLoad } from './lib/ui';
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

function Logo({ size = '1.15rem' }: { size?: string }) {
  return (
    <span style={{ fontWeight: 800, fontSize: size, letterSpacing: '-0.02em' }}>
      Fin
      <span
        style={{
          background: `linear-gradient(135deg, ${C.accent}, ${C.accent2})`,
          WebkitBackgroundClip: 'text',
          backgroundClip: 'text',
          color: 'transparent',
        }}
      >
        Pilot
      </span>
    </span>
  );
}

// ── auth page ───────────────────────────────────────────────────────────────

const SELLING_POINTS = [
  ['🧾', 'GST-compliant invoicing with gapless numbering and e-invoice IRN'],
  ['🤖', 'An AI copilot that narrates numbers the engine computes — never invents one'],
  ['🏦', 'Bank reconciliation with auto-suggested matches you confirm'],
  ['📸', 'Photograph a vendor bill — OCR drafts the entry, you approve it'],
] as const;

function AuthPage({ onLoggedIn }: { onLoggedIn: (user: PublicUser) => void }) {
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
        { email, password },
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
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {/* brand hero */}
      <div
        style={{
          flex: '1 1 46%',
          position: 'relative',
          overflow: 'hidden',
          background: `linear-gradient(150deg, #e85d0b 0%, #c6482b 55%, #1b1712 130%)`,
          color: '#fff',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '4rem 3.2rem',
        }}
      >
        <div
          className="fp-blob"
          style={{ width: 380, height: 380, background: '#f59e1b', top: -90, right: -70 }}
        />
        <div
          className="fp-blob"
          style={{
            width: 300,
            height: 300,
            background: '#fbbf3b',
            bottom: -60,
            left: -80,
            animationDelay: '-7s',
          }}
        />
        <div
          style={{ position: 'relative', maxWidth: 480, animation: 'fp-fade-up 0.5s ease both' }}
        >
          <div
            style={{
              fontWeight: 800,
              fontSize: '2rem',
              letterSpacing: '-0.03em',
              marginBottom: '1rem',
            }}
          >
            FinPilot <span style={{ opacity: 0.85 }}>AI</span>
          </div>
          <h1
            style={{
              fontSize: '1.65rem',
              lineHeight: 1.25,
              margin: '0 0 1rem',
              letterSpacing: '-0.02em',
            }}
          >
            Your books, on autopilot.
            <br />
            Your numbers, guaranteed real.
          </h1>
          <p style={{ opacity: 0.9, lineHeight: 1.6, marginBottom: '2rem' }}>
            Cloud accounting for Indian SMEs — three days of GST reconciliation a month becomes one
            click, and "how much cash will I have in two weeks" finally has an answer.
          </p>
          {SELLING_POINTS.map(([icon, text], i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                gap: 12,
                alignItems: 'flex-start',
                marginBottom: '0.9rem',
                animation: `fp-fade-up 0.5s ease ${0.15 + i * 0.1}s both`,
              }}
            >
              <span style={{ fontSize: '1.15rem' }}>{icon}</span>
              <span style={{ fontSize: '0.92rem', opacity: 0.95, lineHeight: 1.45 }}>{text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* form panel */}
      <div
        style={{
          flex: '1 1 54%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem',
          position: 'relative',
        }}
      >
        <div style={{ position: 'absolute', top: 18, right: 18 }}>
          <ThemeToggle />
        </div>
        <div className="fp-card" style={{ width: 400, padding: '2rem 2.2rem' }}>
          <Logo size="1.4rem" />
          <h2 style={{ margin: '1.1rem 0 0.25rem', fontSize: '1.3rem', letterSpacing: '-0.02em' }}>
            {mode === 'login' ? 'Welcome back' : 'Create your account'}
          </h2>
          <p style={{ color: C.muted, fontSize: '0.88rem', marginTop: 0 }}>
            {mode === 'login'
              ? 'Sign in to your books.'
              : 'Free plan — one company, 50 invoices a month, AI included.'}
          </p>
          <form onSubmit={submit}>
            {mode === 'register' && (
              <Field label="Your name">
                <input
                  className="fp-input"
                  style={S.input}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </Field>
            )}
            <Field label="Email">
              <input
                className="fp-input"
                style={S.input}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </Field>
            <Field label="Password">
              <input
                className="fp-input"
                style={S.input}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                required
              />
            </Field>
            <Err error={error} />
            <div style={{ display: 'grid', gap: 10, marginTop: '0.5rem' }}>
              <Btn disabled={busy}>
                {busy ? 'One moment…' : mode === 'login' ? 'Sign in' : 'Create account'}
              </Btn>
              <Btn kind="ghost" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
                {mode === 'login' ? 'New here? Create an account' : 'Already registered? Sign in'}
              </Btn>
            </div>
          </form>
        </div>
      </div>
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
      setLegalName('');
      companies.reload();
    } catch (err) {
      setError(err);
    }
  }

  return (
    <div style={{ maxWidth: 560, margin: '7vh auto', padding: '0 1rem' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1rem',
        }}
      >
        <Logo size="1.35rem" />
        <ThemeToggle />
      </div>
      <Card title={`Choose a company — ${user.email}`}>
        <Err error={companies.error} />
        {(companies.data?.companies ?? []).map((c, i) => (
          <div
            key={c.id}
            onClick={() => onPicked(c)}
            className="fp-card"
            style={{
              padding: '0.9rem 1.1rem',
              margin: '0.6rem 0',
              cursor: 'pointer',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              animationDelay: `${i * 0.06}s`,
            }}
          >
            <div>
              <div style={{ fontWeight: 700 }}>{c.legalName}</div>
              <div style={{ color: C.muted, fontSize: '0.8rem' }}>{c.role.name}</div>
            </div>
            <span style={{ color: C.accent, fontWeight: 800 }}>→</span>
          </div>
        ))}
        {companies.data?.companies.length === 0 && (
          <p style={{ color: C.muted, fontSize: '0.9rem' }}>
            No companies yet — create your first below.
          </p>
        )}
      </Card>
      <Card title="Create a company">
        <form onSubmit={create}>
          <Field label="Legal name">
            <input
              className="fp-input"
              style={S.input}
              value={legalName}
              onChange={(e) => setLegalName(e.target.value)}
              required
            />
          </Field>
          <Row>
            <Field label="State code (24 = Gujarat)">
              <input
                className="fp-input"
                style={{ ...S.input, width: 110 }}
                value={stateCode}
                onChange={(e) => setStateCode(e.target.value)}
                required
              />
            </Field>
            <Field label="GSTIN (optional)">
              <input
                className="fp-input"
                style={{ ...S.input, width: 230 }}
                value={gstin}
                onChange={(e) => setGstin(e.target.value.toUpperCase())}
              />
            </Field>
          </Row>
          <Err error={error} />
          <Btn>Create company</Btn>
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

const NAV: Array<{ group: string; items: Array<{ key: string; label: string; icon: string }> }> = [
  { group: '', items: [{ key: 'dashboard', label: 'Dashboard', icon: '📊' }] },
  {
    group: 'Core ledger',
    items: [
      { key: 'accounts', label: 'Chart of accounts', icon: '🌳' },
      { key: 'journal', label: 'Journal', icon: '📖' },
      { key: 'trial-balance', label: 'Trial balance', icon: '⚖️' },
      { key: 'parties', label: 'Parties & items', icon: '👥' },
    ],
  },
  { group: 'Sales', items: [{ key: 'invoices', label: 'Invoicing', icon: '🧾' }] },
  {
    group: 'Purchases',
    items: [
      { key: 'bills', label: 'Bills & expenses', icon: '📥' },
      { key: 'documents', label: 'Scan a bill (OCR)', icon: '📸' },
    ],
  },
  {
    group: 'Money',
    items: [
      { key: 'payments', label: 'Payments', icon: '💸' },
      { key: 'banking', label: 'Banking & reco', icon: '🏦' },
    ],
  },
  { group: 'Compliance', items: [{ key: 'gst', label: 'GST & IMS', icon: '🛡️' }] },
  { group: 'Reports', items: [{ key: 'reports', label: 'All reports', icon: '📈' }] },
  { group: 'AI', items: [{ key: 'copilot', label: 'Copilot', icon: '✨' }] },
  {
    group: 'Platform',
    items: [
      { key: 'notifications', label: 'Notifications', icon: '🔔' },
      { key: 'team', label: 'Team', icon: '🤝' },
      { key: 'billing', label: 'Billing', icon: '💳' },
    ],
  },
];

const TITLES: Record<string, string> = Object.fromEntries(
  NAV.flatMap((s) => s.items.map((i) => [i.key, i.label])),
);

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

function NavItem({
  active,
  icon,
  label,
  badge,
  onClick,
}: {
  active: boolean;
  icon: string;
  label: string;
  badge?: number;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`fp-nav-item${active ? ' active' : ''}`}
      style={{
        padding: '0.45rem 0.65rem',
        borderRadius: 10,
        cursor: 'pointer',
        fontSize: '0.88rem',
        color: C.muted,
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        marginBottom: 2,
      }}
    >
      <span style={{ fontSize: '0.9rem' }}>{icon}</span>
      <span style={{ flex: 1 }}>{label}</span>
      {badge !== undefined && badge > 0 && (
        <span
          style={{
            background: C.red,
            color: '#fff',
            borderRadius: 999,
            fontSize: '0.66rem',
            fontWeight: 700,
            padding: '0.05rem 0.42rem',
          }}
        >
          {badge}
        </span>
      )}
    </div>
  );
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
          width: 226,
          flexShrink: 0,
          background: C.panel,
          borderRight: `1px solid ${C.border}`,
          padding: '1.1rem 0.8rem',
          position: 'sticky',
          top: 0,
          height: '100vh',
          overflowY: 'auto',
        }}
      >
        <div style={{ paddingLeft: 8, marginBottom: '1.1rem' }}>
          <Logo />
        </div>
        {NAV.map((section) => (
          <div key={section.group}>
            {section.group && (
              <div
                style={{
                  color: C.muted,
                  fontSize: '0.65rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.12em',
                  fontWeight: 700,
                  margin: '1rem 0 0.25rem',
                  paddingLeft: 10,
                }}
              >
                {section.group}
              </div>
            )}
            {section.items.map((item) => (
              <NavItem
                key={item.key}
                active={route === item.key}
                icon={item.icon}
                label={item.label}
                badge={item.key === 'notifications' ? unread : undefined}
                onClick={() => go(item.key)}
              />
            ))}
          </div>
        ))}
        {isAdmin && (
          <div>
            <div
              style={{
                color: C.muted,
                fontSize: '0.65rem',
                textTransform: 'uppercase',
                letterSpacing: '0.12em',
                fontWeight: 700,
                margin: '1rem 0 0.25rem',
                paddingLeft: 10,
              }}
            >
              Operator
            </div>
            <NavItem
              active={route === 'admin'}
              icon="🛠️"
              label="Admin console"
              onClick={() => go('admin')}
            />
          </div>
        )}
      </aside>

      <div style={{ flex: 1, minWidth: 0 }}>
        {imp && (
          <div
            className="fp-banner"
            style={{
              background: `linear-gradient(90deg, ${C.red}, ${C.accent})`,
              color: '#fff',
              padding: '0.55rem 1rem',
              fontWeight: 800,
              textAlign: 'center',
              letterSpacing: '0.02em',
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
            padding: '0.75rem 1.5rem',
            borderBottom: `1px solid ${C.border}`,
            background: C.panel,
            position: 'sticky',
            top: 0,
            zIndex: 5,
          }}
        >
          <div>
            <div style={{ fontWeight: 800, fontSize: '1.02rem', letterSpacing: '-0.01em' }}>
              {TITLES[route] ?? 'Dashboard'}
            </div>
            <div style={{ color: C.muted, fontSize: '0.75rem' }}>{company.legalName}</div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <span style={{ color: C.muted, fontSize: '0.8rem' }}>
              {user.name} · {company.role.name}
            </span>
            <ThemeToggle />
            <Btn small kind="ghost" onClick={onSwitch}>
              Switch company
            </Btn>
            <Btn small kind="ghost" onClick={onLogout}>
              Sign out
            </Btn>
          </div>
        </header>
        <main
          key={route}
          style={{ padding: '1.3rem 1.5rem', maxWidth: 1120, animation: 'fp-fade-in 0.25s ease' }}
        >
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
    <div style={{ minHeight: '100vh' }}>
      {!user && <AuthPage onLoggedIn={setUser} />}
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
