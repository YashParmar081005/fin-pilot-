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
import { LandingPage } from './features/landing/LandingPage';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Invoice01Icon,
  AiBrain01Icon,
  BankIcon,
  Camera01Icon,
  Analytics01Icon,
  HierarchyIcon,
  Book01Icon,
  BalanceScaleIcon,
  UserGroupIcon,
  FileDownloadIcon,
  MoneySend01Icon,
  ShieldCheck,
  BarChartIcon,
  AiMagicIcon,
  Notification01Icon,
  CreditCardIcon,
  Wrench01Icon,
  Logout01Icon,
  ArrowReloadHorizontalIcon,
} from '@hugeicons/core-free-icons';

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

function Logo({ size = '1.35rem', color = 'var(--text)' }: { size?: string; color?: string }) {
  return (
    <span
      style={{
        fontSize: size,
        fontFamily: "'Space Grotesk', sans-serif",
        fontWeight: 500,
        letterSpacing: '-0.03em',
        color: color,
        display: 'inline-flex',
        alignItems: 'center',
      }}
    >
      Fin
      <span
        style={{
          fontFamily: "'Google Sans', sans-serif",
          fontWeight: 700,
          color: '#ff4404',
          marginLeft: '1px',
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

const SELLING_POINTS: Array<[React.ReactNode, string]> = [
  [<HugeiconsIcon key="1" icon={Invoice01Icon} size={20} />, 'GST-compliant invoicing with gapless numbering and e-invoice IRN'],
  [<HugeiconsIcon key="2" icon={AiBrain01Icon} size={20} />, 'An AI copilot that narrates numbers the engine computes — never invents one'],
  [<HugeiconsIcon key="3" icon={BankIcon} size={20} />, 'Bank reconciliation with auto-suggested matches you confirm'],
  [<HugeiconsIcon key="4" icon={Camera01Icon} size={20} />, 'Photograph a vendor bill — OCR drafts the entry, you approve it'],
];

function AuthPage({
  onLoggedIn,
  onBack,
}: {
  onLoggedIn: (user: PublicUser) => void;
  onBack?: () => void;
}) {
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
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: "'Inter', -apple-system, sans-serif" }}>
      <style>{`
        .auth-card {
          width: 100%;
          max-width: 440px;
          background-color: var(--panel);
          border: 1px solid var(--border);
          border-radius: 16px;
          padding: 40px 32px;
          box-shadow: var(--shadow-lift);
          transition: border-color 0.3s, box-shadow 0.3s, background-color 0.3s;
        }
        [data-theme='dark'] .auth-card {
          box-shadow: 0 20px 40px -15px rgba(0, 0, 0, 0.7), 0 0 50px -10px rgba(255, 68, 4, 0.04);
        }
        .airbnb-input {
          width: 100%;
          height: 48px;
          padding: 12px 16px;
          border-radius: 10px;
          border: 1px solid var(--border);
          background-color: var(--panel);
          color: var(--text);
          font-size: 15px;
          outline: none;
          font-family: 'Inter', -apple-system, sans-serif;
          transition: border-color 0.2s, box-shadow 0.2s, background-color 0.2s;
        }
        [data-theme='dark'] .airbnb-input {
          background-color: rgba(255, 255, 255, 0.02);
          border-color: rgba(255, 255, 255, 0.08);
        }
        .airbnb-input::placeholder {
          color: var(--muted);
          opacity: 0.6;
        }
        .airbnb-input:focus,
        .airbnb-input:focus-visible {
          border: 1px solid var(--accent);
          box-shadow: 0 0 0 3px var(--accent-glow);
        }
        .airbnb-input.error {
          border-color: var(--red);
        }
        .airbnb-input.error:focus,
        .airbnb-input.error:focus-visible {
          border: 1px solid var(--red);
          box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.15);
        }
        .airbnb-btn {
          width: 100%;
          height: 46px;
          padding: 12px 24px;
          border-radius: 10px;
          background-color: var(--accent);
          color: #ffffff;
          font-size: 15px;
          font-weight: 600;
          border: none;
          cursor: pointer;
          font-family: 'Inter', -apple-system, sans-serif;
          transition: background-color 0.2s, transform 0.1s, box-shadow 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .airbnb-btn:hover:not(:disabled) {
          background-color: var(--accent-2);
          box-shadow: 0 4px 12px var(--accent-glow);
          transform: translateY(-1px);
        }
        .airbnb-btn:active:not(:disabled) {
          transform: translateY(0) scale(0.985);
        }
        .airbnb-btn:disabled {
          background-color: var(--border);
          color: var(--muted);
          cursor: not-allowed;
        }
        .airbnb-btn-ghost {
          background-color: transparent;
          color: var(--muted);
          text-decoration: none;
          font-size: 14px;
          font-weight: 500;
          height: auto;
          padding: 8px;
          transition: color 0.2s;
        }
        .airbnb-btn-ghost:hover:not(:disabled) {
          background-color: transparent;
          color: var(--accent);
        }
        .eye-btn {
          position: absolute;
          right: 12px;
          background: none;
          border: none;
          cursor: pointer;
          color: var(--muted);
          padding: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 6px;
          transition: color 0.2s, background-color 0.2s;
        }
        .eye-btn:hover {
          color: var(--text);
          background-color: var(--panel-2);
        }
      `}</style>
      
      {/* brand hero - photography led */}
      <div
        style={{
          flex: '1 1 46%',
          position: 'relative',
          overflow: 'hidden',
          backgroundColor: 'var(--panel-2)',
          color: '#ffffff',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '4rem 3.2rem',
          backgroundImage: 'url("https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?q=80&w=1200&auto=format&fit=crop")',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, rgba(11, 15, 23, 0.8) 0%, rgba(11, 15, 23, 0.35) 100%)' }} />
        <div
          style={{ position: 'relative', maxWidth: 480, animation: 'fp-fade-up 0.5s ease both' }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              marginBottom: '3.5rem',
            }}
          >
            <Logo size="1.6rem" color="#ffffff" />
            <span
              style={{
                background: 'rgba(255, 68, 4, 0.15)',
                color: '#ff4404',
                padding: '4px 10px',
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                border: '1px solid rgba(255, 68, 4, 0.25)',
              }}
            >
              AI
            </span>
          </div>
          <h1
            style={{
              fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif",
              fontSize: '34px',
              fontWeight: 700,
              lineHeight: 1.25,
              margin: '0 0 1.5rem',
              letterSpacing: '-0.02em',
              color: '#ffffff',
            }}
          >
            Your books, on autopilot.
            <br />
            <span style={{ color: 'rgba(255, 255, 255, 0.65)' }}>Your numbers, guaranteed real.</span>
          </h1>
          <p style={{ color: 'rgba(255, 255, 255, 0.75)', lineHeight: 1.6, fontSize: '16px', marginBottom: '3rem', fontWeight: 400 }}>
            Cloud accounting for Indian SMEs — three days of GST reconciliation a month becomes one
            click, and "how much cash will I have in two weeks" finally has an answer.
          </p>
          {SELLING_POINTS.map(([icon, text], i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                gap: 16,
                alignItems: 'flex-start',
                marginBottom: '20px',
                animation: `fp-fade-up 0.5s ease ${0.15 + i * 0.1}s both`,
              }}
            >
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                backgroundColor: 'rgba(255, 255, 255, 0.08)',
                color: '#ff4404',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                flexShrink: 0,
                marginTop: '2px',
              }}>
                {icon}
              </span>
              <span style={{ fontSize: '15px', color: 'rgba(255, 255, 255, 0.85)', lineHeight: 1.5 }}>{text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* form panel - clean canvas */}
      <div
        style={{
          flex: '1 1 54%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem',
          backgroundColor: 'var(--bg)',
          position: 'relative',
        }}
      >
        <div style={{ position: 'absolute', top: 24, left: 24 }}>
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--muted)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '14px',
                fontWeight: 500,
                padding: '6px 10px',
                borderRadius: '6px',
                transition: 'color 0.15s ease',
              }}
              className="airbnb-btn-ghost"
            >
              ← Back to home
            </button>
          )}
        </div>
        <div style={{ position: 'absolute', top: 24, right: 24 }}>
          <ThemeToggle />
        </div>
        <div className="auth-card">
          <div
            style={{ marginBottom: 32, cursor: onBack ? 'pointer' : 'default', display: 'inline-block' }}
            onClick={onBack}
            title={onBack ? 'Back to home' : undefined}
          >
            <Logo size="1.45rem" />
          </div>
          <h2 style={{ margin: '0 0 8px', fontSize: '26px', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em', fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif" }}>
            {mode === 'login' ? 'Welcome back' : 'Create your account'}
          </h2>
          <p style={{ color: 'var(--muted)', fontSize: '15px', marginTop: 0, marginBottom: 32, lineHeight: 1.5 }}>
            {mode === 'login'
              ? 'Sign in to your books.'
              : 'Free plan — one company, 50 invoices a month, AI included.'}
          </p>
          
          <form onSubmit={submit}>
            {mode === 'register' && (
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', marginBottom: 8, fontSize: '14px', fontWeight: 500, color: 'var(--text)' }}>
                  Your name
                </label>
                <input
                  className="airbnb-input"
                  name="name"
                  autoComplete="name"
                  spellCheck={false}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="John Doe"
                  required
                />
              </div>
            )}

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', marginBottom: 8, fontSize: '14px', fontWeight: 500, color: 'var(--text)' }}>
                Email
              </label>
              <input
                className={`airbnb-input ${touchedEmail && !isEmailValid ? 'error' : ''}`}
                name="email"
                type="email"
                autoComplete="username"
                spellCheck={false}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => setTouchedEmail(true)}
                placeholder="you@company.com"
                required
              />
              {touchedEmail && !isEmailValid && (
                <div style={{ color: 'var(--red)', fontSize: '13px', marginTop: 6, fontWeight: 500 }}>
                  Please enter a valid email address
                </div>
              )}
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', marginBottom: 8, fontSize: '14px', fontWeight: 500, color: 'var(--text)' }}>
                Password
              </label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <input
                  className="airbnb-input"
                  name="password"
                  style={{ paddingRight: '48px' }}
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
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
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="eye-btn"
                >
                  <EyeIcon show={showPassword} blinking={blinkingPass} />
                </button>
              </div>

              <PasswordSuggestions
                onSelect={(suggested) => {
                  setPassword(suggested);
                  setConfirmPassword(suggested);
                }}
              />

              {password.length > 0 && (
                <div style={{ marginTop: 8, fontSize: '14px' }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: 6,
                    }}
                  >
                    <span style={{ color: 'var(--muted)' }}>Password Strength:</span>
                    <span style={{ fontWeight: 600, color: pwdStrength.color }}>
                      {pwdStrength.label}
                    </span>
                  </div>
                  <div
                    style={{
                      height: 4,
                      width: '100%',
                      background: 'var(--panel-2)',
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
                        gap: '6px 12px',
                        marginTop: 10,
                        fontSize: '13px',
                      }}
                    >
                      <span style={{ color: pwdChecks.length ? 'var(--green)' : 'var(--muted)' }}>
                        {pwdChecks.length ? '✓' : '○'} Min 8 characters
                      </span>
                      <span
                        style={{
                          color: pwdChecks.upper && pwdChecks.lower ? 'var(--green)' : 'var(--muted)',
                        }}
                      >
                        {pwdChecks.upper && pwdChecks.lower ? '✓' : '○'} Uppercase & Lowercase
                      </span>
                      <span style={{ color: pwdChecks.number ? 'var(--green)' : 'var(--muted)' }}>
                        {pwdChecks.number ? '✓' : '○'} At least 1 number
                      </span>
                      <span style={{ color: pwdChecks.special ? 'var(--green)' : 'var(--muted)' }}>
                        {pwdChecks.special ? '✓' : '○'} Special character
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {mode === 'register' && (
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', marginBottom: 8, fontSize: '14px', fontWeight: 500, color: 'var(--text)' }}>
                  Confirm Password
                </label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <input
                    className={`airbnb-input ${confirmPassword.length > 0 && confirmPassword !== password ? 'error' : ''}`}
                    name="confirmPassword"
                    style={{ paddingRight: '48px' }}
                    type={showConfirmPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                  />
                  <button
                    type="button"
                    onClick={toggleConfirmVisibility}
                    title={showConfirmPassword ? 'Hide password' : 'Show password'}
                    aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                    className="eye-btn"
                  >
                    <EyeIcon show={showConfirmPassword} blinking={blinkingConfirm} />
                  </button>
                </div>
                {confirmPassword.length > 0 && confirmPassword !== password && (
                  <div style={{ color: 'var(--red)', fontSize: '13px', marginTop: 6, fontWeight: 500 }}>
                    Passwords do not match
                  </div>
                )}
              </div>
            )}

            <Err error={error} />
            
            <div style={{ display: 'grid', gap: 16, marginTop: '32px' }}>
              <button
                className="airbnb-btn"
                type="submit"
                disabled={
                  busy ||
                  (touchedEmail && !isEmailValid) ||
                  (mode === 'register' && confirmPassword.length > 0 && confirmPassword !== password)
                }
              >
                {busy ? 'One moment…' : mode === 'login' ? 'Sign in' : 'Create account'}
              </button>
              <button
                type="button"
                className="airbnb-btn airbnb-btn-ghost"
                onClick={() => {
                  setError(null);
                  setMode(mode === 'login' ? 'register' : 'login');
                }}
              >
                {mode === 'login' ? 'New here? Create an account' : 'Already registered? Sign in'}
              </button>
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

const NAV: Array<{ group: string; items: Array<{ key: string; label: string; icon: React.ReactNode }> }> = [
  { group: '', items: [{ key: 'dashboard', label: 'Dashboard', icon: <HugeiconsIcon icon={Analytics01Icon} size={28} /> }] },
  {
    group: 'Core ledger',
    items: [
      { key: 'accounts', label: 'Chart of accounts', icon: <HugeiconsIcon icon={HierarchyIcon} size={28} /> },
      { key: 'journal', label: 'Journal', icon: <HugeiconsIcon icon={Book01Icon} size={28} /> },
      { key: 'trial-balance', label: 'Trial balance', icon: <HugeiconsIcon icon={BalanceScaleIcon} size={28} /> },
      { key: 'parties', label: 'Parties & items', icon: <HugeiconsIcon icon={UserGroupIcon} size={28} /> },
    ],
  },
  { group: 'Sales', items: [{ key: 'invoices', label: 'Invoicing', icon: <HugeiconsIcon icon={Invoice01Icon} size={28} /> }] },
  {
    group: 'Purchases',
    items: [
      { key: 'bills', label: 'Bills & expenses', icon: <HugeiconsIcon icon={FileDownloadIcon} size={28} /> },
      { key: 'documents', label: 'Scan a bill (OCR)', icon: <HugeiconsIcon icon={Camera01Icon} size={28} /> },
    ],
  },
  {
    group: 'Money',
    items: [
      { key: 'payments', label: 'Payments', icon: <HugeiconsIcon icon={MoneySend01Icon} size={28} /> },
      { key: 'banking', label: 'Banking & reco', icon: <HugeiconsIcon icon={BankIcon} size={28} /> },
    ],
  },
  { group: 'Compliance', items: [{ key: 'gst', label: 'GST & IMS', icon: <HugeiconsIcon icon={ShieldCheck} size={28} /> }] },
  { group: 'Reports', items: [{ key: 'reports', label: 'All reports', icon: <HugeiconsIcon icon={BarChartIcon} size={28} /> }] },
  { group: 'AI', items: [{ key: 'copilot', label: 'Copilot', icon: <HugeiconsIcon icon={AiMagicIcon} size={28} /> }] },
  {
    group: 'Platform',
    items: [
      { key: 'notifications', label: 'Notifications', icon: <HugeiconsIcon icon={Notification01Icon} size={28} /> },
      { key: 'team', label: 'Team', icon: <HugeiconsIcon icon={UserGroupIcon} size={28} /> },
      { key: 'billing', label: 'Billing', icon: <HugeiconsIcon icon={CreditCardIcon} size={28} /> },
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
  icon: React.ReactNode;
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
        padding: collapsed ? '0.65rem 0' : '0.6rem 0.85rem',
        borderRadius: 12,
        cursor: 'pointer',
        fontSize: '0.94rem',
        fontWeight: active ? 700 : 500,
        color: active ? C.accent : C.text,
        display: 'flex',
        alignItems: 'center',
        justifyContent: collapsed ? 'center' : 'flex-start',
        gap: collapsed ? 0 : 12,
        marginBottom: 4,
        position: 'relative',
        transition: 'all 0.18s ease',
      }}
    >
      <span style={{ fontSize: collapsed ? '1.25rem' : '1.1rem', display: 'inline-flex', alignItems: 'center', color: active ? C.accent : C.muted }}>
        {icon}
      </span>
      {!collapsed && <span style={{ flex: 1, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{label}</span>}
      {badge !== undefined && badge > 0 && (
        <span
          style={
            collapsed
              ? {
                  position: 'absolute',
                  top: 4,
                  right: 8,
                  background: C.red,
                  borderRadius: 999,
                  width: 8,
                  height: 8,
                }
              : {
                  background: C.red,
                  color: '#fff',
                  borderRadius: 999,
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  padding: '0.1rem 0.5rem',
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
            width: collapsed ? 90 : 335,
            height: '100vh',
            display: 'flex',
            flexDirection: 'column',
            background: C.panel,
            borderRight: `1px solid ${C.border}`,
            position: 'relative',
          }}
        >
          {/* Header Logo section */}
          <div
            style={{
              padding: collapsed ? '1.25rem 0.5rem 1rem' : '1.25rem 1.1rem 1rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: collapsed ? 'center' : 'space-between',
              borderBottom: `1px solid ${C.border}`,
            }}
          >
            {collapsed ? (
              <span style={{ fontWeight: 800, fontSize: '1.3rem', color: C.accent }}>F</span>
            ) : (
              <Logo size="1.35rem" />
            )}
          </div>

          {/* Vertically Scrollable Nav Area */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: collapsed ? '1rem 0.5rem' : '1rem 0.85rem',
            }}
          >
            {NAV.map((section) => (
              <div key={section.group}>
                {section.group &&
                  (collapsed ? (
                    <div style={{ borderTop: `1px solid ${C.border}`, margin: '0.8rem 0.4rem' }} />
                  ) : (
                    <div
                      style={{
                        color: C.muted,
                        fontSize: '0.72rem',
                        textTransform: 'uppercase',
                        letterSpacing: '0.08em',
                        fontWeight: 700,
                        margin: '1.2rem 0 0.4rem',
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
                  <div style={{ borderTop: `1px solid ${C.border}`, margin: '0.8rem 0.4rem' }} />
                ) : (
                  <div
                    style={{
                      color: C.muted,
                      fontSize: '0.72rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                      fontWeight: 700,
                      margin: '1.2rem 0 0.4rem',
                      paddingLeft: 10,
                    }}
                  >
                    Operator
                  </div>
                )}
                <NavItem
                  active={route === 'admin'}
                  icon={<HugeiconsIcon icon={Wrench01Icon} size={28} />}
                  label="Admin console"
                  collapsed={collapsed}
                  onClick={() => go('admin')}
                />
              </div>
            )}
          </div>
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
            padding: '1rem 2.5rem',
            borderBottom: `1px solid ${C.border}`,
            background: C.panel,
            position: 'sticky',
            top: 0,
            zIndex: 5,
          }}
        >
          <div>
            <div style={{ fontWeight: 800, fontSize: '1.15rem', letterSpacing: '-0.01em' }}>
              {TITLES[route] ?? 'Dashboard'}
            </div>
            <div style={{ color: C.muted, fontSize: '0.8rem' }}>{company.legalName}</div>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <span style={{ color: C.muted, fontSize: '0.85rem' }}>
              {user.name} · {company.role.name}
            </span>
            <ThemeToggle />
            <Btn small kind="ghost" onClick={onSwitch}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <HugeiconsIcon icon={ArrowReloadHorizontalIcon} size={19} />
                Switch company
              </span>
            </Btn>
            <Btn small kind="primary" onClick={onLogout}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <HugeiconsIcon icon={Logout01Icon} size={19} />
                Sign out
              </span>
            </Btn>
          </div>
        </header>
        <main
          key={route}
          style={{ padding: '1.75rem 2.5rem', width: '100%', maxWidth: '100%', minWidth: 0, animation: 'fp-fade-in 0.25s ease' }}
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
  const [authView, setAuthView] = useState<'landing' | 'auth'>(() => {
    const hash = window.location.hash;
    return hash.startsWith('#login') || hash.startsWith('#register') ? 'auth' : 'landing';
  });

  useEffect(() => {
    function handleHashChange() {
      const hash = window.location.hash;
      if (hash.startsWith('#login') || hash.startsWith('#register')) {
        setAuthView('auth');
      } else if (
        !hash ||
        hash === '#' ||
        hash === '#/' ||
        hash.startsWith('#features') ||
        hash.startsWith('#preview') ||
        hash.startsWith('#how-it-works') ||
        hash.startsWith('#architecture')
      ) {
        setAuthView('landing');
      }
    }
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

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
    setAuthView('landing');
    window.location.hash = '';
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
      {!user && authView === 'landing' && (
        <LandingPage
          onGoToAuth={() => {
            setAuthView('auth');
            window.location.hash = '#login';
          }}
        />
      )}
      {!user && authView === 'auth' && (
        <AuthPage
          onLoggedIn={setUser}
          onBack={() => {
            setAuthView('landing');
            window.location.hash = '';
          }}
        />
      )}
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
