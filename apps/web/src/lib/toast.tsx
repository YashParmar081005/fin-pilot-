/**
 * Toasts — the app's one loud channel for "something just happened".
 *
 * Three things feed it and none of them need a page to opt in:
 *   1. every failed API call, via `onApiError` in lib/api
 *   2. anything thrown and never caught (window error / unhandledrejection)
 *   3. explicit `useToast()` calls for client-side problems and successes
 *
 * Identical messages collapse into one toast with a ×N counter rather than
 * stacking — a dashboard firing six parallel GETs at a dead server should
 * say "cannot reach the server ×6" once, not bury the screen.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { onApiError } from './api';
import { describeError, errorToClipboardText, type ToastKind } from './errors';

export interface ToastOptions {
  kind?: ToastKind;
  title: string;
  message?: string;
  code?: string;
  details?: string;
  /** ms on screen. 0 keeps it until dismissed. */
  duration?: number;
}

interface ToastRecord extends ToastOptions {
  id: string;
  kind: ToastKind;
  duration: number;
  /** Dedup identity — same key means the same problem said again. */
  key: string;
  count: number;
  /** Changes on every repeat, which restarts the dismiss timer. */
  nonce: number;
  leaving?: boolean;
}

export interface ToastApi {
  push(options: ToastOptions): void;
  /** Describe and show anything throwable. */
  error(err: unknown, fallbackTitle?: string): void;
  success(title: string, message?: string): void;
  warning(title: string, message?: string): void;
  info(title: string, message?: string): void;
  dismiss(id: string): void;
  clear(): void;
}

/** Errors stay put long enough to read and copy; good news gets out of the way. */
const DEFAULT_DURATION: Record<ToastKind, number> = {
  error: 9000,
  warning: 8000,
  success: 3500,
  info: 5000,
};

const MAX_VISIBLE = 5;
const EXIT_MS = 200;

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error('useToast must be used inside <ToastProvider>');
  return api;
}

/** For shared components that must still render if no provider is mounted. */
export function useOptionalToast(): ToastApi | null {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const seq = useRef(0);
  const exitTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const remove = useCallback((id: string) => {
    setToasts((list) => list.filter((t) => t.id !== id));
    const timer = exitTimers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      exitTimers.current.delete(id);
    }
  }, []);

  const dismiss = useCallback(
    (id: string) => {
      // Mark it leaving so the exit animation can play, then drop it.
      setToasts((list) => list.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
      if (!exitTimers.current.has(id)) {
        exitTimers.current.set(
          id,
          setTimeout(() => remove(id), EXIT_MS),
        );
      }
    },
    [remove],
  );

  const push = useCallback((options: ToastOptions) => {
    const kind = options.kind ?? 'info';
    const key = [kind, options.title, options.message ?? '', options.code ?? ''].join('|');

    setToasts((list) => {
      const existing = list.find((t) => t.key === key && !t.leaving);
      if (existing) {
        return list.map((t) =>
          t.id === existing.id ? { ...t, count: t.count + 1, nonce: t.nonce + 1 } : t,
        );
      }
      const record: ToastRecord = {
        ...options,
        kind,
        id: `t${++seq.current}`,
        duration: options.duration ?? DEFAULT_DURATION[kind],
        key,
        count: 1,
        nonce: 0,
      };
      // Oldest falls off the top once the stack is full.
      return [...list, record].slice(-MAX_VISIBLE);
    });
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      push,
      error(err, fallbackTitle) {
        const described = describeError(err, fallbackTitle);
        push({
          kind: described.kind,
          title: described.title,
          message: described.message,
          code: described.code,
          details: described.details,
        });
      },
      success: (title, message) => push({ kind: 'success', title, message }),
      warning: (title, message) => push({ kind: 'warning', title, message }),
      info: (title, message) => push({ kind: 'info', title, message }),
      dismiss,
      clear: () => setToasts([]),
    }),
    [push, dismiss],
  );

  // 1. every failed API call, wherever in the app it was made
  useEffect(() => onApiError((err) => api.error(err)), [api]);

  // 2. anything that escaped a catch
  useEffect(() => {
    const onRejection = (event: PromiseRejectionEvent) => api.error(event.reason);
    const onError = (event: ErrorEvent) => api.error(event.error ?? event.message);
    window.addEventListener('unhandledrejection', onRejection);
    window.addEventListener('error', onError);
    return () => {
      window.removeEventListener('unhandledrejection', onRejection);
      window.removeEventListener('error', onError);
    };
  }, [api]);

  useEffect(() => {
    const timers = exitTimers.current;
    return () => {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

// ── presentation ────────────────────────────────────────────────────────────

const ACCENT: Record<ToastKind, string> = {
  error: 'var(--red)',
  warning: 'var(--amber)',
  success: 'var(--green)',
  info: 'var(--accent)',
};

function Glyph({ kind }: { kind: ToastKind }) {
  const common = {
    width: 20,
    height: 20,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2.2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
  if (kind === 'success')
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="9" />
        <path d="M8.5 12.5l2.5 2.5 4.5-5" />
      </svg>
    );
  if (kind === 'warning')
    return (
      <svg {...common}>
        <path d="M10.3 3.9L2.5 17.4A2 2 0 0 0 4.2 20.4h15.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
        <path d="M12 9.5v4" />
        <path d="M12 17h.01" />
      </svg>
    );
  if (kind === 'info')
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v5" />
        <path d="M12 8h.01" />
      </svg>
    );
  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="9" />
      <path d="M15 9l-6 6" />
      <path d="M9 9l6 6" />
    </svg>
  );
}

function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: ToastRecord[];
  onDismiss: (id: string) => void;
}) {
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="fp-toast-viewport" aria-live="polite" aria-relevant="additions text">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>,
    document.body,
  );
}

