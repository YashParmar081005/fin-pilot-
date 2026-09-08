/**
 * The last line of defence: a render-time crash.
 *
 * A toast cannot help here, because the tree that would have shown it is the
 * tree that just died. So this replaces the screen with the same information
 * a toast would have carried — the exact message, copyable — plus a way out.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { describeError, errorToClipboardText } from './errors';

interface Props {
  children: ReactNode;
}
interface State {
  error: unknown;
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    // Keep the component stack in the console; the UI shows the readable part.
    console.error('FinPilot crashed while rendering', error, info.componentStack);
  }

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    const described = describeError(error, 'The page failed to render');

    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1.5rem',
          background: 'var(--bg)',
          color: 'var(--text)',
        }}
      >
        <div
          className="fp-card"
          style={{
            maxWidth: 560,
            width: '100%',
            padding: '1.5rem',
            borderRadius: 16,
            background: 'var(--panel)',
            border: '1px solid color-mix(in srgb, var(--red) 34%, var(--border))',
          }}
        >
          <h1 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--red)' }}>{described.title}</h1>
          <p
            style={{
              margin: '0.6rem 0 0',
              fontSize: '0.88rem',
              lineHeight: 1.5,
              whiteSpace: 'pre-wrap',
              overflowWrap: 'anywhere',
            }}
          >
            {described.message}
          </p>
          {described.details && (
            <pre
              style={{
                marginTop: '0.8rem',
                padding: '0.6rem 0.7rem',
                maxHeight: 220,
                overflow: 'auto',
                fontSize: '0.72rem',
                color: 'var(--muted)',
                background: 'var(--panel-2)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                whiteSpace: 'pre-wrap',
              }}
            >
              {described.details}
            </pre>
          )}
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.1rem', flexWrap: 'wrap' }}>
            <button
              className="fp-btn fp-btn-primary"
              style={{ padding: '0.5rem 0.9rem', borderRadius: 10, cursor: 'pointer' }}
              onClick={() => this.setState({ error: null })}
            >
              Try again
            </button>
            <button
              className="fp-btn"
              style={{
                padding: '0.5rem 0.9rem',
                borderRadius: 10,
                cursor: 'pointer',
                background: 'var(--panel-2)',
                color: 'var(--text)',
                border: '1px solid var(--border)',
              }}
              onClick={() => window.location.reload()}
            >
              Reload the app
            </button>
            <button
              className="fp-btn"
              style={{
                padding: '0.5rem 0.9rem',
                borderRadius: 10,
                cursor: 'pointer',
                background: 'transparent',
                color: 'var(--muted)',
                border: '1px solid var(--border)',
              }}
              onClick={() => void navigator.clipboard?.writeText(errorToClipboardText(described))}
            >
              Copy error
            </button>
          </div>
        </div>
      </div>
    );
  }
}
