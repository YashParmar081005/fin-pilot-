/**
 * Invoicing (§32 Phase 7): draft → issue (gapless number + GL posting) →
 * send / cancel. Totals are SERVER-computed (I5) — this form only ever sends
 * qty, rate and GST rate.
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

interface InvoiceRow {
  id: string;
  invoiceNumber: string | null;
  partySnapshot: { name: string };
  issueDate: string;
  dueDate: string;
  status: string;
  grandTotalPaise: number;
  amountDuePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  eInvoice?: { status: string; irn?: string | null };
}
interface Party {
  id: string;
  name: string;
  type: string[];
}

interface LineDraft {
  description: string;
  qty: string;
  rateRupees: string;
  gstRate: string;
}

function NewInvoice({ parties, onDone }: { parties: Party[]; onDone: () => void }) {
  const [partyId, setPartyId] = useState('');
  const [issueDate, setIssueDate] = useState(today());
  const [lines, setLines] = useState<LineDraft[]>([
    { description: '', qty: '1', rateRupees: '', gstRate: '18' },
  ]);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const customers = parties.filter((p) => p.type.includes('customer'));

  function setLine(i: number, patch: Partial<LineDraft>) {
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('POST', '/api/v1/invoices', {
        partyId,
        issueDate,
        lines: lines.map((l) => ({
          description: l.description,
          qty: Number(l.qty),
          ratePaise: rupeesToPaise(l.rateRupees),
          gstRate: Number(l.gstRate),
        })),
      });
      setLines([{ description: '', qty: '1', rateRupees: '', gstRate: '18' }]);
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
        <Field label="Customer">
          <select
            style={S.input}
            value={partyId}
            onChange={(e) => setPartyId(e.target.value)}
            required
          >
            <option value="">— pick —</option>
            {customers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Issue date">
          <input
            style={S.input}
            type="date"
            value={issueDate}
            onChange={(e) => setIssueDate(e.target.value)}
          />
        </Field>
      </Row>
      {lines.map((line, i) => (
        <Row key={i}>
          <Field label={`Line ${i + 1} description`}>
            <input
              style={{ ...S.input, width: 240 }}
              value={line.description}
              onChange={(e) => setLine(i, { description: e.target.value })}
              required
            />
          </Field>
          <Field label="Qty">
            <input
              style={{ ...S.input, width: 70 }}
              value={line.qty}
              onChange={(e) => setLine(i, { qty: e.target.value })}
            />
          </Field>
          <Field label="Rate (₹)">
            <input
              style={{ ...S.input, width: 110 }}
              value={line.rateRupees}
              onChange={(e) => setLine(i, { rateRupees: e.target.value })}
              required
            />
          </Field>
          <Field label="GST %">
            <select
              style={{ ...S.input, width: 80 }}
              value={line.gstRate}
              onChange={(e) => setLine(i, { gstRate: e.target.value })}
            >
              {['0', '5', '18', '40'].map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </Field>
          {i === lines.length - 1 && (
            <Btn
              small
              kind="ghost"
              onClick={() =>
                setLines((ls) => [
                  ...ls,
                  { description: '', qty: '1', rateRupees: '', gstRate: '18' },
                ])
              }
            >
              + line
            </Btn>
          )}
        </Row>
      ))}
      <p style={{ color: C.muted, fontSize: '0.75rem' }}>
        Totals, tax split and payable are computed by the server (I5) — nothing you type here is
        trusted as a total.
      </p>
      <Row>
        <Btn disabled={busy}>Create draft</Btn>
      </Row>
      <Err error={error} />
    </form>
  );
}

export function InvoicesPage() {
  const invoices = useLoad(() => api<{ invoices: InvoiceRow[] }>('GET', '/api/v1/invoices'));
  const parties = useLoad(() => api<{ parties: Party[] }>('GET', '/api/v1/parties'));
  const [error, setError] = useState<unknown>(null);

  async function act(id: string, action: 'issue' | 'cancel' | 'send') {
    setError(null);
    try {
      await api(
        'POST',
        `/api/v1/invoices/${id}/${action}`,
        action === 'cancel' ? { reason: 'cancelled from UI' } : {},
      );
      invoices.reload();
    } catch (err) {
      setError(err);
    }
  }

  return (
    <div>
      <Card title="New invoice">
        <NewInvoice parties={parties.data?.parties ?? []} onDone={invoices.reload} />
      </Card>
      <Card title="Invoices">
        <Err error={error} />
        <Err error={invoices.error} />
        <Tbl
          head={[
            'Number',
            'Customer',
            'Issued',
            'Due',
            'Status',
            'e-invoice',
            'Total',
            'Due amt',
            'Actions',
          ]}
          rows={(invoices.data?.invoices ?? []).map((inv) => [
            inv.invoiceNumber ?? <i style={{ color: C.muted }}>draft</i>,
            inv.partySnapshot?.name,
            dateStr(inv.issueDate),
            dateStr(inv.dueDate),
            <Badge key="s" value={inv.status} />,
            inv.eInvoice?.status && inv.eInvoice.status !== 'not_applicable' ? (
              <span key="e" title={inv.eInvoice.irn ?? ''}>
                <Badge value={inv.eInvoice.status} />
              </span>
            ) : (
              '—'
            ),
            <Money key="t" paise={inv.grandTotalPaise} />,
            <Money key="d" paise={inv.amountDuePaise} />,
            <span key="a" style={{ display: 'flex', gap: 6 }}>
              {inv.status === 'draft' && (
                <Btn small onClick={() => void act(inv.id, 'issue')}>
                  Issue
                </Btn>
              )}
              {inv.status === 'issued' && (
                <Btn small kind="ghost" onClick={() => void act(inv.id, 'send')}>
                  Email
                </Btn>
              )}
              {(inv.status === 'draft' || inv.status === 'issued') && (
                <Btn small kind="danger" onClick={() => void act(inv.id, 'cancel')}>
                  Cancel
                </Btn>
              )}
            </span>,
          ])}
        />
      </Card>
    </div>
  );
}
