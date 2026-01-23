import { useState, useEffect } from 'react';
import { Box, Typography, IconButton, useTheme, alpha } from '@mui/material';
import { motion, AnimatePresence } from 'framer-motion';
import CloseIcon from '@mui/icons-material/Close';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import WarningIcon from '@mui/icons-material/Warning';
import InfoIcon from '@mui/icons-material/Info';

type NotificationType = 'success' | 'error' | 'warning' | 'info';

export interface NotificationItemProps {
  id: string;
  message: string;
  type: NotificationType;
  count?: number;
  onDismiss: (id: string) => void;
  autoHideDuration?: number;
}

const getNotificationIcon = (type: NotificationType, theme: any) => {
  const iconProps = {
    fontSize: 'small' as const,
    sx: {
      mr: 1.5,
      color: theme.palette[type].main || theme.palette.primary.main,
      backgroundColor: alpha(theme.palette[type].main || theme.palette.primary.main, 0.1),
      borderRadius: '50%',
      p: 0.5,
      width: 28,
      height: 28,
    },
  };

  switch (type) {
    case 'success':
      return <CheckCircleIcon {...iconProps} />;
    case 'error':
      return <ErrorIcon {...iconProps} />;
    case 'warning':
      return <WarningIcon {...iconProps} />;
    case 'info':
    default:
      return <InfoIcon {...iconProps} />;
  }
};

const NotificationItem = ({
  id,
  message,
  type,
  count = 1,
  onDismiss,
  autoHideDuration = 5000,
}: NotificationItemProps) => {
  const theme = useTheme();
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      handleClose();
    }, autoHideDuration);

    return () => clearTimeout(timer);
  }, [autoHideDuration]);

  const handleClose = () => {
    setIsVisible(false);
    setTimeout(() => onDismiss(id), 300); // Wait for animation to complete
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          layout
          initial={{ opacity: 0, y: 16, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, x: 80 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
          style={{
            width: '360px',
            maxWidth: '90vw',
            marginBottom: '8px',
            borderRadius: '12px',
            background: alpha(theme.palette.background.paper, 0.95),
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            boxShadow: '0 4px 20px -5px rgba(0, 0, 0, 0.1)',
            border: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
            overflow: 'hidden',
            position: 'relative',
            zIndex: 1400,
            // Ensure clicks (close button) are received even if container uses pointerEvents: 'none'
            pointerEvents: 'auto',
            willChange: 'transform, opacity',
          }}
        >
          <Box
            sx={{
              display: 'flex',
              alignItems: 'flex-start',
              p: 2,
              position: 'relative',
            }}
          >
            {count > 1 && (
              <Box
                sx={{
                  position: 'absolute',
                  top: 2,
                  right: 2,
                  minWidth: 24,
                  height: 22,
                  borderRadius: 999,
                  px: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  bgcolor: alpha(theme.palette[type].main || theme.palette.primary.main, 0.15),
                }}
              >
                <Typography
                  variant="caption"
                  sx={{
                    fontWeight: 600,
                    color: theme.palette[type].main || theme.palette.primary.main,
                    lineHeight: 1,
                  }}
                >
                  x{count}
                </Typography>
              </Box>
            )}
            <Box sx={{ display: 'flex', alignItems: 'flex-start', flex: 1 }}>
              {getNotificationIcon(type, theme)}
              <Box sx={{ mt: 0.25 }}>
                <Typography
                  variant="body2"
                  sx={{
                    color: theme.palette.text.primary,
                    lineHeight: 1.5,
                    fontWeight: 500,
                  }}
                >
                  {message}
                </Typography>
              </Box>
            </Box>
            <IconButton
              size="small"
              onClick={handleClose}
              sx={{
                ml: 1,
                color: theme.palette.text.secondary,
                backgroundColor: 'transparent',
                borderRadius: '50%',
                p: 0.5,
                '&:hover': {
                  backgroundColor: alpha(theme.palette.text.secondary, 0.08),
                },
              }}
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>
          <Box
            sx={{
              height: '2px',
              backgroundColor: theme.palette.divider,
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <motion.div
              initial={{ width: '100%' }}
              animate={{ width: '0%' }}
              transition={{
                duration: autoHideDuration / 1000,
                ease: 'linear',
              }}
              style={{
                height: '100%',
                backgroundColor: theme.palette[type].main || theme.palette.primary.main,
              }}
            />
          </Box>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default NotificationItem;

export type { NotificationType };
