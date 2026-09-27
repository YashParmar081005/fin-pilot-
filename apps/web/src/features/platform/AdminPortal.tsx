/**
 * The platform operator portal — a separate front door from the customer app.
 *
 * It has its own sign-in, no company switcher and no company context, because
 * an operator is not a customer: operator accounts hold no membership, so
 * there is no company for them to be "in". Reached at #admin, and the tenant
 * shell no longer carries an admin item — that separation is the point.
 *
 * The guard is server-side either way (requireSuperAdmin on every /admin
 * route). What this adds is that an operator never signs in through the
 * customer door, and a customer never sees an operator one.
 */
import { useEffect, useState } from 'react';
import { api, setAccessToken } from '../../lib/api';
import { Badge, Btn, C, Card, Err, Field, Row, S, Tbl, dateStr, useLoad } from '../../lib/ui';
import { AdminPage } from './AdminPage';

interface Me {
  id: string;
  email: string;
  name: string;
  operator: boolean;
}
interface OperatorRow {
  id: string;
  email: string;
  name: string;
  disabled: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  companyMemberships: number;
}

/* ── operators tab ───────────────────────────────────────────────────────── */
function Operators({ me }: { me: Me }) {
  const list = useLoad(() => api<{ operators: OperatorRow[] }>('GET', '/api/v1/admin/operators'));
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState('');

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice('');
    try {
      const r = await api<{ email: string; created: boolean }>('POST', '/api/v1/admin/operators', {
        email,
        name,
        password,
        reason,
      });
      setNotice(
        r.created
          ? `Created operator account ${r.email}.`
          : `${r.email} already had an account — promoted it to operator.`,
      );
      setEmail('');
      setName('');
      setPassword('');
      setReason('');
      list.reload();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function revoke(row: OperatorRow) {
    const why = window.prompt(
      `Revoke operator access for ${row.email}. Reason (min 10 chars, audited):`,
      '',
    );
    if (!why || why.trim().length < 10) return;
    setError(null);
    try {
      await api('POST', `/api/v1/admin/operators/${row.id}/revoke`, { reason: why });
      list.reload();
    } catch (err) {
      setError(err);
    }
  }

  const rows = list.data?.operators ?? [];
  const mixed = rows.filter((o) => o.companyMemberships > 0);

  return (
    <>
      <Card title={`Platform operators · ${rows.length}`}>
        <Err error={list.error} />
        <Tbl
          head={['Email', 'Name', 'Status', 'Last login', 'Created', 'Action']}
          empty="No operators."
          rows={rows.map((o) => [
            o.email,
            o.name,
            o.disabled ? <Badge key="s" value="rejected" /> : <Badge key="s" value="active" />,
            o.lastLoginAt ? dateStr(o.lastLoginAt) : '—',
            dateStr(o.createdAt),
            o.id === me.id ? (
              <span key="a" style={{ color: C.muted, fontSize: '0.78rem' }}>
                that&apos;s you
              </span>
            ) : (
              <Btn key="a" small kind="danger" onClick={() => void revoke(o)}>
                Revoke
              </Btn>
            ),
          ])}
        />
        {mixed.length > 0 && (
          <p style={{ color: C.amber, fontSize: '0.8rem' }}>
            {mixed.map((o) => o.email).join(', ')}{' '}
            {mixed.length === 1 ? 'is also a member of' : 'are also members of'} a company. Operator
            accounts are meant to hold no membership — these predate that rule. New operators cannot
            be created this way.
          </p>
        )}
        <p style={{ color: C.muted, fontSize: '0.75rem', marginBottom: 0 }}>
          The last active operator cannot be revoked, and nobody can revoke themselves — otherwise
          the platform could be locked out of its own console.
        </p>
      </Card>

      <Card title="Add an operator">
        <p style={{ color: C.muted, fontSize: '0.82rem', marginTop: 0 }}>
          Creates a new operator account, or promotes an existing account that belongs to no
          company. A customer account cannot be promoted — operators are not customers.
        </p>
        <form onSubmit={create}>
          <Row>
            <Field label="Email">
              <input
                style={{ ...S.input, width: 240 }}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </Field>
            <Field label="Name">
              <input
                style={{ ...S.input, width: 180 }}
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </Field>
            <Field label="Password (12+ chars)">
              <input
                style={{ ...S.input, width: 220 }}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={12}
                required
              />
            </Field>
          </Row>
          <Row>
            <Field label="Reason (min 10 chars — audited verbatim)">
              <input
                style={{ ...S.input, width: 380 }}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
              />
            </Field>
            <Btn disabled={busy}>{busy ? 'Creating…' : 'Create operator'}</Btn>
          </Row>
        </form>
        {notice && <p style={{ color: C.green, fontSize: '0.85rem' }}>{notice}</p>}
        <Err error={error} />
      </Card>
    </>
  );
}

/* ── the portal's own sign-in ────────────────────────────────────────────── */
function OperatorLogin({ onSignedIn }: { onSignedIn: (me: Me) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [refused, setRefused] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setRefused(false);
    try {
      const auth = await api<{ accessToken: string }>('POST', '/api/v1/auth/login', {
        email,
        password,
      });
      setAccessToken(auth.accessToken);
      const me = await api<Me>('GET', '/api/v1/admin/me', undefined, { silent: [403] });
      if (!me.operator) {
        // A real customer signing in here gets told plainly, not shown a
        // half-empty console.
        setAccessToken(null);
        setRefused(true);
        return;
      }
      onSignedIn(me);
    } catch (err) {
      // A 403 from /admin/me means the credentials were fine but the account is
      // not an operator. The client throws a RequestError carrying the status
      // and the API's own code — not a bare `code` property.
      const failure = err as { status?: number; error?: { code?: string } };
      if (failure?.status === 403 || failure?.error?.code === 'AUTH_FORBIDDEN') {
        setAccessToken(null);
        setRefused(true);
      } else {
        setError(err);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: C.bg,
        padding: 20,
      }}
    >
      <div style={{ width: '100%', maxWidth: 420 }}>
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: C.text }}>
            FinPilot <span style={{ color: C.accent }}>operations</span>
          </div>
          <div style={{ color: C.muted, fontSize: '0.85rem', marginTop: 4 }}>
            Platform operators only. This is not the customer sign-in.
          </div>
        </div>
        <Card title="Operator sign-in">
          <form onSubmit={submit}>
            <Field label="Email">
              <input
                style={{ ...S.input, width: '100%' }}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </Field>
            <Field label="Password">
              <input
                style={{ ...S.input, width: '100%' }}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </Field>
            <Row>
              <Btn disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</Btn>
              <a href="#login" style={{ color: C.muted, fontSize: '0.82rem' }}>
                Customer sign-in
              </a>
            </Row>
          </form>
          {refused && (
            <p style={{ color: C.red, fontSize: '0.85rem' }}>
              That account is not a platform operator. Customers sign in through the main app.
            </p>
          )}
          <Err error={error} />
        </Card>
        <p style={{ color: C.muted, fontSize: '0.72rem', textAlign: 'center' }}>
          The first operator is created with the admin:grant script. After that, operators add each
          other here.
        </p>
      </div>
    </div>
  );
}

