import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import AppShell from '../shell/AppShell';
import ConsolePage from '../pages/ConsolePage';
import NetworkPage from '../pages/NetworkPage';
import SessionsPage from '../pages/SessionsPage';
import StoragePage from '../pages/StoragePage';
import NavigationPage from '../pages/NavigationPage';
import ChartsPage from '../pages/ChartsPage';
import NotFoundPage from '../pages/NotFoundPage';

const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <ConsolePage /> },
      { path: 'network', element: <NetworkPage /> },
      { path: 'sessions', element: <SessionsPage /> },
      { path: 'storage', element: <StoragePage /> },
      { path: 'navigation', element: <NavigationPage /> },
      { path: 'charts', element: <ChartsPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);

export function AppRoutes() {
  return <RouterProvider router={router} />;
}
