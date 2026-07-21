/** Payments in/out with allocation to invoices/bills (§32 Phase 9). */
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

interface PaymentRow {
  id: string;
  direction: 'inflow' | 'outflow';
  partySnapshot?: { name: string };
  date: string;
  amountPaise: number;
  unallocatedPaise?: number;
  method: string;
  reference?: string;
  status?: string;
}
interface Party {
  id: string;
  name: string;
}
interface Account {
  id: string;
  code: string;
  name: string;
}
interface InvoiceRow {
  id: string;
  invoiceNumber: string | null;
  status: string;
  amountDuePaise: number;
  partyId: string;
}

export function PaymentsPage() {
  const payments = useLoad(() => api<{ payments: PaymentRow[] }>('GET', '/api/v1/payments'));
  const parties = useLoad(() => api<{ parties: Party[] }>('GET', '/api/v1/parties'));
  const accounts = useLoad(() => api<{ accounts: Account[] }>('GET', '/api/v1/accounts'));
  const invoices = useLoad(() => api<{ invoices: InvoiceRow[] }>('GET', '/api/v1/invoices'));

  const [direction, setDirection] = useState<'inflow' | 'outflow'>('inflow');
  const [partyId, setPartyId] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('bank_transfer');
  const [depositAccountId, setDepositAccountId] = useState('');
  const [invoiceId, setInvoiceId] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const bankish = (accounts.data?.accounts ?? []).filter((a) => ['1110', '1120'].includes(a.code));
  const openInvoices = (invoices.data?.invoices ?? []).filter(
    (inv) =>
      ['issued', 'partially_paid', 'overdue'].includes(inv.status) &&
      (!partyId || inv.partyId === partyId),
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const amountPaise = rupeesToPaise(amount);
      const chosen = openInvoices.find((inv) => inv.id === invoiceId);
      await api('POST', '/api/v1/payments', {
        direction,
        partyId,
        date: today(),
        amountPaise,
        method,
        depositAccountId,
        allocations:
          direction === 'inflow' && chosen
            ? [
                {
                  documentModel: 'Invoice',
                  documentId: chosen.id,
                  amountPaise: Math.min(amountPaise, chosen.amountDuePaise),
                },
              ]
            : [],
      });
      setAmount('');
      setInvoiceId('');
      payments.reload();
      invoices.reload();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <Card title="Record a payment">
        <form onSubmit={submit}>
          <Row>
            <Field label="Direction">
              <select
                style={S.input}
                value={direction}
                onChange={(e) => setDirection(e.target.value as 'inflow' | 'outflow')}
              >
                <option value="inflow">inflow (customer pays)</option>
                <option value="outflow">outflow (we pay)</option>
              </select>
            </Field>
            <Field label="Party">
              <select
                style={S.input}
                value={partyId}
                onChange={(e) => setPartyId(e.target.value)}
                required
              >
                <option value="">— pick —</option>
                {(parties.data?.parties ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Amount (₹)">
              <input
                style={{ ...S.input, width: 110 }}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </Field>
            <Field label="Method">
              <select style={S.input} value={method} onChange={(e) => setMethod(e.target.value)}>
                {['bank_transfer', 'cash', 'upi', 'neft', 'rtgs', 'imps', 'cheque', 'card'].map(
                  (m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ),
                )}
              </select>
            </Field>
            <Field label="Deposit / pay account">
              <select
                style={S.input}
                value={depositAccountId}
                onChange={(e) => setDepositAccountId(e.target.value)}
                required
              >
                <option value="">— pick —</option>
                {bankish.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} · {a.name}
                  </option>
                ))}
              </select>
            </Field>
            {direction === 'inflow' && (
              <Field label="Allocate to invoice (optional — rest becomes an advance)">
                <select
                  style={S.input}
                  value={invoiceId}
                  onChange={(e) => setInvoiceId(e.target.value)}
                >
                  <option value="">— none (advance) —</option>
                  {openInvoices.map((inv) => (
                    <option key={inv.id} value={inv.id}>
                      {inv.invoiceNumber ?? inv.id}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <Btn disabled={busy}>Record</Btn>
          </Row>
          <Err error={error} />
          <p style={{ color: C.muted, fontSize: '0.75rem' }}>
            Allocations never exceed the payment; an unallocated inflow is an advance (GST on
            advances applies, §12.2).
          </p>
        </form>
      </Card>
      <Card title="Payments">
        <Err error={payments.error} />
        <Tbl
          head={['Date', 'Direction', 'Party', 'Method', 'Reference', 'Amount']}
          rows={(payments.data?.payments ?? []).map((p) => [
            dateStr(p.date),
            <Badge key="d" value={p.direction} />,
            p.partySnapshot?.name ?? '—',
            p.method,
            p.reference ?? '—',
            <Money key="a" paise={p.amountPaise} />,
          ])}
        />
      </Card>
    </div>
  );
}
