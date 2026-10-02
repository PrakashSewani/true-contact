import { Button, type ButtonProps } from '@mui/material';
import { TrueContactThemeProvider } from './provider';

/**
 * A button that carries the shared theme with it. Astro renders components as independent React
 * roots, so context from a parent element cannot flow in — this renders the provider and the
 * button inside one tree instead (D-022).
 */
export function ThemedButton(props: ButtonProps) {
  return (
    <TrueContactThemeProvider>
      <Button {...props} />
    </TrueContactThemeProvider>
  );
}
