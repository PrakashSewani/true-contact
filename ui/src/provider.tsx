import { ThemeProvider } from '@mui/material/styles';
import type { ReactNode } from 'react';
import { trueContactTheme } from './theme';

/**
 * Wraps a React tree — an app root or a server-rendered Astro island — in the shared theme.
 * The app adds MUI's CssBaseline on top; the promo site keeps its own page styles.
 */
export function TrueContactThemeProvider({ children }: { children: ReactNode }) {
  return <ThemeProvider theme={trueContactTheme}>{children}</ThemeProvider>;
}
