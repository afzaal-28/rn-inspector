import { useState, useCallback, useMemo, useEffect } from 'react';
import { Box } from '@mui/material';
import NotificationItem, { type NotificationType } from './NotificationItem';

declare global {
  interface Window {
    showNotification?: (message: string, type?: NotificationType) => void;
  }
}

interface Notification {
  id: string;
  message: string;
  type: NotificationType;
  count: number;
}

interface NotificationContainerProps {
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
  autoHideDuration?: number;
}

const NotificationContainer = ({
  position = 'bottom-right',
  autoHideDuration = 6000,
}: NotificationContainerProps) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isHovered] = useState(false);

  // Process any queued notifications on mount
  useEffect(() => {
    // Process any notifications that were queued before the container mounted
    if (typeof window !== 'undefined') {
      const addNotification = (message: string, type: NotificationType = 'info') => {
        setNotifications(prev => {
          const existingIndex = prev.findIndex(
            n => n.message === message && n.type === type
          );

          if (existingIndex !== -1) {
            const existing = prev[existingIndex];
            const updated: Notification = {
              ...existing,
              count: (existing.count ?? 1) + 1,
            };
            const remaining = prev.filter((_, index) => index !== existingIndex);
            return [...remaining, updated];
          }

          const id = Math.random().toString(36).substr(2, 9);
          return [...prev, { id, message, type, count: 1 }];
        });
      };

      const processQueue = () => {
        const queue = window.__notificationQueue || [];
        if (queue.length > 0) {
          queue.forEach(({ message, type = 'info' }: { message: string; type?: NotificationType }) => {
            addNotification(message, type);
          });
          // Clear the queue
          window.__notificationQueue = [];
        }
      };

      // Process existing queue
      processQueue();

      // Expose showNotification method via window object
      window.showNotification = (message: string, type: NotificationType = 'info') => {
        addNotification(message, type);
      };

      // Cleanup
      return () => {
        window.showNotification = undefined;
      };
    }
  }, []);


  const MAX_NOTIFICATIONS = 15; // Maximum notifications to keep in memory

  const removeNotification = useCallback((id: string) => {
    setNotifications(prev => {
      const filtered = prev.filter(n => n.id !== id);
      // If we're above max, remove the oldest (first in array)
      return filtered.length > MAX_NOTIFICATIONS 
        ? filtered.slice(filtered.length - MAX_NOTIFICATIONS)
        : filtered;
    });
  }, []);

  // Cleanup if we exceed max notifications
  useEffect(() => {
    if (notifications.length > MAX_NOTIFICATIONS) {
      setNotifications(prev => prev.slice(-MAX_NOTIFICATIONS));
    }
  }, [notifications.length]);


  const positionStyles = useMemo(() => ({
    'top-right': { 
      top: 24, 
      right: 24, 
      alignItems: 'flex-end',
      '@media (max-width: 600px)': {
        top: 16,
        right: 16,
      }
    },
    'top-left': { 
      top: 24, 
      left: 24, 
      alignItems: 'flex-start',
      '@media (max-width: 600px)': {
        top: 16,
        left: 16,
      }
    },
    'bottom-right': { 
      bottom: 24, 
      right: 24, 
      alignItems: 'flex-end',
      '@media (max-width: 600px)': {
        bottom: 16,
        right: 16,
      }
    },
    'bottom-left': { 
      bottom: 24, 
      left: 24, 
      alignItems: 'flex-start',
      '@media (max-width: 600px)': {
        bottom: 16,
        left: 16,
      }
    },
  }[position]), [position]);

  const hasOverflow = notifications.length > 2;
  const latest = notifications[notifications.length - 1];
  const visibleNotifications = isHovered ? notifications : (latest ? [latest] : []);
  const collapsedStack = !isHovered && notifications.length > 1
    ? notifications.slice(-Math.min(3, notifications.length))
    : [];

  return (
    <Box
      sx={{
        position: 'fixed',
        zIndex: 1400,
        // Keep outer container non-interactive so page behind remains clickable
        pointerEvents: 'none',
        ...positionStyles,
      }}
    >
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          gap: 1.5,
          pointerEvents: 'none',
          '& > *': {
            pointerEvents: 'auto'
          }
        }}
      >
        {/* Collapsed view: stacked for 2+, single for 1 */}
        {!isHovered && (
          notifications.length > 1 ? (
            <Box sx={{ position: 'relative', display: 'flex', flexDirection: 'column' }}>
              {collapsedStack.map((notification, idx) => {
                const isTop = idx === collapsedStack.length - 1;
                // Older items first, newest last (on top)
                const depth = collapsedStack.length - 1 - idx; // 0 for top, 1 under, 2 bottom
                const translateY = depth * 8; // pixels down for lower layers
                const scale = 1 - depth * 0.06; // slightly smaller for lower layers
                const opacity = 1 - depth * 0.15; // faded for lower layers
                return (
                  <Box
                    key={`${notification.id}-${notification.count ?? 1}`}
                    sx={{
                      position: 'relative',
                      zIndex: 1400 - depth,
                      transform: `translateZ(0) translateY(${translateY}px) scale(${scale})`,
                      transformOrigin: 'bottom right',
                      mt: idx === 0 ? 0 : -3, // overlap
                      opacity,
                      pointerEvents: isTop ? 'auto' : 'none', // only top interactive
                      transition: 'transform 220ms ease, opacity 220ms ease',
                      willChange: 'transform, opacity',
                    }}
                  >
                    <NotificationItem
                      id={notification.id}
                      message={notification.message}
                      type={notification.type}
                      count={notification.count}
                      onDismiss={removeNotification}
                      autoHideDuration={autoHideDuration}
                    />
                  </Box>
                );
              })}
              {hasOverflow && (
                <Box sx={{
                  alignSelf: 'flex-end',
                  mt: 0.5,
                  bgcolor: 'background.paper',
                  border: theme => `1px solid ${theme.palette.divider}`,
                  borderRadius: 10,
                  px: 1,
                  py: 0.25,
                  fontSize: 12,
                  color: 'text.secondary',
                  boxShadow: 1,
                }}>
                  +{notifications.length - 1}
                </Box>
              )}
            </Box>
          ) : (
            visibleNotifications.map(notification => (
              <NotificationItem
                key={`${notification.id}-${notification.count ?? 1}`}
                id={notification.id}
                message={notification.message}
                type={notification.type}
                count={notification.count}
                onDismiss={removeNotification}
                autoHideDuration={autoHideDuration}
              />
            ))
          )
        )}

        {/* Expanded vertical list on hover (limit to latest 3) */}
        {isHovered && notifications.slice(-Math.min(3, notifications.length)).map((notification) => (
          <Box 
            key={`${notification.id}-${notification.count ?? 1}`}
            sx={{
              transition: 'transform 0.2s ease, opacity 0.2s ease',
              transform: 'translateY(0)',
              opacity: 1,
              '&:hover': {
                transform: 'translateY(-2px)',
                zIndex: 1
              }
            }}
          >
            <NotificationItem
              id={notification.id}
              message={notification.message}
              type={notification.type}
              count={notification.count}
              onDismiss={removeNotification}
              autoHideDuration={autoHideDuration}
            />
          </Box>
        ))}
      </Box>
    </Box>
  );
};

export default NotificationContainer;
