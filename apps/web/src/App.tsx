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

import { EyeIcon } from './components/EyeIcon';
import { PasswordSuggestions } from './components/PasswordSuggestions';
import { evaluatePassword, isValidEmail } from './utils/passwordUtils';

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
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [blinkingPass, setBlinkingPass] = useState(false);
  const [blinkingConfirm, setBlinkingConfirm] = useState(false);
  const [touchedEmail, setTouchedEmail] = useState(false);

  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const isEmailValid = isValidEmail(email);
  const { checks: pwdChecks, strength: pwdStrength } = evaluatePassword(password);
  const pwdScore = pwdStrength.score;

  function togglePassVisibility() {
    setBlinkingPass(true);
    setShowPassword((prev) => !prev);
    setTimeout(() => setBlinkingPass(false), 300);
  }

  function toggleConfirmVisibility() {
    setBlinkingConfirm(true);
    setShowConfirmPassword((prev) => !prev);
    setTimeout(() => setBlinkingConfirm(false), 300);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!isEmailValid) {
      setError(new Error('Please enter a valid email address (e.g. name@domain.com)'));
      return;
    }
    if (mode === 'register') {
      if (password !== confirmPassword) {
        setError(new Error('Passwords do not match'));
        return;
      }
      if (pwdScore < 3) {
        setError(new Error('Password must be stronger and meet the safety criteria'));
        return;
      }
    }
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
        <div className="fp-card" style={{ width: 420, padding: '2rem 2.2rem' }}>
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
                  placeholder="John Doe"
                  required
                />
              </Field>
            )}

            <Field label="Email">
              <input
                className="fp-input"
                style={{
                  ...S.input,
                  borderColor: touchedEmail && !isEmailValid ? C.red : undefined,
                }}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => setTouchedEmail(true)}
                placeholder="you@company.com"
                required
              />
              {touchedEmail && !isEmailValid && (
                <div style={{ color: C.red, fontSize: '0.76rem', marginTop: 4 }}>
                  Please enter a valid email address
                </div>
              )}
            </Field>

            <Field label="Password">
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <input
                  className="fp-input"
                  style={{ ...S.input, width: '100%', paddingRight: '2.5rem' }}
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  minLength={8}
                  required
                />
                <button
                  type="button"
                  onClick={togglePassVisibility}
                  title={showPassword ? 'Hide password' : 'Show password'}
                  style={{
                    position: 'absolute',
                    right: 8,
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: C.muted,
                    padding: 4,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <EyeIcon show={showPassword} blinking={blinkingPass} />
                </button>
              </div>

              {/* Password Suggestion Popover */}
              <PasswordSuggestions
                onSelect={(suggested) => {
                  setPassword(suggested);
                  setConfirmPassword(suggested);
                }}
              />

              {/* Strong Password Indications */}
              {password.length > 0 && (
                <div style={{ marginTop: 6, fontSize: '0.78rem' }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: 4,
                    }}
                  >
                    <span style={{ color: C.muted }}>Password Strength:</span>
                    <span style={{ fontWeight: 700, color: pwdStrength.color }}>
                      {pwdStrength.label}
                    </span>
                  </div>
                  <div
                    style={{
                      height: 4,
                      width: '100%',
                      background: C.border,
                      borderRadius: 2,
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        height: '100%',
                        width: `${(pwdScore / 5) * 100}%`,
                        background: pwdStrength.color,
                        transition: 'width 0.3s ease, background 0.3s ease',
                      }}
                    />
                  </div>
                  {mode === 'register' && (
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: '3px 8px',
                        marginTop: 6,
                        fontSize: '0.73rem',
                      }}
                    >
                      <span style={{ color: pwdChecks.length ? C.green : C.muted }}>
                        {pwdChecks.length ? '✓' : '○'} Min 8 characters
                      </span>
                      <span
                        style={{
                          color: pwdChecks.upper && pwdChecks.lower ? C.green : C.muted,
                        }}
                      >
                        {pwdChecks.upper && pwdChecks.lower ? '✓' : '○'} Uppercase & Lowercase
                      </span>
                      <span style={{ color: pwdChecks.number ? C.green : C.muted }}>
                        {pwdChecks.number ? '✓' : '○'} At least 1 number
                      </span>
                      <span style={{ color: pwdChecks.special ? C.green : C.muted }}>
                        {pwdChecks.special ? '✓' : '○'} Special character
                      </span>
                    </div>
                  )}
                </div>
              )}
            </Field>

            {mode === 'register' && (
              <Field label="Confirm Password">
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <input
                    className="fp-input"
                    style={{
                      ...S.input,
                      width: '100%',
                      paddingRight: '2.5rem',
                      borderColor:
                        confirmPassword.length > 0 && confirmPassword !== password
                          ? C.red
                          : undefined,
                    }}
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                  />
                  <button
                    type="button"
                    onClick={toggleConfirmVisibility}
                    title={showConfirmPassword ? 'Hide password' : 'Show password'}
                    style={{
                      position: 'absolute',
                      right: 8,
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: C.muted,
                      padding: 4,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <EyeIcon show={showConfirmPassword} blinking={blinkingConfirm} />
                  </button>
                </div>
                {confirmPassword.length > 0 && confirmPassword !== password && (
                  <div style={{ color: C.red, fontSize: '0.76rem', marginTop: 4 }}>
                    Passwords do not match
                  </div>
                )}
              </Field>
            )}

            <Err error={error} />
            <div style={{ display: 'grid', gap: 10, marginTop: '0.8rem' }}>
              <Btn
                disabled={
                  busy ||
                  (touchedEmail && !isEmailValid) ||
                  (mode === 'register' && confirmPassword.length > 0 && confirmPassword !== password)
                }
              >
                {busy ? 'One moment…' : mode === 'login' ? 'Sign in' : 'Create account'}
              </Btn>
              <Btn
                kind="ghost"
                onClick={() => {
                  setError(null);
                  setMode(mode === 'login' ? 'register' : 'login');
                }}
              >
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
  collapsed,
  onClick,
}: {
  active: boolean;
  icon: string;
  label: string;
  badge?: number;
  collapsed?: boolean;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      title={collapsed ? label : undefined}
      className={`fp-nav-item${active ? ' active' : ''}`}
      style={{
        padding: collapsed ? '0.45rem 0' : '0.45rem 0.65rem',
        borderRadius: 10,
        cursor: 'pointer',
        fontSize: '0.88rem',
        color: C.muted,
        display: 'flex',
        alignItems: 'center',
        justifyContent: collapsed ? 'center' : 'flex-start',
        gap: collapsed ? 0 : 9,
        marginBottom: 2,
        position: 'relative',
      }}
    >
      <span style={{ fontSize: collapsed ? '1.05rem' : '0.9rem' }}>{icon}</span>
      {!collapsed && <span style={{ flex: 1, whiteSpace: 'nowrap' }}>{label}</span>}
      {badge !== undefined && badge > 0 && (
        <span
          style={
            collapsed
              ? {
                  position: 'absolute',
                  top: 2,
                  right: 6,
                  background: C.red,
                  borderRadius: 999,
                  width: 8,
                  height: 8,
                }
              : {
                  background: C.red,
                  color: '#fff',
                  borderRadius: 999,
                  fontSize: '0.66rem',
                  fontWeight: 700,
                  padding: '0.05rem 0.42rem',
                }
          }
        >
          {collapsed ? '' : badge}
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
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem('fp-sidebar') === 'collapsed';
    } catch {
      return false;
    }
  });
  function toggleSidebar() {
    setCollapsed((c) => {
      try {
        localStorage.setItem('fp-sidebar', c ? 'open' : 'collapsed');
      } catch {
        /* ignore */
      }
      return !c;
    });
  }

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
      <div style={{ position: 'sticky', top: 0, height: '100vh', flexShrink: 0, zIndex: 20 }}>
        <aside
          className="fp-sidebar"
          style={{
            width: collapsed ? 64 : 226,
            height: '100%',
            background: C.panel,
            borderRight: `1px solid ${C.border}`,
            padding: collapsed ? '1.1rem 0.55rem' : '1.1rem 0.8rem',
            overflowY: 'auto',
          }}
        >
          <div
            style={{
              paddingLeft: collapsed ? 0 : 8,
              marginBottom: '1.1rem',
              textAlign: collapsed ? 'center' : 'left',
            }}
          >
            {collapsed ? (
              <span style={{ fontWeight: 800, fontSize: '1.1rem', color: C.accent }}>F</span>
            ) : (
              <Logo />
            )}
          </div>
          {NAV.map((section) => (
            <div key={section.group}>
              {section.group &&
                (collapsed ? (
                  <div style={{ borderTop: `1px solid ${C.border}`, margin: '0.7rem 0.4rem' }} />
                ) : (
                  <div
                    style={{
                      color: C.muted,
                      fontSize: '0.65rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.12em',
                      fontWeight: 700,
                      margin: '1rem 0 0.25rem',
                      paddingLeft: 10,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {section.group}
                  </div>
                ))}
              {section.items.map((item) => (
                <NavItem
                  key={item.key}
                  active={route === item.key}
                  icon={item.icon}
                  label={item.label}
                  badge={item.key === 'notifications' ? unread : undefined}
                  collapsed={collapsed}
                  onClick={() => go(item.key)}
                />
              ))}
            </div>
          ))}
          {isAdmin && (
            <div>
              {collapsed ? (
                <div style={{ borderTop: `1px solid ${C.border}`, margin: '0.7rem 0.4rem' }} />
              ) : (
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
              )}
              <NavItem
                active={route === 'admin'}
                icon="🛠️"
                label="Admin console"
                collapsed={collapsed}
                onClick={() => go('admin')}
              />
            </div>
          )}
        </aside>
        <button
          className="fp-collapse"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          onClick={toggleSidebar}
        >
          {collapsed ? '▶' : '◀'}
        </button>
      </div>

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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    api<{ accessToken: string; user: PublicUser }>('POST', '/api/v1/auth/refresh')
      .then(async (data) => {
        if (!active) return;
        setAccessToken(data.accessToken);
        setUser(data.user);
        try {
          const savedCompId = localStorage.getItem('fp-company-id');
          const comps = await api<{ companies: CompanyRow[] }>('GET', '/api/v1/companies');
          if (!active) return;
          const match =
            comps.companies.find((c) => c.id === savedCompId) ??
            (comps.companies.length === 1 ? comps.companies[0] : null);
          if (match) {
            setCompanyId(match.id);
            setCompany(match);
          }
        } catch {
          /* ignore company fetch error */
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  function logout() {
    void api('POST', '/api/v1/auth/logout', {}).catch(() => undefined);
    try {
      localStorage.removeItem('fp-company-id');
    } catch {
      /* ignore */
    }
    setAccessToken(null);
    setCompanyId(null);
    setUser(null);
    setCompany(null);
  }

  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg)',
        }}
      >
        <div style={{ animation: 'fp-pulse 1.2s ease-in-out infinite' }}>
          <Logo size="1.6rem" />
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh' }}>
      {!user && <AuthPage onLoggedIn={setUser} />}
      {user && !company && (
        <CompanyPicker
          user={user}
          onPicked={(c) => {
            setCompanyId(c.id);
            try {
              localStorage.setItem('fp-company-id', c.id);
            } catch {
              /* ignore */
            }
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
