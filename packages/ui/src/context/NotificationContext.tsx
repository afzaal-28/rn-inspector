import { createContext, useContext, useCallback, type ReactNode } from 'react';
import NotificationContainer from '../components/notifications/NotificationContainer';
import type { NotificationType } from '../components/notifications/NotificationItem';

declare global {
  interface Window {
    showNotification?: (message: string, type?: NotificationType) => void;
    __notificationQueue?: Array<{ message: string; type?: NotificationType }>;
  }
}

export type { NotificationType };

interface NotificationContextType {
  showNotification: (message: string, type?: NotificationType) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

interface NotificationProviderProps {
  children: ReactNode;
}

export const NotificationProvider = ({ children }: NotificationProviderProps) => {
  const showNotification = useCallback((message: string, type: NotificationType = 'info') => {
    try {
      if (typeof window !== 'undefined') {
        if (window.showNotification) {
          window.showNotification(message, type);
        } else {
          // Queue the notification if the container isn't mounted yet
          const queue = window.__notificationQueue || [];
          queue.push({ message, type });
          window.__notificationQueue = queue;
        }
      }
      // Always log to console for debugging
      console[type === 'error' ? 'error' : type === 'warning' ? 'warn' : 'log'](
        `[Notification] ${type}:`,
        message,
      );
    } catch (error) {
      console.error('Error showing notification:', error);
    }
  }, []);

  return (
    <NotificationContext.Provider value={{ showNotification }}>
      {children}
      <NotificationContainer position="bottom-right" autoHideDuration={5000} />
    </NotificationContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useNotification = () => {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
};
