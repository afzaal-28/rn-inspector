import './App.css';
import { ThemeProvider } from './context/ThemeContext';
import { NotificationProvider } from './context/NotificationContext';
import { ProxyProvider } from './context/ProxyContext';
import { AppRoutes } from './routes';

function App() {
  return (
    <ThemeProvider>
      <NotificationProvider>
        <ProxyProvider>
          <AppRoutes />
        </ProxyProvider>
      </NotificationProvider>
    </ThemeProvider>
  );
}

export default App;
