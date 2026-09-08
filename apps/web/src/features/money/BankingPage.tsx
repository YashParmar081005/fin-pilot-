/**
 * Banking (§32 Phase 15) + reconciliation (§32 Phase 16): CSV import with
 * column mapping and fingerprint dedupe, then suggestion → human confirm.
 * Suggestions never post; only the Confirm button does.
 */
import { useState } from 'react';
import { api, fileToBase64, qs } from '../../lib/api';
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
  useLoad,
} from '../../lib/ui';

interface BankAccount {
  id?: string;
  _id?: string;
  name: string;
  bankName?: string;
  currentBalancePaise?: number;
}
interface BankTxn {
  id?: string;
  _id?: string;
  date: string;
  narration: string;
  amountPaise: number;
  direction: 'credit' | 'debit';
  status: string;
}
interface Suggestion {
  bankTransactionId: string;
  narration?: string;
  amountPaise?: number;
  candidates: Array<{
    documentModel: string;
    documentId: string;
    label?: string;
    score: number;
    reasons?: string[];
  }>;
}

const bid = (b: { id?: string; _id?: string }) => String(b.id ?? b._id);

interface ScanRow {
  date: string;
  narration: string;
  amountPaise: number;
  direction: 'credit' | 'debit';
  reference: string | null;
  /** A running-balance column independently confirmed this row. */
  balanceChecked: boolean;
}
interface ScanResult {
  engine: string;
  confidence: number;
  rows: ScanRow[];
  unparsed: string[];
  openingBalancePaise: number | null;
  closingBalancePaise: number | null;
  csv: string;
}

