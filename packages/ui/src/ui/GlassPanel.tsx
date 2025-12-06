import { Box, type BoxProps } from '@mui/material';
import React from 'react';

export interface GlassPanelProps extends BoxProps {
  hover?: boolean;
  padding?: number | string;
  radius?: number;
}

/**
 * GlassPanel: reusable translucent panel wrapper with blur, border and shadow.
 * Usage:
 * <GlassPanel sx={{ mb: 2 }}>...</GlassPanel>
 */
const GlassPanel: React.FC<GlassPanelProps> = ({
  children,
  hover = true,
  padding = 2.5,
  radius = 2,
  sx,
  ...rest
}) => {
  return (
    <Box
      sx={[
        (theme) => ({
          background: (theme.palette as any)?.custom?.glassBg ?? theme.palette.background.paper,
          backdropFilter: 'blur(18px) saturate(140%)',
          WebkitBackdropFilter: 'blur(18px) saturate(140%)',
          border: `1px solid ${((theme.palette as any)?.custom?.glassBorder) ?? theme.palette.divider}`,
          borderRadius: radius,
          boxShadow: ((theme.palette as any)?.custom?.glassShadow) ?? '0 24px 60px rgba(0,0,0,0.25)',
          transition: 'background 150ms ease, border-color 150ms ease, box-shadow 150ms ease',
          p: padding,
          ...(hover && {
            '&:hover': {
              background: (theme.palette as any)?.custom?.glassBgHover ?? theme.palette.background.paper,
            },
          }),
        }),
        sx as any,
      ]}
      {...rest}
    >
      {children}
    </Box>
  );
};

export default GlassPanel;
