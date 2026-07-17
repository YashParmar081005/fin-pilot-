import { useEffect, useState } from 'react';
import { api, RequestError, setAccessToken, setCompanyId } from './lib/api';
import { AccountsTree, type AccountRow } from './features/accounts/AccountsTree';
import { JournalPage } from './features/journal/JournalPage';

// Phase 4 shell: login → pick a company → chart-of-accounts tree.
// The full feature-sliced UI stack (router, TanStack Query, Tailwind, RHF)
// arrives with the document phases.

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

const S: Record<string, React.CSSProperties> = {
  page: {
    fontFamily: 'system-ui, sans-serif',
    minHeight: '100vh',
    background: '#0F172A',
    color: '#E2E8F0',
    padding: '2rem',
  },
  card: {
    background: '#1E293B',
    borderRadius: 12,
    padding: '1.5rem 2rem',
    maxWidth: 720,
    margin: '0 auto',
    boxShadow: '0 8px 30px rgba(0,0,0,0.35)',
  },
  input: {
    display: 'block',
    width: '100%',
    margin: '0.4rem 0 1rem',
    padding: '0.55rem 0.75rem',
    borderRadius: 8,
    border: '1px solid #334155',
    background: '#0F172A',
    color: '#E2E8F0',
    fontSize: '0.95rem',
  },
  button: {
    padding: '0.55rem 1.2rem',
    borderRadius: 8,
    border: 'none',
    background: '#0EA5E9',
    color: '#082F49',
    fontWeight: 600,
    cursor: 'pointer',
    fontSize: '0.95rem',
  },
  error: { color: '#FCA5A5', margin: '0.5rem 0' },
  muted: { color: '#94A3B8' },
};

function LoginForm({ onLoggedIn }: { onLoggedIn: (user: PublicUser) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const data = await api<{ accessToken: string; user: PublicUser }>(
        'POST',
        '/api/v1/auth/login',
        { email, password },
      );
      setAccessToken(data.accessToken);
      onLoggedIn(data.user);
    } catch (err) {
      setError(err instanceof RequestError ? err.error.message : 'Login failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <h1 style={{ marginTop: 0 }}>FinPilot AI</h1>
      <p style={S.muted}>Sign in to your books.</p>
      <label>
        Email
        <input
          style={S.input}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </label>
      <label>
        Password
        <input
          style={S.input}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </label>
      {error && <p style={S.error}>{error}</p>}
      <button style={S.button} disabled={busy} type="submit">
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}

function AccountsPage({ company, onBack }: { company: CompanyRow; onBack: () => void }) {
  const [accounts, setAccounts] = useState<AccountRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<'accounts' | 'journal'>('accounts');

  async function load() {
    try {
      const data = await api<{ accounts: AccountRow[] }>('GET', '/api/v1/accounts');
      setAccounts(data.accounts);
    } catch (err) {
      setError(err instanceof RequestError ? err.error.message : 'Failed to load accounts');
    }
  }

  useEffect(() => {
    void load();
  }, [company.id]);

  async function seed() {
    setBusy(true);
    setError(null);
    try {
      await api('POST', '/api/v1/accounts/import-template');
      await load();
    } catch (err) {
      setError(err instanceof RequestError ? err.error.message : 'Seed failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button onClick={onBack} style={{ ...S.button, background: '#334155', color: '#E2E8F0' }}>
        ← companies
      </button>
      <h2 style={{ marginBottom: 4 }}>{company.legalName}</h2>
      <p style={S.muted}>
        {accounts?.length ?? '…'} accounts · your role: {company.role.name}
      </p>
      <div style={{ display: 'flex', gap: 8, margin: '0.5rem 0 1rem' }}>
        {(['accounts', 'journal'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              ...S.button,
              background: tab === t ? '#0EA5E9' : '#334155',
              color: tab === t ? '#082F49' : '#E2E8F0',
            }}
          >
            {t === 'accounts' ? 'Chart of accounts' : 'Journal'}
          </button>
        ))}
      </div>
      {error && <p style={S.error}>{error}</p>}
      {tab === 'accounts' && accounts && accounts.length === 0 && (
        <button style={S.button} onClick={seed} disabled={busy}>
          {busy ? 'Seeding…' : 'Seed the Indian SME chart (60 accounts)'}
        </button>
      )}
      {tab === 'accounts' && accounts && accounts.length > 0 && (
        <AccountsTree accounts={accounts} />
      )}
      {tab === 'journal' && accounts && <JournalPage accounts={accounts} />}
    </div>
  );
}

export function App() {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [companies, setCompanies] = useState<CompanyRow[] | null>(null);
  const [company, setCompany] = useState<CompanyRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    api<{ companies: CompanyRow[] }>('GET', '/api/v1/companies')
      .then((d) => setCompanies(d.companies))
      .catch((err) =>
        setError(err instanceof RequestError ? err.error.message : 'Failed to load companies'),
      );
  }, [user]);

  function pick(c: CompanyRow) {
    setCompanyId(c.id);
    setCompany(c);
  }

  return (
    <div style={S.page}>
      <main style={S.card}>
        {!user && <LoginForm onLoggedIn={setUser} />}
        {user && !company && (
          <div>
            <h1 style={{ marginTop: 0 }}>Choose a company</h1>
            <p style={S.muted}>Signed in as {user.email}</p>
            {error && <p style={S.error}>{error}</p>}
            {companies?.length === 0 && (
              <p style={S.muted}>No companies yet — create one via the API for now.</p>
            )}
            {companies?.map((c) => (
              <button
                key={c.id}
                onClick={() => pick(c)}
                style={{
                  ...S.button,
                  display: 'block',
                  width: '100%',
                  margin: '0.5rem 0',
                  textAlign: 'left',
                }}
              >
                {c.legalName} <span style={{ fontWeight: 400 }}>— {c.role.name}</span>
              </button>
            ))}
          </div>
        )}
        {user && company && <AccountsPage company={company} onBack={() => setCompany(null)} />}
      </main>
    </div>
  );
}
