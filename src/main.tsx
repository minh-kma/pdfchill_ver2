import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Side-effect import: initialises i18next (and therefore detects the language) before first render.
import './shared/i18n/index.ts';
import './index.css';
import { App } from './App.tsx';

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
