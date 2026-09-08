import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { initTheme } from './lib/ui';
import { ErrorBoundary } from './lib/ErrorBoundary';
import { ToastProvider } from './lib/toast';
import { App } from './App';

initTheme(); // resolve light/dark before first paint — no flash

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* ToastProvider sits OUTSIDE the boundary so a crash screen can still
        be replaced by a recovered tree that has working toasts. */}
    <ToastProvider>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </ToastProvider>
  </StrictMode>,
);
