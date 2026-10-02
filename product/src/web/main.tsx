import { CssBaseline } from '@mui/material';
import { TrueContactThemeProvider } from '@truecontact/ui';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

const container = document.getElementById('root');

if (!container) {
  throw new Error('Root container not found');
}

createRoot(container).render(
  <StrictMode>
    <TrueContactThemeProvider>
      <CssBaseline />
      <App />
    </TrueContactThemeProvider>
  </StrictMode>,
);
