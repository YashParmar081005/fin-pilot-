/**
 * Vendor bills + expenses with approval (§32 Phase 8). Approving a bill posts
 * ITC through the ledger; no self-approval — the server enforces both.
 */
import { useState } from 'react';
import { api } from '../../lib/api';
import {
  Badge,
  Btn,
  C,
  Card,
  Err,
  Field,
  Money,
  Row,
  S,
  Tbl,
  dateStr,
  rupeesToPaise,
  today,
  useLoad,
} from '../../lib/ui';

interface BillRow {
  id: string;
  vendorBillNumber: string;
  partySnapshot?: { name: string };
  billDate: string;
  status: string;
  grandTotalPaise: number;
  itcEligiblePaise?: number;
}
interface ExpenseRow {
  id: string;
  date: string;
  description: string;
  amountPaise: number;
  status: string;
}
interface Party {
  id: string;
  name: string;
  type: string[];
}
interface Account {
  id: string;
  code: string;
  name: string;
  type: string;
}

function NewBill({ vendors, onDone }: { vendors: Party[]; onDone: () => void }) {
  const [partyId, setPartyId] = useState('');
  const [number, setNumber] = useState('');
  const [date, setDate] = useState(today());
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [gstRate, setGstRate] = useState('18');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('POST', '/api/v1/bills', {
        partyId,
        vendorBillNumber: number,
        billDate: date,
        lines: [
          { description, qty: 1, ratePaise: rupeesToPaise(amount), gstRate: Number(gstRate) },
        ],
      });
      setNumber('');
      setDescription('');
      setAmount('');
      onDone();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <Row>
        <Field label="Vendor">
          <select
            style={S.input}
            value={partyId}
            onChange={(e) => setPartyId(e.target.value)}
            required
          >
            <option value="">— pick —</option>
            {vendors.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Vendor bill no.">
          <input
            style={{ ...S.input, width: 130 }}
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            required
          />
        </Field>
        <Field label="Bill date">
          <input
            style={S.input}
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
        <Field label="Description">
          <input
            style={{ ...S.input, width: 200 }}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
          />
        </Field>
        <Field label="Taxable (₹)">
          <input
            style={{ ...S.input, width: 110 }}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </Field>
        <Field label="GST %">
          <select
            style={{ ...S.input, width: 80 }}
            value={gstRate}
            onChange={(e) => setGstRate(e.target.value)}
          >
            {['0', '5', '18', '40'].map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </Field>
        <Btn disabled={busy}>Record bill</Btn>
      </Row>
      <Err error={error} />
    </form>
  );
}

function NewExpense({ accounts, onDone }: { accounts: Account[]; onDone: () => void }) {
  const [accountId, setAccountId] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const expenseAccounts = accounts.filter((a) => a.type === 'expense');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('POST', '/api/v1/expenses', {
        date: today(),
        amountPaise: rupeesToPaise(amount),
        expenseAccountId: accountId,
        description,
      });
      setDescription('');
      setAmount('');
      onDone();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <Row>
        <Field label="Expense account">
          <select
            style={S.input}
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            required
          >
            <option value="">— pick —</option>
            {expenseAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.code} · {a.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Description">
          <input
            style={{ ...S.input, width: 220 }}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
          />
        </Field>
        <Field label="Amount (₹)">
          <input
            style={{ ...S.input, width: 110 }}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </Field>
        <Btn disabled={busy}>Submit expense</Btn>
      </Row>
      <Err error={error} />
    </form>
  );
}

export function BillsPage() {
  const bills = useLoad(() => api<{ bills: BillRow[] }>('GET', '/api/v1/bills'));
  const expenses = useLoad(() => api<{ expenses: ExpenseRow[] }>('GET', '/api/v1/expenses'));
  const parties = useLoad(() => api<{ parties: Party[] }>('GET', '/api/v1/parties'));
  const accounts = useLoad(() => api<{ accounts: Account[] }>('GET', '/api/v1/accounts'));
  const [error, setError] = useState<unknown>(null);

  async function act(kind: 'bills' | 'expenses', id: string, action: string, body: unknown = {}) {
    setError(null);
    try {
      await api('POST', `/api/v1/${kind}/${id}/${action}`, body);
      (kind === 'bills' ? bills : expenses).reload();
    } catch (err) {
      setError(err);
    }
  }

  const vendors = (parties.data?.parties ?? []).filter((p) => p.type.includes('vendor'));

  return (
    <div>
      <Err error={error} />
      <Card title="Record a vendor bill">
        {vendors.length === 0 && (
          <p style={{ color: C.muted, fontSize: '0.85rem' }}>Add a vendor under Parties first.</p>
        )}
        <NewBill vendors={vendors} onDone={bills.reload} />
      </Card>
      <Card title="Vendor bills (approval posts ITC through the ledger)">
        <Err error={bills.error} />
        <Tbl
          head={['Bill no.', 'Vendor', 'Date', 'Status', 'Total', 'Actions']}
          rows={(bills.data?.bills ?? []).map((b) => [
            b.vendorBillNumber,
            b.partySnapshot?.name ?? '—',
            dateStr(b.billDate),
            <Badge key="s" value={b.status} />,
            <Money key="t" paise={b.grandTotalPaise} />,
            <span key="a" style={{ display: 'flex', gap: 6 }}>
              {b.status === 'pending_approval' && (
                <Btn small kind="success" onClick={() => void act('bills', b.id, 'approve')}>
                  Approve
                </Btn>
              )}
              {(b.status === 'pending_approval' || b.status === 'approved') && (
                <Btn
                  small
                  kind="danger"
                  onClick={() => void act('bills', b.id, 'cancel', { reason: 'cancelled from UI' })}
                >
                  Cancel
                </Btn>
              )}
            </span>,
          ])}
        />
      </Card>
      <Card title="Expenses (multi-step approval; no self-approval)">
        <NewExpense accounts={accounts.data?.accounts ?? []} onDone={expenses.reload} />
        <Err error={expenses.error} />
        <Tbl
          head={['Date', 'Description', 'Amount', 'Status', 'Actions']}
          rows={(expenses.data?.expenses ?? []).map((x) => [
            dateStr(x.date),
            x.description,
            <Money key="m" paise={x.amountPaise} />,
            <Badge key="s" value={x.status} />,
            <span key="a" style={{ display: 'flex', gap: 6 }}>
              {x.status === 'pending_approval' && (
                <>
                  <Btn small kind="success" onClick={() => void act('expenses', x.id, 'approve')}>
                    Approve
                  </Btn>
                  <Btn
                    small
                    kind="danger"
                    onClick={() =>
                      void act('expenses', x.id, 'reject', { reason: 'rejected from UI' })
                    }
                  >
                    Reject
                  </Btn>
                </>
              )}
            </span>,
          ])}
        />
      </Card>
    </div>
  );
}
