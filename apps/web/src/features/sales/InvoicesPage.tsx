/**
 * Invoicing (§32 Phase 7): draft → issue (gapless number + GL posting) →
 * send / cancel. Totals are SERVER-computed (I5) — this form only ever sends
 * qty, rate and GST rate.
 */
import { useEffect, useState } from 'react';
import { GST_STATE_CODES } from '@finpilot/shared';
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

interface InvoiceLineItem {
  description: string;
  hsn?: string;
  qty: number;
  ratePaise: number;
  discountPercent?: number;
  taxablePaise: number;
  gstRate: number;
  cessRate?: number;
  cgstPaise?: number;
  sgstPaise?: number;
  igstPaise?: number;
  cessPaise?: number;
  lineTotalPaise: number;
}

interface InvoiceRow {
  id: string;
  invoiceNumber: string | null;
  series?: string;
  partySnapshot: {
    name: string;
    gstin?: string | null;
    address?: unknown;
    stateCode?: string | null;
  };
  issueDate: string;
  dueDate: string;
  status: string;
  placeOfSupplyStateCode?: string;
  supplyType?: string;
  reverseCharge?: boolean;
  grandTotalPaise: number;
  amountDuePaise: number;
  amountPaidPaise?: number;
  taxableValuePaise?: number;
  subtotalPaise?: number;
  totalDiscountPaise?: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  cessPaise?: number;
  roundOffPaise?: number;
  notes?: string;
  termsAndConditions?: string;
  lines?: InvoiceLineItem[];
  eInvoice?: {
    status: string;
    irn?: string | null;
    ackNo?: string | null;
    ackDate?: string | null;
  };
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
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceRow | null>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setSelectedInvoice(null);
    }
    if (selectedInvoice) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [selectedInvoice]);

  async function openInvoiceDetails(inv: InvoiceRow) {
    setSelectedInvoice(inv);
    try {
      const res = await api<{ invoice: InvoiceRow }>('GET', `/api/v1/invoices/${inv.id}`);
      if (res?.invoice) {
        setSelectedInvoice(res.invoice);
      }
    } catch {
      // already have row data as fallback
    }
  }

  async function act(id: string, action: 'issue' | 'cancel' | 'send') {
    setError(null);
    let body: Record<string, unknown> = {};
    if (action === 'cancel') {
      body = { reason: 'cancelled from UI' };
    } else if (action === 'send') {
      const inv =
        selectedInvoice?.id === id
          ? selectedInvoice
          : invoices.data?.invoices.find((i) => i.id === id);
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
      if (selectedInvoice && selectedInvoice.id === id) {
        try {
          const res = await api<{ invoice: InvoiceRow }>('GET', `/api/v1/invoices/${id}`);
          if (res?.invoice) setSelectedInvoice(res.invoice);
        } catch {
          setSelectedInvoice(null);
        }
      }
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
            <button
              key="num"
              type="button"
              onClick={() => void openInvoiceDetails(inv)}
              title="Click to view full invoice details"
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                color: C.accent,
                fontWeight: 600,
                cursor: 'pointer',
                textDecoration: 'underline',
                fontSize: 'inherit',
                fontFamily: 'inherit',
              }}
            >
              {inv.invoiceNumber ?? <i style={{ color: C.muted }}>draft</i>}
            </button>,
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
            <span key="a" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <Btn small kind="ghost" onClick={() => void openInvoiceDetails(inv)}>
                View
              </Btn>
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

      {/* Full Invoice Details Modal */}
      {selectedInvoice && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(4px)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
          }}
          onClick={() => setSelectedInvoice(null)}
        >
          <div
            style={{
              background: C.panel,
              color: C.text,
              border: `1px solid ${C.border}`,
              borderRadius: 16,
              width: '100%',
              maxWidth: 880,
              maxHeight: '92vh',
              overflowY: 'auto',
              padding: '1.8rem',
              boxShadow: '0 25px 60px rgba(0, 0, 0, 0.4)',
              boxSizing: 'border-box',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                borderBottom: `1px solid ${C.border}`,
                paddingBottom: '1.2rem',
                marginBottom: '1.4rem',
                flexWrap: 'wrap',
                gap: 12,
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                  <h2 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 700 }}>
                    {selectedInvoice.invoiceNumber
                      ? `Tax Invoice ${selectedInvoice.invoiceNumber}`
                      : 'Draft Invoice'}
                  </h2>
                  <Badge value={selectedInvoice.status} />
                </div>
                <p style={{ margin: 0, color: C.muted, fontSize: '0.85rem' }}>
                  Series: {selectedInvoice.series || 'INV'} • Place of Supply:{' '}
                  {selectedInvoice.placeOfSupplyStateCode ||
                    selectedInvoice.partySnapshot?.stateCode ||
                    '—'}{' '}
                  {GST_STATE_CODES[
                    selectedInvoice.placeOfSupplyStateCode ||
                      selectedInvoice.partySnapshot?.stateCode ||
                      ''
                  ]
                    ? `(${
                        GST_STATE_CODES[
                          selectedInvoice.placeOfSupplyStateCode ||
                            selectedInvoice.partySnapshot?.stateCode ||
                            ''
                        ]
                      })`
                    : ''}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <Btn small kind="ghost" onClick={() => window.print()}>
                  🖨 Print
                </Btn>
                <button
                  type="button"
                  title="Close (Esc)"
                  onClick={() => setSelectedInvoice(null)}
                  style={{
                    background: 'transparent',
                    border: `1px solid ${C.border}`,
                    borderRadius: 8,
                    color: C.muted,
                    cursor: 'pointer',
                    width: 36,
                    height: 36,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.1rem',
                  }}
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Bill To & Invoice Meta Details */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: 16,
                background: C.panel2,
                padding: '1.2rem',
                borderRadius: 12,
                marginBottom: '1.4rem',
                fontSize: '0.88rem',
              }}
            >
              <div>
                <div
                  style={{
                    fontWeight: 700,
                    color: C.muted,
                    fontSize: '0.72rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    marginBottom: 6,
                  }}
                >
                  Billed To (Customer)
                </div>
                <div style={{ fontWeight: 600, fontSize: '1.05rem', color: C.text }}>
                  {selectedInvoice.partySnapshot?.name}
                </div>
                <div style={{ color: C.muted, marginTop: 4 }}>
                  GSTIN:{' '}
                  <span
                    style={{
                      fontFamily: 'var(--font-mono, monospace)',
                      color: C.text,
                      fontWeight: 500,
                    }}
                  >
                    {selectedInvoice.partySnapshot?.gstin || 'Unregistered'}
                  </span>
                </div>
                <div style={{ color: C.muted, marginTop: 2 }}>
                  State Code: {selectedInvoice.partySnapshot?.stateCode || '—'}
                </div>
              </div>

              <div>
                <div
                  style={{
                    fontWeight: 700,
                    color: C.muted,
                    fontSize: '0.72rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    marginBottom: 6,
                  }}
                >
                  Invoice Details
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'auto 1fr',
                    gap: '4px 12px',
                    color: C.muted,
                  }}
                >
                  <span>Issue Date:</span>
                  <span style={{ color: C.text, fontWeight: 500 }}>
                    {dateStr(selectedInvoice.issueDate)}
                  </span>
                  <span>Due Date:</span>
                  <span style={{ color: C.text, fontWeight: 500 }}>
                    {dateStr(selectedInvoice.dueDate)}
                  </span>
                  <span>Supply Type:</span>
                  <span style={{ color: C.text, fontWeight: 500 }}>
                    {selectedInvoice.supplyType === 'intra'
                      ? 'Intra-State (CGST + SGST)'
                      : selectedInvoice.supplyType === 'inter'
                        ? 'Inter-State (IGST)'
                        : selectedInvoice.supplyType || '—'}
                  </span>
                  <span>Reverse Charge:</span>
                  <span style={{ color: C.text, fontWeight: 500 }}>
                    {selectedInvoice.reverseCharge ? 'Yes' : 'No'}
                  </span>
                </div>
              </div>
            </div>

            {/* e-Invoice block if present */}
            {selectedInvoice.eInvoice?.irn && (
              <div
                style={{
                  background: 'color-mix(in srgb, var(--accent) 8%, transparent)',
                  border: `1px solid color-mix(in srgb, var(--accent) 30%, transparent)`,
                  borderRadius: 10,
                  padding: '0.8rem 1rem',
                  marginBottom: '1.4rem',
                  fontSize: '0.82rem',
                }}
              >
                <div style={{ fontWeight: 600, color: C.accent, marginBottom: 4 }}>
                  e-Invoice Details
                </div>
                <div style={{ fontFamily: 'var(--font-mono, monospace)', wordBreak: 'break-all' }}>
                  IRN: {selectedInvoice.eInvoice.irn}
                </div>
                {selectedInvoice.eInvoice.ackNo && (
                  <div style={{ color: C.muted, marginTop: 2 }}>
                    Ack No: {selectedInvoice.eInvoice.ackNo} • Ack Date:{' '}
                    {dateStr(selectedInvoice.eInvoice.ackDate)}
                  </div>
                )}
              </div>
            )}

            {/* Line Items Table */}
            <div style={{ marginBottom: '1.5rem' }}>
              <h4 style={{ margin: '0 0 0.6rem 0', fontSize: '0.95rem', fontWeight: 600 }}>
                Line Items
              </h4>
              <div style={{ overflowX: 'auto' }}>
                <table
                  style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}
                >
                  <thead>
                    <tr
                      style={{
                        background: C.panel2,
                        textAlign: 'left',
                        borderBottom: `2px solid ${C.border}`,
                      }}
                    >
                      <th style={{ padding: '8px 10px' }}>#</th>
                      <th style={{ padding: '8px 10px' }}>Description</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right' }}>Qty</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right' }}>Rate</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right' }}>Taxable</th>
                      <th style={{ padding: '8px 10px', textAlign: 'center' }}>GST</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right' }}>Tax</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right' }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedInvoice.lines && selectedInvoice.lines.length > 0 ? (
                      selectedInvoice.lines.map((line, idx) => {
                        const lineTaxPaise =
                          (line.cgstPaise || 0) +
                          (line.sgstPaise || 0) +
                          (line.igstPaise || 0) +
                          (line.cessPaise || 0);
                        return (
                          <tr key={idx} style={{ borderBottom: `1px solid ${C.border}` }}>
                            <td style={{ padding: '10px 10px', color: C.muted }}>{idx + 1}</td>
                            <td style={{ padding: '10px 10px' }}>
                              <div style={{ fontWeight: 500 }}>{line.description}</div>
                              {line.hsn && (
                                <div style={{ fontSize: '0.72rem', color: C.muted }}>
                                  HSN/SAC: {line.hsn}
                                </div>
                              )}
                            </td>
                            <td style={{ padding: '10px 10px', textAlign: 'right' }}>
                              {line.qty}
                            </td>
                            <td style={{ padding: '10px 10px', textAlign: 'right' }}>
                              <Money paise={line.ratePaise} />
                            </td>
                            <td style={{ padding: '10px 10px', textAlign: 'right' }}>
                              <Money paise={line.taxablePaise} />
                            </td>
                            <td style={{ padding: '10px 10px', textAlign: 'center' }}>
                              {line.gstRate}%
                            </td>
                            <td style={{ padding: '10px 10px', textAlign: 'right' }}>
                              <Money paise={lineTaxPaise} />
                            </td>
                            <td
                              style={{
                                padding: '10px 10px',
                                textAlign: 'right',
                                fontWeight: 600,
                              }}
                            >
                              <Money paise={line.lineTotalPaise} />
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td
                          colSpan={8}
                          style={{ padding: '12px', textAlign: 'center', color: C.muted }}
                        >
                          No line items available.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Totals Breakdown */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1.5rem' }}>
              <div
                style={{
                  width: '100%',
                  maxWidth: 360,
                  background: C.panel2,
                  padding: '1.2rem',
                  borderRadius: 12,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginBottom: 6,
                    fontSize: '0.85rem',
                  }}
                >
                  <span style={{ color: C.muted }}>Taxable Amount:</span>
                  <Money
                    paise={selectedInvoice.taxableValuePaise ?? selectedInvoice.subtotalPaise}
                  />
                </div>
                {selectedInvoice.cgstPaise > 0 && (
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginBottom: 6,
                      fontSize: '0.85rem',
                    }}
                  >
                    <span style={{ color: C.muted }}>CGST:</span>
                    <Money paise={selectedInvoice.cgstPaise} />
                  </div>
                )}
                {selectedInvoice.sgstPaise > 0 && (
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginBottom: 6,
                      fontSize: '0.85rem',
                    }}
                  >
                    <span style={{ color: C.muted }}>SGST:</span>
                    <Money paise={selectedInvoice.sgstPaise} />
                  </div>
                )}
                {selectedInvoice.igstPaise > 0 && (
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginBottom: 6,
                      fontSize: '0.85rem',
                    }}
                  >
                    <span style={{ color: C.muted }}>IGST:</span>
                    <Money paise={selectedInvoice.igstPaise} />
                  </div>
                )}
                {selectedInvoice.cessPaise ? (
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginBottom: 6,
                      fontSize: '0.85rem',
                    }}
                  >
                    <span style={{ color: C.muted }}>Cess:</span>
                    <Money paise={selectedInvoice.cessPaise} />
                  </div>
                ) : null}
                {selectedInvoice.roundOffPaise ? (
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginBottom: 6,
                      fontSize: '0.85rem',
                    }}
                  >
                    <span style={{ color: C.muted }}>Round Off:</span>
                    <Money paise={selectedInvoice.roundOffPaise} />
                  </div>
                ) : null}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    borderTop: `1px solid ${C.border}`,
                    paddingTop: 8,
                    marginTop: 6,
                    fontWeight: 700,
                    fontSize: '1.05rem',
                  }}
                >
                  <span>Grand Total:</span>
                  <Money paise={selectedInvoice.grandTotalPaise} />
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginTop: 6,
                    fontSize: '0.9rem',
                    color: selectedInvoice.amountDuePaise > 0 ? C.red : C.green,
                    fontWeight: 600,
                  }}
                >
                  <span>Amount Due:</span>
                  <Money
                    paise={selectedInvoice.amountDuePaise}
                    colored={selectedInvoice.amountDuePaise > 0}
                  />
                </div>
              </div>
            </div>

            {/* Notes & Terms if any */}
            {(selectedInvoice.notes || selectedInvoice.termsAndConditions) && (
              <div
                style={{
                  fontSize: '0.82rem',
                  color: C.muted,
                  borderTop: `1px solid ${C.border}`,
                  paddingTop: 12,
                  marginBottom: '1.4rem',
                }}
              >
                {selectedInvoice.notes && (
                  <div>
                    <strong>Notes:</strong> {selectedInvoice.notes}
                  </div>
                )}
                {selectedInvoice.termsAndConditions && (
                  <div style={{ marginTop: 4 }}>
                    <strong>Terms & Conditions:</strong> {selectedInvoice.termsAndConditions}
                  </div>
                )}
              </div>
            )}

            {/* Actions */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderTop: `1px solid ${C.border}`,
                paddingTop: '1.2rem',
                flexWrap: 'wrap',
                gap: 10,
              }}
            >
              <div style={{ display: 'flex', gap: 8 }}>
                {selectedInvoice.status === 'draft' && (
                  <Btn
                    small
                    onClick={async () => {
                      await act(selectedInvoice.id, 'issue');
                    }}
                  >
                    Issue Invoice
                  </Btn>
                )}
                {selectedInvoice.status === 'issued' && (
                  <Btn
                    small
                    kind="ghost"
                    onClick={async () => {
                      await act(selectedInvoice.id, 'send');
                    }}
                  >
                    Email Invoice
                  </Btn>
                )}
                {(selectedInvoice.status === 'draft' ||
                  selectedInvoice.status === 'issued') && (
                  <Btn
                    small
                    kind="danger"
                    onClick={async () => {
                      await act(selectedInvoice.id, 'cancel');
                    }}
                  >
                    Cancel Invoice
                  </Btn>
                )}
              </div>
              <Btn kind="ghost" small onClick={() => setSelectedInvoice(null)}>
                Close
              </Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
