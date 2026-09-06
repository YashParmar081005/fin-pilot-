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
  email?: string;
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

  function removeLine(i: number) {
    setLines((ls) => ls.filter((_, j) => j !== i));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Automatically remove/filter out completely empty lines
    const filledLines = lines.filter(
      (l) => l.description.trim() !== '' || l.rateRupees.trim() !== '',
    );

    if (filledLines.length === 0) {
      setError(new Error('Please add at least one line item with a description and rate.'));
      return;
    }

    // Validate that each filled line has description and positive rate
    for (const [idx, l] of filledLines.entries()) {
      if (!l.description.trim()) {
        setError(new Error(`Line ${idx + 1}: Description is required.`));
        return;
      }
      const rateNum = Number(l.rateRupees);
      if (!l.rateRupees.trim() || isNaN(rateNum) || rateNum < 0) {
        setError(new Error(`Line ${idx + 1}: Rate must be a valid positive number.`));
        return;
      }
      const qtyNum = Number(l.qty);
      if (isNaN(qtyNum) || qtyNum <= 0) {
        setError(new Error(`Line ${idx + 1}: Quantity must be at least 1.`));
        return;
      }
    }

    setBusy(true);
    try {
      await api('POST', '/api/v1/invoices', {
        partyId,
        issueDate,
        lines: filledLines.map((l) => ({
          description: l.description.trim(),
          qty: Number(l.qty) || 1,
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
              placeholder="e.g. Consulting"
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
              placeholder="5000"
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
                  {r}%
                </option>
              ))}
            </select>
          </Field>
          {lines.length > 1 && (
            <button
              type="button"
              title="Remove line"
              onClick={() => removeLine(i)}
              style={{
                background: 'transparent',
                border: '1px solid var(--border)',
                borderRadius: 8,
                color: 'var(--red)',
                cursor: 'pointer',
                padding: '7px 12px',
                fontSize: '14px',
                fontWeight: 600,
                alignSelf: 'flex-end',
                marginBottom: 6,
                transition: 'background-color 0.2s',
              }}
            >
              ✕
            </button>
          )}
          {i === lines.length - 1 && (
            <Btn
              small
              kind="ghost"
              type="button"
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
    let body: Record<string, unknown> = {};
    if (action === 'cancel') {
      body = { reason: 'cancelled from UI' };
    } else if (action === 'send') {
      const inv = invoices.data?.invoices.find((i) => i.id === id);
      const party = parties.data?.parties.find((p) => p.name === inv?.partySnapshot?.name);
      const recipient = window.prompt(
        `Send invoice ${inv?.invoiceNumber ?? ''} to email:`,
        party?.email || '',
      );
      if (!recipient || !recipient.trim()) return;
      body = { email: recipient.trim() };
    }
    try {
      await api('POST', `/api/v1/invoices/${id}/${action}`, body);
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
