import { Theme as MuiTheme } from '@mui/material/styles';

declare module '@mui/material/styles' {
  interface TypeBackground {
    default: string;
    paper: string;
    darker?: string;
    lighter?: string;
  }

  interface Palette {
    custom: {
      borderColor: string;
      scrollbarTrack: string;
      scrollbarThumb: string;
      scrollbarThumbHover: string;
      inputBackground: string;
      overlay: string;
      glassBg: string;
      glassBgHover: string;
      glassBorder: string;
      glassShadow: string;
      accent: string;
      accentGradient: string;
    };
  }

  interface PaletteOptions {
    custom?: {
      borderColor?: string;
      scrollbarTrack?: string;
      scrollbarThumb?: string;
      scrollbarThumbHover?: string;
      inputBackground?: string;
      overlay?: string;
      glassBg?: string;
      glassBgHover?: string;
      glassBorder?: string;
      glassShadow?: string;
      accent?: string;
      accentGradient?: string;
    };
  }

  interface Theme extends MuiTheme {
    palette: Palette;
  }
}
