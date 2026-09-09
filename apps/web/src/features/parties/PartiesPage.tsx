/** Customers & vendors with outstandings, plus the item master (§32 Phase 6). */
import { useState } from 'react';
import { api } from '../../lib/api';
import { Badge, Btn, C, Card, Err, Field, Money, Row, S, Tbl, useLoad } from '../../lib/ui';

interface Party {
  id: string;
  type: string[];
  name: string;
  gstin?: string;
  placeOfSupplyStateCode: string;
  creditDays: number;
  outstandingReceivablePaise: number;
  outstandingPayablePaise: number;
}
interface Item {
  id: string;
  name: string;
  kind: 'goods' | 'service';
  hsn?: string;
  sac?: string;
  gstRate: number;
  sellingPricePaise?: number;
  unit?: string;
}

function PartyForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('');
  const [type, setType] = useState<'customer' | 'vendor'>('customer');
  const [state, setState] = useState('24');
  const [gstin, setGstin] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('POST', '/api/v1/parties', {
        type: [type],
        name,
        placeOfSupplyStateCode: state,
        ...(gstin ? { gstin } : {}),
      });
      setName('');
      setGstin('');
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
        <Field label="Name">
          <input style={S.input} value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <Field label="Type">
          <select
            style={S.input}
            value={type}
            onChange={(e) => setType(e.target.value as 'customer' | 'vendor')}
          >
            <option value="customer">customer</option>
            <option value="vendor">vendor</option>
          </select>
        </Field>
        <Field label="State code">
          <input
            style={{ ...S.input, width: 90 }}
            value={state}
            onChange={(e) => setState(e.target.value)}
            required
          />
        </Field>
        <Field label="GSTIN (optional — checksum-validated)">
          <input
            style={S.input}
            value={gstin}
            onChange={(e) => setGstin(e.target.value.toUpperCase())}
          />
        </Field>
        <Btn disabled={busy}>Add</Btn>
      </Row>
      <Err error={error} />
    </form>
  );
}

function ItemForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'service' | 'goods'>('service');
  const [code, setCode] = useState('');
  const [gstRate, setGstRate] = useState('18');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('POST', '/api/v1/items', {
        name: name.trim(),
        kind,
        gstRate: Number(gstRate),
        ...(kind === 'service' ? { sac: code.trim() } : { hsn: code.trim() }),
      });
      setName('');
      setCode('');
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
        <Field label="Item / service name">
          <input
            style={S.input}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Cloud Consulting"
            required
          />
        </Field>
        <Field label="Type">
          <select
            style={S.input}
            value={kind}
            onChange={(e) => setKind(e.target.value as 'service' | 'goods')}
          >
            <option value="service">Service (SAC)</option>
            <option value="goods">Goods (HSN)</option>
          </select>
        </Field>
        <Field label={kind === 'service' ? 'SAC (6 digits)' : 'HSN (4, 6 or 8 digits)'}>
          <input
            style={{ ...S.input, width: 140 }}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder={kind === 'service' ? '998311' : '8471'}
            required
          />
        </Field>
        <Field label="GST %">
          <select style={S.input} value={gstRate} onChange={(e) => setGstRate(e.target.value)}>
            {['0', '5', '18', '40'].map((r) => (
              <option key={r} value={r}>
                {r}%
              </option>
            ))}
          </select>
        </Field>
        <Btn disabled={busy}>Add</Btn>
      </Row>
      <Err error={error} />
    </form>
  );
}

interface StatementInvoice {
  invoiceNumber: string | null;
  issueDate: string;
  dueDate: string;
  grandTotalPaise: number;
  amountPaidPaise: number;
  amountDuePaise: number;
  status: string;
}
interface StatementBill {
  vendorBillNumber: string;
  billDate: string;
  grandTotalPaise: number;
  amountPaidPaise: number;
  status: string;
}
interface StatementPayment {
  paymentNumber: string;
  date: string;
  direction: 'inflow' | 'outflow';
  amountPaise: number;
}
interface Statement {
  party: Party;
  invoices: StatementInvoice[];
  bills: StatementBill[];
  payments: StatementPayment[];
  totals: {
    invoicedPaise: number;
    receivedPaise: number;
    receivableDuePaise: number;
    billedPaise: number;
    paidPaise: number;
    payableDuePaise: number;
  };
}

const day = (iso: string) => String(iso).slice(0, 10);

/**
 * What makes up a party's balance. The list can say a customer owes 4,20,000;
 * this says which invoices that is and what has been paid against them.
 * Drafts are excluded server-side, so these figures agree with the ledger.
 */