export function BankingPage() {
  const accounts = useLoad(() =>
    api<{ bankAccounts: BankAccount[] }>('GET', '/api/v1/bank-accounts'),
  );
  const [selected, setSelected] = useState<string>('');
  const active =
    selected || (accounts.data?.bankAccounts[0] ? bid(accounts.data.bankAccounts[0]) : '');

  const txns = useLoad(
    () =>
      active
        ? api<{ transactions: BankTxn[] }>('GET', `/api/v1/bank-accounts/${active}/transactions`)
        : Promise.resolve({ transactions: [] }),
    [active],
  );
  const suggestions = useLoad(
    () =>
      active
        ? api<{ suggestions: Suggestion[] }>(
            'GET',
            `/api/v1/reconciliation/suggestions${qs({ bankAccountId: active })}`,
          )
        : Promise.resolve({ suggestions: [] }),
    [active],
  );

  const [name, setName] = useState('');
  const [csv, setCsv] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState('');
  const [scanning, setScanning] = useState(false);
  const [scan, setScan] = useState<ScanResult | null>(null);

  async function createAccount(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api('POST', '/api/v1/bank-accounts', { name });
      setName('');
      accounts.reload();
    } catch (err) {
      setError(err);
    }
  }

  /**
   * Read a photographed or scanned statement. This only PROPOSES rows: the
   * server writes nothing, the rows land in the CSV box below for review, and
   * the existing Import button is still what stores them (I10).
   */
  async function scanStatement(file: File) {
    setScanning(true);
    setError(null);
    setNotice('');
    setScan(null);
    try {
      const result = await api<ScanResult>('POST', `/api/v1/bank-accounts/${active}/scan`, {
        filename: file.name,
        mimeType: file.type || 'application/octet-stream',
        contentBase64: await fileToBase64(file),
      });
      setScan(result);
      setCsv(result.csv);
    } catch (err) {
      setError(err);
    } finally {
      setScanning(false);
    }
  }

  async function importCsv() {
    setError(null);
    setNotice('');
    try {
      const result = await api<{ imported: number; duplicates: number }>(
        'POST',
        `/api/v1/bank-accounts/${active}/import`,
        {
          csv,
          mapping: { date: 'Date', narration: 'Narration', amount: 'Amount', reference: 'Ref' },
        },
      );
      setNotice(
        `Imported ${result.imported}, skipped ${result.duplicates} duplicates (fingerprint dedupe).`,
      );
      setCsv('');
      setScan(null);
      txns.reload();
      suggestions.reload();
    } catch (err) {
      setError(err);
    }
  }

  async function confirm(suggestion: Suggestion) {
    setError(null);
    const best = suggestion.candidates[0];
    if (!best) return;
    try {
      await api('POST', '/api/v1/reconciliation/confirm', {
        matches: [
          {
            bankTransactionId: suggestion.bankTransactionId,
            documentModel: best.documentModel,
            documentId: best.documentId,
          },
        ],
      });
      txns.reload();
      suggestions.reload();
    } catch (err) {
      setError(err);
    }
  }

  return (
    <div>
      <Err error={error} />
      <Card title="Bank accounts">
        <form onSubmit={createAccount}>
          <Row>
            <Field label="Add account (name)">
              <input
                style={S.input}
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </Field>
            <Btn>Add</Btn>
          </Row>
        </form>
        <Err error={accounts.error} />
        <Row>
          {(accounts.data?.bankAccounts ?? []).map((b) => (
            <Btn
              key={bid(b)}
              small
              kind={bid(b) === active ? 'primary' : 'ghost'}
              onClick={() => setSelected(bid(b))}
            >
              {b.name}
            </Btn>
          ))}
        </Row>
      </Card>

      {active && (
        <>
          <Card title="Scan a statement — PDF or photo">
            <p style={{ color: C.muted, fontSize: '0.85rem', marginTop: 0 }}>
              OCR reads the rows and, where the statement prints a running balance, checks each
              amount against the balance movement. Rows land in the box below for you to review —{' '}
              <b>nothing is imported until you press Import</b>.
            </p>
            <input
              type="file"
              accept="application/pdf,image/*"
              style={{ color: C.text }}
              disabled={scanning || !active}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void scanStatement(file);
                e.target.value = '';
              }}
            />
            {scanning && <p style={{ color: C.muted }}>Reading the statement…</p>}
            {scan && (
              <>
                <p style={{ fontSize: '0.85rem', margin: '0.6rem 0 0.4rem' }}>
                  Read <b>{scan.rows.length}</b> row(s) via {scan.engine} (
                  {Math.round(scan.confidence * 100)}%)
                  {scan.rows.filter((r) => r.balanceChecked).length > 0 && (
                    <>
                      {' — '}
                      <span style={{ color: C.green }}>
                        {scan.rows.filter((r) => r.balanceChecked).length} confirmed by the balance
                        column
                      </span>
                    </>
                  )}
                  {scan.unparsed.length > 0 && (
                    <>
                      {', '}
                      <span style={{ color: C.red }}>
                        {scan.unparsed.length} could not be read — enter by hand
                      </span>
                    </>
                  )}
                </p>
                <Tbl
                  head={['Date', 'Narration', 'Amount', 'In/out', 'Checked']}
                  rows={scan.rows.map((r) => [
                    r.date,
                    r.narration,
                    <Money key="a" paise={r.amountPaise} />,
                    r.direction === 'credit' ? 'in' : 'out',
                    r.balanceChecked ? (
                      <span key="c" style={{ color: C.green }}>
                        ✓ balance
                      </span>
                    ) : (
                      <span key="c" style={{ color: C.amber }}>
                        unconfirmed
                      </span>
                    ),
                  ])}
                />
                {scan.unparsed.length > 0 && (
                  <pre
                    style={{
                      fontSize: '0.72rem',
                      color: C.muted,
                      background: C.panel2,
                      border: `1px solid ${C.border}`,
                      borderRadius: 8,
                      padding: '0.5rem 0.6rem',
                      whiteSpace: 'pre-wrap',
                      overflowWrap: 'anywhere',
                    }}
                  >
                    {scan.unparsed.join('\n')}
                  </pre>
                )}
              </>
            )}
          </Card>

          <Card title="Import statement (CSV with header: Date,Narration,Amount,Ref)">
            <textarea
              style={{ ...S.input, height: 110, fontFamily: 'monospace' }}
              placeholder={'Date,Narration,Amount,Ref\n2026-07-01,NEFT ACME RETAIL,59000.00,UTR123'}
              value={csv}
              onChange={(e) => setCsv(e.target.value)}
            />
            <Row>
              <Btn onClick={() => void importCsv()} disabled={!csv.trim()}>
                Import
              </Btn>
              {notice && <span style={{ color: C.green, fontSize: '0.85rem' }}>{notice}</span>}
            </Row>
          </Card>

          <Card title="Reconciliation suggestions (never auto-posted — you confirm)">
            <Err error={suggestions.error} />
            <Tbl
              head={['Bank line', 'Amount', 'Best match', 'Score', 'Why', 'Action']}
              empty="No unmatched lines with candidates."
              rows={(suggestions.data?.suggestions ?? [])
                .filter((s) => s.candidates.length > 0)
                .map((s) => {
                  const best = s.candidates[0]!;
                  return [
                    s.narration ?? s.bankTransactionId,
                    <Money key="a" paise={s.amountPaise ?? null} />,
                    best.label ?? `${best.documentModel} ${best.documentId.slice(-6)}`,
                    best.score.toFixed(2),
                    <span key="w" style={{ fontSize: '0.75rem', color: C.muted }}>
                      {(best.reasons ?? []).join(', ')}
                    </span>,
                    <Btn key="c" small kind="success" onClick={() => void confirm(s)}>
                      Confirm match
                    </Btn>,
                  ];
                })}
            />
          </Card>

          <Card title="Bank transactions">
            <Err error={txns.error} />
            <Tbl
              head={['Date', 'Narration', 'Direction', 'Amount', 'Status']}
              rows={(txns.data?.transactions ?? []).map((t) => [
                dateStr(t.date),
                t.narration,
                <Badge key="d" value={t.direction} />,
                <Money key="a" paise={t.amountPaise} />,
                <Badge key="s" value={t.status} />,
              ])}
            />
          </Card>
        </>
      )}
    </div>
  );
}
