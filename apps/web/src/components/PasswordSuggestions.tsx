import { useState } from 'react';
import { generatePasswordSuggestions } from '../utils/passwordUtils';

interface PasswordSuggestionsProps {
  onSelect: (password: string) => void;
}

export function PasswordSuggestions({ onSelect }: PasswordSuggestionsProps) {
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  function handleOpen() {
    if (!open) {
      setSuggestions(generatePasswordSuggestions(3));
    }
    setOpen((prev) => !prev);
  }

  function handleRefresh() {
    setSuggestions(generatePasswordSuggestions(3));
    setCopiedIdx(null);
  }

  function handlePick(password: string, idx: number) {
    onSelect(password);
    setCopiedIdx(idx);
    setTimeout(() => {
      setCopiedIdx(null);
      setOpen(false);
    }, 400);
  }

  return (
    <div style={{ position: 'relative', marginTop: '4px' }}>
      <button
        type="button"
        onClick={handleOpen}
        style={{
          background: 'none',
          border: 'none',
          color: 'var(--accent)',
          fontSize: '0.78rem',
          fontWeight: 700,
          cursor: 'pointer',
          padding: 0,
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          textDecoration: 'underline',
          textUnderlineOffset: '2px',
        }}
      >
        <span>✨</span> Suggest strong password
      </button>

      {open && (
        <div
          className="fp-card"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            right: 0,
            zIndex: 50,
            padding: '12px',
            background: 'var(--panel)',
            border: '1px solid var(--border)',
            boxShadow: 'var(--shadow-lift)',
            borderRadius: '12px',
            animation: 'fp-fade-up 0.2s ease',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '8px',
              fontSize: '0.78rem',
              fontWeight: 700,
              color: 'var(--text)',
            }}
          >
            <span>Strong Password Suggestions</span>
            <button
              type="button"
              onClick={handleRefresh}
              title="Generate new suggestions"
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: '0.82rem',
                color: 'var(--muted)',
                padding: '2px 4px',
              }}
            >
              🔄 Refresh
            </button>
          </div>

          <div style={{ display: 'grid', gap: '6px' }}>
            {suggestions.map((pwd, idx) => (
              <div
                key={idx}
                onClick={() => handlePick(pwd, idx)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '6px 10px',
                  borderRadius: '8px',
                  border: '1px solid var(--border)',
                  background: 'var(--panel-2)',
                  cursor: 'pointer',
                  fontFamily: 'monospace',
                  fontSize: '0.82rem',
                  color: copiedIdx === idx ? 'var(--green)' : 'var(--text)',
                  transition: 'border-color 0.15s ease, background 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--accent)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border)';
                }}
              >
                <span style={{ letterSpacing: '0.5px', wordBreak: 'break-all' }}>{pwd}</span>
                <span
                  style={{
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    color: copiedIdx === idx ? 'var(--green)' : 'var(--accent)',
                    marginLeft: '8px',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {copiedIdx === idx ? '✓ Used' : 'Use'}
                </span>
              </div>
            ))}
          </div>

          <div
            style={{
              marginTop: '8px',
              fontSize: '0.7rem',
              color: 'var(--muted)',
              textAlign: 'center',
            }}
          >
            Clicking a password auto-fills both Password fields.
          </div>
        </div>
      )}
    </div>
  );
}
