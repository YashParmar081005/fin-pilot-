/**
 * Banking (§32 Phase 15) + reconciliation (§32 Phase 16): CSV import with
 * column mapping and fingerprint dedupe, then suggestion → human confirm.
 * Suggestions never post; only the Confirm button does.
 */
import { useState } from 'react';
import { api, qs } from '../../lib/api';
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
