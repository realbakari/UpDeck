import React from 'react';
import { createRoot } from 'react-dom/client';
import '@cloudflare/kumo/styles/standalone';
import '@fontsource/dm-sans/400.css';
import '@fontsource/dm-sans/500.css';
import '@fontsource/dm-sans/600.css';
import '@fontsource-variable/fraunces';
import './styles.css';
import App from './App';
import { applyTheme, readTheme } from './theme';

applyTheme(readTheme());

const root = document.getElementById('root');
if (!root) throw new Error('Missing app root');
createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
