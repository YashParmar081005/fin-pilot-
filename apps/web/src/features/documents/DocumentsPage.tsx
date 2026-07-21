/**
 * Documents / OCR (§32 Phase 18): upload a vendor bill as a PDF or photo →
 * the server extracts fields with per-field confidence (never guessed —
 * low confidence = null) → a human reviews and creates the bill draft.
 */
import { useState } from 'react';
import { api, fileToBase64 } from '../../lib/api';
import { Badge, Btn, C, Card, Err, Field, Money, Row, S, Tbl, useLoad } from '../../lib/ui';

interface Extracted<T> {
  value: T | null;
  confidence: number;
}
interface Doc {
  id: string;
  filename: string;
  status: 'uploaded' | 'extracted' | 'failed';
  extractedBy: 'text-layer' | 'vision' | null;
  costPaise: number;
  billId: string | null;
  extraction: {
    vendorName: Extracted<string>;
    gstin: Extracted<string>;
    documentNumber: Extracted<string>;
    documentDate: Extracted<string>;
    totalPaise: Extracted<number>;
    taxablePaise: Extracted<number>;
    arithmeticOk: boolean | null;
  } | null;
}
interface Party {
  id: string;
  name: string;
  type: string[];
}

function ConfidenceCell({ field, money }: { field: Extracted<unknown>; money?: boolean }) {
  const color = field.confidence >= 0.9 ? C.green : field.confidence >= 0.6 ? C.amber : C.red;
  return (
    <span>
      {field.value === null ? (
        <i style={{ color: C.muted }}>not read — fill by hand</i>
      ) : money ? (
        <Money paise={field.value as number} />
      ) : (
        String(field.value)
      )}{' '}
      <span style={{ color, fontSize: '0.7rem' }}>({Math.round(field.confidence * 100)}%)</span>
    </span>
  );
}

export function DocumentsPage() {
  const parties = useLoad(() => api<{ parties: Party[] }>('GET', '/api/v1/parties'));
  const [docs, setDocs] = useState<Doc[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [partyId, setPartyId] = useState('');
  const [gstRate, setGstRate] = useState('18');

  const vendors = (parties.data?.parties ?? []).filter((p) => p.type.includes('vendor'));

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    try {
      const { document } = await api<{ document: Doc }>('POST', '/api/v1/documents', {
        filename: file.name,
        mimeType: file.type || 'application/octet-stream',
        contentBase64: await fileToBase64(file),
      });
      let doc = document;
      // extraction may be async — poll until it settles
      for (let i = 0; i < 10 && doc.status === 'uploaded'; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        doc = (await api<{ document: Doc }>('GET', `/api/v1/documents/${document.id}`)).document;
      }
      setDocs((d) => [doc, ...d]);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function createBill(doc: Doc) {
    setError(null);
    try {
      await api('POST', `/api/v1/bills/from-document/${doc.id}`, {
        partyId,
        gstRate: Number(gstRate),
      });
      const fresh = (await api<{ document: Doc }>('GET', `/api/v1/documents/${doc.id}`)).document;
      setDocs((d) => d.map((x) => (x.id === doc.id ? fresh : x)));
    } catch (err) {
      setError(err);
    }
  }

  return (
    <div>
      <Card title="Upload a vendor bill — PDF or photo">
        <p style={{ color: C.muted, fontSize: '0.85rem' }}>
          A clean PDF with a text layer costs ₹0 to read; photos go through vision OCR. Every
          extracted field carries a confidence — a low-confidence field is{' '}
          <b>null, never guessed</b>. You confirm before any entry exists.
        </p>
        <input
          type="file"
          accept="application/pdf,image/*"
          style={{ color: C.text }}
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
            e.target.value = '';
          }}
        />
        {busy && <p style={{ color: C.muted }}>Uploading & extracting…</p>}
        <Err error={error} />
      </Card>

      {docs.map((doc) => (
        <Card
          key={doc.id}
          title={
            <span>
              {doc.filename} <Badge value={doc.status} />{' '}
              {doc.extractedBy && (
                <span style={{ color: C.muted, fontSize: '0.75rem' }}>
                  via {doc.extractedBy} · extraction cost <Money paise={doc.costPaise} />
                </span>
              )}
            </span>
          }
        >
          {doc.extraction ? (
            <>
              <Tbl
                head={['Vendor', 'GSTIN', 'Bill no.', 'Date', 'Taxable', 'Total', 'Arithmetic']}
                rows={[
                  [
                    <ConfidenceCell key="v" field={doc.extraction.vendorName} />,
                    <ConfidenceCell key="g" field={doc.extraction.gstin} />,
                    <ConfidenceCell key="n" field={doc.extraction.documentNumber} />,
                    <ConfidenceCell key="d" field={doc.extraction.documentDate} />,
                    <ConfidenceCell key="x" field={doc.extraction.taxablePaise} money />,
                    <ConfidenceCell key="t" field={doc.extraction.totalPaise} money />,
                    doc.extraction.arithmeticOk === null
                      ? '—'
                      : doc.extraction.arithmeticOk
                        ? '✓ adds up'
                        : '✗ mismatch',
                  ],
                ]}
              />
              {doc.billId ? (
                <p style={{ color: C.green, fontSize: '0.85rem' }}>
                  ✓ Bill draft created — review it under Purchases.
                </p>
              ) : (
                <Row>
                  <Field label="Vendor (confirm the match)">
                    <select
                      style={S.input}
                      value={partyId}
                      onChange={(e) => setPartyId(e.target.value)}
                    >
                      <option value="">— pick vendor —</option>
                      {vendors.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
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
                  <Btn disabled={!partyId} onClick={() => void createBill(doc)}>
                    Create bill draft from this document
                  </Btn>
                </Row>
              )}
            </>
          ) : (
            <p style={{ color: doc.status === 'failed' ? C.red : C.muted }}>
              {doc.status === 'failed'
                ? 'Extraction failed — enter the bill manually under Purchases.'
                : 'Awaiting extraction…'}
            </p>
          )}
        </Card>
      ))}
      {docs.length === 0 && (
        <p style={{ color: C.muted, fontSize: '0.85rem' }}>
          Uploads from this session appear here with their extracted fields.
        </p>
      )}
    </div>
  );
}
