import { createTheme } from '@mui/material/styles';

export const lightTheme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#1c7ed6',       // Productive blue for CTAs
      light: '#4dabf7',
      dark: '#1864ab',
      contrastText: '#ffffff',
    },
    secondary: {
      main: '#868e96',       // Neutral grey for secondary buttons
      light: '#adb5bd',
      dark: '#495057',
      contrastText: '#ffffff',
    },
    background: {
      default: '#f8f9fa',    // App background
      paper: '#ffffff',      // Cards & panels
      darker: '#e9ecef',     // Sections / sidebars
      lighter: '#f1f3f5',    // Hover states
    },
    text: {
      primary: '#212529',    // Main text (dark grey, not pure black)
      secondary: '#495057',  // Subtext / muted info
      disabled: '#adb5bd',   // Disabled text
    },
    divider: 'rgba(0, 0, 0, 0.08)',
    action: {
      active: '#1c7ed6',
      hover: 'rgba(28, 126, 214, 0.08)',
      selected: 'rgba(28, 126, 214, 0.16)',
      disabled: 'rgba(173, 181, 189, 0.3)',
      disabledBackground: 'rgba(173, 181, 189, 0.12)',
    },
    error: {
      main: '#e03131',       // Overdue tasks
      light: '#fa5252',
      dark: '#c92a2a',
      contrastText: '#ffffff',
    },
    warning: {
      main: '#f59f00',       // Pending review tasks
      light: '#fab005',
      dark: '#e67700',
      contrastText: '#000000',
    },
    info: {
      main: '#1c7ed6',       // In progress tasks
      light: '#4dabf7',
      dark: '#1864ab',
      contrastText: '#ffffff',
    },
    success: {
      main: '#2f9e44',       // Completed tasks
      light: '#51cf66',
      dark: '#2b8a3e',
      contrastText: '#ffffff',
    },
    custom: {
      borderColor: 'rgba(0, 0, 0, 0.08)',
      scrollbarTrack: 'transparent',
      scrollbarThumb: 'rgba(28, 126, 214, 0.2)',
      scrollbarThumbHover: 'rgba(28, 126, 214, 0.3)',
      inputBackground: '#ffffff',
      overlay: 'rgba(0, 0, 0, 0.05)',
      glassBg: 'rgba(255, 255, 255, 0.55)',
      glassBgHover: 'rgba(255, 255, 255, 0.65)',
      glassBorder: 'rgba(0, 0, 0, 0.08)',
      glassShadow: '0 6px 16px rgba(0, 0, 0, 0.12)',
      accent: '#7b5cff',
      accentGradient: 'linear-gradient(135deg, #7b5cff 0%, #4dabf7 100%)',
    },
  },
});

export default lightTheme;