function PartyStatement({ party, onClose }: { party: Party; onClose: () => void }) {
  const { data, error, busy } = useLoad(
    () => api<Statement>('GET', `/api/v1/parties/${party.id}/statement`),
    [party.id],
  );

  return (
    <Card
      title={`${party.name} — statement of account`}
      actions={
        <Btn kind="ghost" small onClick={onClose}>
          Close
        </Btn>
      }
    >
      <Err error={error} />
      {busy && <p style={{ color: C.muted }}>Loading…</p>}
      {data && (
        <>
          <Row>
            <span style={{ fontSize: '0.85rem' }}>
              Invoiced <Money paise={data.totals.invoicedPaise} /> · received{' '}
              <Money paise={data.totals.receivedPaise} /> ·{' '}
              <b>
                outstanding <Money paise={data.totals.receivableDuePaise} />
              </b>
            </span>
          </Row>
          <Row>
            <span style={{ fontSize: '0.85rem' }}>
              Billed <Money paise={data.totals.billedPaise} /> · paid{' '}
              <Money paise={data.totals.paidPaise} /> ·{' '}
              <b>
                you owe <Money paise={data.totals.payableDuePaise} />
              </b>
            </span>
          </Row>

          <h4 style={{ margin: '1rem 0 0.4rem', fontSize: '0.85rem', color: C.muted }}>
            Sales invoices
          </h4>
          <Tbl
            head={['Number', 'Issued', 'Due', 'Total', 'Paid', 'Outstanding', 'Status']}
            empty="No issued invoices for this party."
            rows={data.invoices.map((i) => [
              i.invoiceNumber ?? '—',
              day(i.issueDate),
              day(i.dueDate),
              <Money key="t" paise={i.grandTotalPaise} />,
              <Money key="p" paise={i.amountPaidPaise} />,
              <Money key="d" paise={i.amountDuePaise} />,
              <Badge key="s" value={i.status} />,
            ])}
          />

          <h4 style={{ margin: '1rem 0 0.4rem', fontSize: '0.85rem', color: C.muted }}>
            Purchase bills
          </h4>
          <Tbl
            head={['Number', 'Date', 'Total', 'Paid', 'Outstanding', 'Status']}
            empty="No approved bills for this party."
            rows={data.bills.map((b) => [
              b.vendorBillNumber,
              day(b.billDate),
              <Money key="t" paise={b.grandTotalPaise} />,
              <Money key="p" paise={b.amountPaidPaise} />,
              <Money key="d" paise={b.grandTotalPaise - b.amountPaidPaise} />,
              <Badge key="s" value={b.status} />,
            ])}
          />

          <h4 style={{ margin: '1rem 0 0.4rem', fontSize: '0.85rem', color: C.muted }}>Payments</h4>
          <Tbl
            head={['Number', 'Date', 'In/out', 'Amount']}
            empty="No payments recorded with this party."
            rows={data.payments.map((p) => [
              p.paymentNumber,
              day(p.date),
              p.direction === 'inflow' ? 'received' : 'paid',
              <Money key="a" paise={p.amountPaise} />,
            ])}
          />
        </>
      )}
    </Card>
  );
}

export function PartiesPage() {
  const parties = useLoad(() => api<{ parties: Party[] }>('GET', '/api/v1/parties'));
  const items = useLoad(() => api<{ items: Item[] }>('GET', '/api/v1/items'));
  const [selected, setSelected] = useState<Party | null>(null);

  return (
    <div>
      <Card title="Parties — customers & vendors">
        <PartyForm onDone={parties.reload} />
        <Err error={parties.error} />
        <Tbl
          head={['Name', 'Type', 'GSTIN', 'State', 'Receivable', 'Payable']}
          rows={(parties.data?.parties ?? []).map((p) => [
            <button
              key="n"
              type="button"
              onClick={() => setSelected(p)}
              title="Show everything behind this balance"
              style={{
                font: 'inherit',
                color: C.accent,
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              {p.name}
            </button>,
            <span key="t">
              {p.type.map((t) => (
                <Badge key={t} value={t} />
              ))}
            </span>,
            p.gstin ?? '—',
            p.placeOfSupplyStateCode,
            <Money key="r" paise={p.outstandingReceivablePaise} />,
            <Money key="p" paise={p.outstandingPayablePaise} />,
          ])}
        />
      </Card>
      {selected && <PartyStatement party={selected} onClose={() => setSelected(null)} />}

      <Card title="Items & services (GST 2.0 slabs: 0 / 5 / 18 / 40)">
        <ItemForm onDone={items.reload} />
        <Err error={items.error} />
        <Tbl
          head={['Name', 'Kind', 'HSN/SAC', 'GST rate']}
          rows={(items.data?.items ?? []).map((i) => [
            i.name,
            <Badge key="k" value={i.kind} />,
            i.sac ?? i.hsn ?? '—',
            `${i.gstRate}%`,
          ])}
        />
      </Card>
    </div>
  );
}
