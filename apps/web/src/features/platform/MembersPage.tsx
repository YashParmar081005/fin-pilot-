/** Team members + invites (§32 Phase 3). Roles are bags of permissions. */
import { useState } from 'react';
import { api, getCompanyId } from '../../lib/api';
import { Badge, Btn, Card, Err, Field, Row, S, Tbl, useLoad } from '../../lib/ui';

interface Member {
  userId: string;
  name: string | null;
  email: string | null;
  roleKey: string | null;
  roleName: string | null;
  status: string;
}

const INVITABLE_ROLES = ['company_admin', 'accountant', 'employee', 'auditor'];

export function MembersPage() {
  const companyId = getCompanyId();
  const members = useLoad(() =>
    api<{ members: Member[] }>('GET', `/api/v1/companies/${companyId}/members`),
  );
  const [email, setEmail] = useState('');
  const [roleKey, setRoleKey] = useState('accountant');
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState('');

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice('');
    try {
      await api('POST', `/api/v1/companies/${companyId}/members`, { email, roleKey });
      setNotice(
        `Invite sent to ${email} (expires in 7 days — they must register with that email first).`,
      );
      setEmail('');
      members.reload();
    } catch (err) {
      setError(err);
    }
  }

  return (
    <Card title="Team">
      <form onSubmit={invite}>
        <Row>
          <Field label="Invite by email">
            <input
              style={S.input}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </Field>
          <Field label="Role">
            <select style={S.input} value={roleKey} onChange={(e) => setRoleKey(e.target.value)}>
              {INVITABLE_ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </Field>
          <Btn>Invite</Btn>
        </Row>
      </form>
      <Err error={error} />
      {notice && <p style={{ color: '#34D399', fontSize: '0.85rem' }}>{notice}</p>}
      <Err error={members.error} />
      <Tbl
        head={['Name', 'Email', 'Role', 'Status']}
        rows={(members.data?.members ?? []).map((m) => [
          m.name ?? '—',
          m.email ?? '—',
          m.roleName ?? m.roleKey ?? '—',
          <Badge key="s" value={m.status} />,
        ])}
      />
      <p style={{ fontSize: '0.75rem', color: '#94A3B8', marginBottom: 0 }}>
        Auditor is read-only by permission, not by promise. Seats are a plan limit — exceeding it
        returns 402 with an upgrade path (see Billing).
      </p>
    </Card>
  );
}
