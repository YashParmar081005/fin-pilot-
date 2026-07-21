import { useEffect, useState } from 'react';
import { formatINR, toPaise } from '@finpilot/shared';
import { api, RequestError } from '../../lib/api';
import { C } from '../../lib/ui';
import type { AccountRow } from '../accounts/AccountsTree';

// Manual journal vouchers (Phase 5) — post and reverse against the engine.

interface EntryLineDto {
  lineNo: number;
  accountId: string;
  debitPaise: number;
  creditPaise: number;
}

interface EntryDto {
  id: string;
  entryNumber: string;
  date: string;
  narration: string;
  status: 'posted' | 'reversed';
  totalDebitPaise: number;
  lines: EntryLineDto[];
  reversedByEntryId: string | null;
}

interface FormLine {
  accountId: string;
  side: 'debit' | 'credit';
  rupees: string;
}

const S: Record<string, React.CSSProperties> = {
  input: {
    padding: '0.4rem 0.6rem',
    borderRadius: 8,
    border: `1px solid ${C.border}`,
    background: C.panel,
    color: C.text,
    fontSize: '0.85rem',
    fontFamily: 'inherit',
  },
  button: {
    padding: '0.4rem 0.9rem',
    borderRadius: 8,
    border: 'none',
    background: C.accent,
    color: C.accentText,
    fontWeight: 700,
    cursor: 'pointer',
    fontSize: '0.85rem',
    fontFamily: 'inherit',
  },
  row: { display: 'flex', gap: 8, alignItems: 'center', margin: '0.35rem 0' },
  muted: { color: C.muted },
  error: { color: C.red },
};

export function JournalPage({ accounts }: { accounts: AccountRow[] }) {
  const [entries, setEntries] = useState<EntryDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [narration, setNarration] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [lines, setLines] = useState<FormLine[]>([
    { accountId: '', side: 'debit', rupees: '' },
    { accountId: '', side: 'credit', rupees: '' },
  ]);
  const [busy, setBusy] = useState(false);

  const postable = accounts.filter((a) => a.isActive);
  const accountName = (id: string) => {
    const account = accounts.find((a) => a.id === id);
    return account ? `${account.code} ${account.name}` : id.slice(0, 8);
  };

  async function load() {
    try {
      const data = await api<{ entries: EntryDto[] }>('GET', '/api/v1/journal-entries');
      setEntries(data.entries);
    } catch (err) {
      setError(err instanceof RequestError ? err.error.message : 'Failed to load journal');
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function setLine(i: number, patch: Partial<FormLine>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = {
        date,
        narration,
        lines: lines.map((l) => ({
          accountId: l.accountId,
          debitPaise: l.side === 'debit' ? toPaise(l.rupees || '0') : 0,
          creditPaise: l.side === 'credit' ? toPaise(l.rupees || '0') : 0,
        })),
      };
      await api('POST', '/api/v1/journal-entries', body);
      setNarration('');
      setLines([
        { accountId: '', side: 'debit', rupees: '' },
        { accountId: '', side: 'credit', rupees: '' },
      ]);
      await load();
    } catch (err) {
      setError(err instanceof RequestError ? err.error.message : 'Post failed');
    } finally {
      setBusy(false);
    }
  }

  async function reverse(id: string) {
    setError(null);
    try {
      await api('POST', `/api/v1/journal-entries/${id}/reverse`, { reason: 'reversed from UI' });
      await load();
    } catch (err) {
      setError(err instanceof RequestError ? err.error.message : 'Reverse failed');
    }
  }

  return (
    <div>
      <h3 style={{ marginBottom: 4 }}>Manual journal voucher</h3>
      <form onSubmit={submit}>
        <div style={S.row}>
          <input
            style={S.input}
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
          <input
            style={{ ...S.input, flex: 1 }}
            placeholder="Narration"
            value={narration}
            onChange={(e) => setNarration(e.target.value)}
            required
          />
        </div>
        {lines.map((line, i) => (
          <div style={S.row} key={i}>
            <select
              style={{ ...S.input, flex: 1 }}
              value={line.accountId}
              onChange={(e) => setLine(i, { accountId: e.target.value })}
              required
            >
              <option value="">— account —</option>
              {postable.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} · {a.name}
                </option>
              ))}
            </select>
            <select
              style={S.input}
              value={line.side}
              onChange={(e) => setLine(i, { side: e.target.value as FormLine['side'] })}
            >
              <option value="debit">Dr</option>
              <option value="credit">Cr</option>
            </select>
            <input
              style={{ ...S.input, width: 110 }}
              placeholder="₹0.00"
              value={line.rupees}
              onChange={(e) => setLine(i, { rupees: e.target.value })}
              required
            />
            {lines.length > 2 && (
              <button
                type="button"
                style={{ ...S.button, background: C.red, color: '#fff' }}
                onClick={() => setLines((prev) => prev.filter((_, idx) => idx !== i))}
              >
                ×
              </button>
            )}
          </div>
        ))}
        <div style={S.row}>
          <button
            type="button"
            style={{
              ...S.button,
              background: C.panel2,
              color: C.text,
              border: `1px solid ${C.border}`,
            }}
            onClick={() =>
              setLines((prev) => [...prev, { accountId: '', side: 'debit', rupees: '' }])
            }
          >
            + line
          </button>
          <button style={S.button} disabled={busy} type="submit">
            {busy ? 'Posting…' : 'Post entry'}
          </button>
        </div>
      </form>
      {error && <p style={S.error}>{error}</p>}

      <h3 style={{ marginTop: '1.5rem' }}>Day book</h3>
      {entries.length === 0 && <p style={S.muted}>No entries yet.</p>}
      {entries.map((entry) => (
        <div
          key={entry.id}
          style={{
            borderTop: `1px solid ${C.border}`,
            padding: '0.5rem 0',
            opacity: entry.status === 'reversed' ? 0.55 : 1,
          }}
        >
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <span className="fp-mono" style={{ color: C.muted }}>
              {entry.entryNumber}
            </span>
            <span>{entry.narration}</span>
            <span style={S.muted}>{new Date(entry.date).toLocaleDateString('en-IN')}</span>
            <span className="fp-mono" style={{ marginLeft: 'auto' }}>
              {formatINR(entry.totalDebitPaise)}
            </span>
            {entry.status === 'posted' && !entry.reversedByEntryId ? (
              <button
                style={{ ...S.button, background: C.red, color: '#fff' }}
                onClick={() => void reverse(entry.id)}
              >
                reverse
              </button>
            ) : (
              <span style={{ fontSize: '0.75rem', color: C.red }}>{entry.status}</span>
            )}
          </div>
          <div style={{ fontSize: '0.8rem', color: C.muted, paddingLeft: 8 }}>
            {entry.lines.map((l) => (
              <div key={l.lineNo}>
                {l.debitPaise > 0
                  ? `Dr ${accountName(l.accountId)} ${formatINR(l.debitPaise)}`
                  : `Cr ${accountName(l.accountId)} ${formatINR(l.creditPaise)}`}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
