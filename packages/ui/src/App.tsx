import './App.css';
import { ThemeProvider } from './context/ThemeContext';
import { NotificationProvider } from './context/NotificationContext';
import { AppRoutes } from './routes';

function App() {
  return (
    <ThemeProvider>
      <NotificationProvider>
        <AppRoutes />
      </NotificationProvider>
    </ThemeProvider>
  );
}

export default App;
