import { createTheme } from '@mui/material/styles';

export const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#4dabf7',       // Calm blue for main CTAs
      light: '#74c0fc',
      dark: '#1c7ed6',
      contrastText: '#ffffff',
    },
    secondary: {
      main: '#adb5bd',       // Neutral grey for secondary buttons
      light: '#ced4da',
      dark: '#6c757d',
      contrastText: '#ffffff',
    },
    background: {
      default: '#121417',    // Slightly lighter than pure black
      paper: '#1e2125',      // Panels & cards
      darker: '#0d0f11',     // Sidebars or deep sections
      lighter: '#2a2d32',    // Hover states
    },
    text: {
      primary: '#f1f3f5',    // Main text (high contrast)
      secondary: '#adb5bd',  // Subtext / descriptions
      disabled: '#5c636a',   // Disabled text
    },
    divider: 'rgba(173, 181, 189, 0.12)',
    action: {
      active: '#4dabf7',
      hover: 'rgba(77, 171, 247, 0.08)',
      selected: 'rgba(77, 171, 247, 0.16)',
      disabled: 'rgba(173, 181, 189, 0.3)',
      disabledBackground: 'rgba(173, 181, 189, 0.12)',
    },
    error: {
      main: '#ff6b6b',       // Overdue tasks
      light: '#ff8787',
      dark: '#c92a2a',
      contrastText: '#ffffff',
    },
    warning: {
      main: '#fcc419',       // Pending review tasks
      light: '#ffe066',
      dark: '#e67700',
      contrastText: '#000000',
    },
    info: {
      main: '#339af0',       // In progress tasks
      light: '#74c0fc',
      dark: '#1971c2',
      contrastText: '#ffffff',
    },
    success: {
      main: '#51cf66',       // Completed tasks
      light: '#69db7c',
      dark: '#2f9e44',
      contrastText: '#000000',
    },
    custom: {
      borderColor: 'rgba(173, 181, 189, 0.15)',
      scrollbarTrack: 'transparent',
      scrollbarThumb: 'rgba(77, 171, 247, 0.2)',
      scrollbarThumbHover: 'rgba(77, 171, 247, 0.3)',
      inputBackground: '#2a2d32',
      overlay: 'rgba(18, 20, 23, 0.5)',
      // Glassmorphism tokens
      glassBg: 'rgba(30, 33, 37, 0.55)',
      glassBgHover: 'rgba(30, 33, 37, 0.65)',
      glassBorder: 'rgba(255, 255, 255, 0.08)',
      glassShadow: '0 24px 60px rgba(0, 0, 0, 0.5)',
      // Accents
      accent: '#a78bfa',
      accentGradient: 'linear-gradient(135deg, #a78bfa 0%, #74c0fc 100%)',
    },
  },
});

export default darkTheme;
