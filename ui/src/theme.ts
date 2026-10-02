import { createTheme } from '@mui/material/styles';

/**
 * The TrueContact brand palette. Values mirror the tokens the app and the promo site already
 * use; this object is the single source both surfaces theme from (D-022).
 */
export const brandPalette = {
  green: '#2f6f4f',
  greenHover: '#275e43',
  greenDark: '#6fbf94',
  greenDarkHover: '#9bd3b5',
  onGreen: '#ffffff',
  onGreenDark: '#10241a',
  paper: '#f7f7f5',
  surface: '#ffffff',
  ink: '#1c1c1a',
  muted: '#6b6b66',
  line: '#dddcd7',
  paperDark: '#161614',
  surfaceDark: '#201f1d',
  inkDark: '#f0efe9',
  mutedDark: '#a3a29b',
  lineDark: '#383733',
  error: '#a4332f',
  errorDark: '#e08a86',
} as const;

export const trueContactTheme = createTheme({
  cssVariables: { colorSchemeSelector: 'media' },
  colorSchemes: {
    light: {
      palette: {
        primary: {
          main: brandPalette.green,
          dark: brandPalette.greenHover,
          contrastText: brandPalette.onGreen,
        },
        background: { default: brandPalette.paper, paper: brandPalette.surface },
        text: { primary: brandPalette.ink, secondary: brandPalette.muted },
        divider: brandPalette.line,
        error: { main: brandPalette.error },
      },
    },
    dark: {
      palette: {
        primary: {
          main: brandPalette.greenDark,
          dark: brandPalette.greenDarkHover,
          contrastText: brandPalette.onGreenDark,
        },
        background: { default: brandPalette.paperDark, paper: brandPalette.surfaceDark },
        text: { primary: brandPalette.inkDark, secondary: brandPalette.mutedDark },
        divider: brandPalette.lineDark,
        error: { main: brandPalette.errorDark },
      },
    },
  },
  shape: { borderRadius: 8 },
  typography: {
    fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
  },
  components: {
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 600,
        },
      },
    },
    MuiTextField: {
      defaultProps: { size: 'small' },
    },
  },
});