function ToastItem({ toast, onDismiss }: { toast: ToastRecord; onDismiss: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [paused, setPaused] = useState(false);

  const { id, duration, nonce, leaving } = toast;

  // Hovering (or focusing) freezes the countdown: an error you are still
  // reading must not slide away mid-sentence.
  useEffect(() => {
    if (duration <= 0 || paused || leaving) return;
    const timer = setTimeout(() => onDismiss(id), duration);
    return () => clearTimeout(timer);
  }, [id, duration, nonce, paused, leaving, onDismiss]);

  const accent = ACCENT[toast.kind];

  async function copy() {
    const text = errorToClipboardText({
      kind: toast.kind,
      title: toast.title,
      message: toast.message ?? '',
      code: toast.code,
      details: toast.details,
    });
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked — the text is on screen anyway */
    }
  }

  const isProblem = toast.kind === 'error' || toast.kind === 'warning';

  return (
    <div
      className={`fp-toast${leaving ? ' leaving' : ''}`}
      role={isProblem ? 'alert' : 'status'}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      style={{ ['--fp-toast-accent' as string]: accent }}
    >
      <span className="fp-toast-bar" />
      <span className="fp-toast-glyph" style={{ color: accent }}>
        <Glyph kind={toast.kind} />
      </span>

      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="fp-toast-head">
          <strong className="fp-toast-title">{toast.title}</strong>
          {toast.count > 1 && <span className="fp-toast-count">×{toast.count}</span>}
          {toast.code && <code className="fp-toast-code">{toast.code}</code>}
        </div>

        {toast.message && <p className="fp-toast-msg">{toast.message}</p>}

        {toast.details && (
          <>
            <button type="button" className="fp-toast-link" onClick={() => setOpen((v) => !v)}>
              {open ? 'Hide details' : 'Show details'}
            </button>
            {open && <pre className="fp-toast-details">{toast.details}</pre>}
          </>
        )}

        {isProblem && (
          <button type="button" className="fp-toast-link" onClick={() => void copy()}>
            {copied ? 'Copied ✓' : 'Copy error'}
          </button>
        )}
      </div>

      <button
        type="button"
        className="fp-toast-close"
        aria-label="Dismiss notification"
        onClick={() => onDismiss(toast.id)}
      >
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          aria-hidden
        >
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>

      {duration > 0 && !leaving && (
        <span
          key={nonce}
          className="fp-toast-progress"
          style={{
            animationDuration: `${duration}ms`,
            animationPlayState: paused ? 'paused' : 'running',
          }}
        />
      )}
    </div>
  );
}
