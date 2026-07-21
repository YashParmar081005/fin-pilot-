import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { initTheme } from './lib/ui';
import { App } from './App';

initTheme(); // resolve light/dark before first paint — no flash

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
