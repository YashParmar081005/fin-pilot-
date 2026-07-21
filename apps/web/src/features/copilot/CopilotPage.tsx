/**
 * AI Copilot (§32 Phase 19/20). Streams the turn over SSE with tool-call
 * chips (I9: every figure comes from a tool result — grounding-validated
 * server-side). Write tools land in the proposal inbox below: the human sees
 * the payload and clicks Confirm — the server recomputes everything (I10/I5).
 */
import { useRef, useState } from 'react';
import { api, sse } from '../../lib/api';
import { Badge, Btn, C, Card, Err, Row, S, Tbl, dateStr, useLoad } from '../../lib/ui';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  tools: string[];
  fallback?: boolean;
}
interface Proposal {
  id: string;
  type: string;
  status: string;
  payload: unknown;
  preview?: unknown;
  expiresAt: string;
  createdAt: string;
}

export function CopilotPage() {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const usage = useLoad(() => api<{ tokensUsed: number }>('GET', '/api/v1/ai/usage'));
  const proposals = useLoad(() => api<{ proposals: Proposal[] }>('GET', '/api/v1/ai/proposals'));
  const scrollRef = useRef<HTMLDivElement>(null);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const message = input.trim();
    if (!message || busy) return;
    setBusy(true);
    setError(null);
    setInput('');
    setMessages((m) => [
      ...m,
      { role: 'user', content: message, tools: [] },
      { role: 'assistant', content: '', tools: [] },
    ]);
    try {
      let id = conversationId;
      if (!id) {
        id = (await api<{ id: string }>('POST', '/api/v1/ai/conversations', {})).id;
        setConversationId(id);
      }
      await sse(`/api/v1/ai/conversations/${id}/messages`, { message }, (event) => {
        setMessages((m) => {
          const next = [...m];
          const last = { ...next[next.length - 1]! };
          if (event.type === 'tool_call')
            last.tools = [...last.tools, (event.data as { tool: string }).tool];
          if (event.type === 'content') last.content = (event.data as { content: string }).content;
          if (event.type === 'fallback') last.fallback = true;
          if (event.type === 'error') last.content = `⚠ ${JSON.stringify(event.data)}`;
          next[next.length - 1] = last;
          return next;
        });
        scrollRef.current?.scrollTo({ top: 999999 });
      });
      usage.reload();
      proposals.reload();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function act(id: string, action: 'confirm' | 'reject') {
    setError(null);
    try {
      await api('POST', `/api/v1/ai/proposals/${id}/${action}`, {});
      proposals.reload();
    } catch (err) {
      setError(err);
    }
  }

  const open = (proposals.data?.proposals ?? []).filter((p) => p.status === 'proposed');
  const past = (proposals.data?.proposals ?? []).filter((p) => p.status !== 'proposed');

  return (
    <div>
      <Card
        title="Copilot — ask about your books"
        actions={
          <span style={{ color: C.muted, fontSize: '0.8rem' }}>
            {usage.data?.tokensUsed ?? 0} tokens this month
          </span>
        }
      >
        <div
          ref={scrollRef}
          style={{
            maxHeight: 380,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            marginBottom: 12,
          }}
        >
          {messages.length === 0 && (
            <p style={{ color: C.muted, fontSize: '0.85rem' }}>
              Try: "what was my revenue this month", "who owes me money", "draft an invoice for Acme
              Retail for ₹5,000 consulting at 18% GST". Every number is retrieved by a tool — the
              model never computes one (I9) — and no write happens without your Confirm (I10).
            </p>
          )}
          {messages.map((msg, i) => (
            <div
              key={i}
              style={{
                alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                background: msg.role === 'user' ? C.accent : C.panel2,
                color: msg.role === 'user' ? C.accentText : C.text,
                borderRadius: 10,
                padding: '0.55rem 0.8rem',
                maxWidth: '85%',
                fontSize: '0.9rem',
                whiteSpace: 'pre-wrap',
              }}
            >
              {msg.tools.length > 0 && (
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
                  {msg.tools.map((tool, j) => (
                    <span
                      key={j}
                      style={{
                        fontSize: '0.68rem',
                        border: `1px solid ${C.border}`,
                        borderRadius: 999,
                        padding: '0.05rem 0.5rem',
                        color: C.muted,
                      }}
                    >
                      🔧 {tool}
                    </span>
                  ))}
                </div>
              )}
              {msg.content ||
                (msg.role === 'assistant' && busy && i === messages.length - 1 ? '…' : msg.content)}
              {msg.fallback && (
                <div style={{ color: C.amber, fontSize: '0.7rem', marginTop: 4 }}>
                  grounding failed twice — showing verified raw data instead
                </div>
              )}
            </div>
          ))}
        </div>
        <form onSubmit={send}>
          <Row>
            <input
              style={{ ...S.input, flex: 1, minWidth: 300, margin: 0 }}
              placeholder="Ask about your books…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={busy}
            />
            <Btn disabled={busy}>{busy ? 'Thinking…' : 'Send'}</Btn>
          </Row>
        </form>
        <Err error={error} />
      </Card>

      <Card title={`Proposal inbox — the AI proposes, you confirm (I10) · ${open.length} open`}>
        <Err error={proposals.error} />
        {open.map((p) => (
          <div
            key={p.id}
            style={{
              border: `1px solid ${C.amber}`,
              borderRadius: 10,
              padding: '0.8rem 1rem',
              marginBottom: 10,
            }}
          >
            <Row>
              <Badge value={p.type} />
              <span style={{ color: C.muted, fontSize: '0.78rem' }}>
                expires {dateStr(p.expiresAt)}
              </span>
              <Btn small kind="success" onClick={() => void act(p.id, 'confirm')}>
                Confirm — execute for real
              </Btn>
              <Btn small kind="danger" onClick={() => void act(p.id, 'reject')}>
                Reject
              </Btn>
            </Row>
            <pre
              style={{
                background: C.bg,
                borderRadius: 8,
                padding: '0.6rem',
                fontSize: '0.72rem',
                overflow: 'auto',
                marginBottom: 0,
              }}
            >
              {JSON.stringify(p.payload, null, 2)}
            </pre>
          </div>
        ))}
        {open.length === 0 && (
          <p style={{ color: C.muted, fontSize: '0.85rem' }}>No open proposals.</p>
        )}
        {past.length > 0 && (
          <Tbl
            head={['Type', 'Status', 'Created']}
            rows={past.map((p) => [
              <Badge key="t" value={p.type} />,
              <Badge key="s" value={p.status} />,
              dateStr(p.createdAt),
            ])}
          />
        )}
      </Card>
    </div>
  );
}