/* ── the portal ──────────────────────────────────────────────────────────── */
export function AdminPortal() {
  const [me, setMe] = useState<Me | null>(null);
  const [checking, setChecking] = useState(true);
  const [tab, setTab] = useState<'console' | 'operators'>('console');

  // An operator arriving with a live session should not be asked to sign in
  // again just because they opened the portal in a new tab.
  useEffect(() => {
    let active = true;
    api<{ accessToken: string }>('POST', '/api/v1/auth/refresh', undefined, { silent: [401] })
      .then(async (auth) => {
        if (!active) return;
        setAccessToken(auth.accessToken);
        const who = await api<Me>('GET', '/api/v1/admin/me', undefined, { silent: [401, 403] });
        if (active && who.operator) setMe(who);
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function signOut() {
    await api('POST', '/api/v1/auth/logout', {}, { silent: true }).catch(() => undefined);
    setAccessToken(null);
    setMe(null);
  }

  if (checking) {
    return (
      <div style={{ padding: 40, color: C.muted, background: C.bg, minHeight: '100vh' }}>
        Checking operator session…
      </div>
    );
  }
  if (!me) return <OperatorLogin onSignedIn={setMe} />;

  return (
    <div style={{ background: C.bg, minHeight: '100vh' }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          padding: '0.9rem 1.4rem',
          borderBottom: `1px solid ${C.border}`,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div style={{ fontWeight: 700, color: C.text }}>
            FinPilot <span style={{ color: C.accent }}>operations</span>
          </div>
          <div style={{ color: C.muted, fontSize: '0.78rem' }}>
            Platform-wide. No company context.
          </div>
        </div>
        <Row>
          <Btn
            small
            kind={tab === 'console' ? 'primary' : 'ghost'}
            onClick={() => setTab('console')}
          >
            Console
          </Btn>
          <Btn
            small
            kind={tab === 'operators' ? 'primary' : 'ghost'}
            onClick={() => setTab('operators')}
          >
            Operators
          </Btn>
          <span style={{ color: C.muted, fontSize: '0.8rem' }}>{me.email}</span>
          <Btn small kind="ghost" onClick={() => void signOut()}>
            Sign out
          </Btn>
        </Row>
      </header>

      <main style={{ padding: '1.2rem 1.4rem', maxWidth: 1400, margin: '0 auto' }}>
        {tab === 'console' ? (
          <AdminPage
            onImpersonated={() => {
              // Impersonation hands back a token for someone else entirely, so
              // the right place to land is the customer app, not here.
              window.location.hash = 'dashboard';
              window.location.reload();
            }}
          />
        ) : (
          <Operators me={me} />
        )}
      </main>
    </div>
  );
}
