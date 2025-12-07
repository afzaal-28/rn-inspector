import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import AppShell from '../shell/AppShell';
import ConsolePage from '../pages/ConsolePage';
import NetworkPage from '../pages/NetworkPage';
import SessionsPage from '../pages/SessionsPage';
import SettingsPage from '../pages/SettingsPage';
import StoragePage from '../pages/StoragePage';
import InspectorPage from '../pages/InspectorPage';
import NotFoundPage from '../pages/NotFoundPage';

const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <ConsolePage /> },
      { path: 'network', element: <NetworkPage /> },
      { path: 'sessions', element: <SessionsPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: 'storage', element: <StoragePage /> },
      { path: 'inspector', element: <InspectorPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);

export function AppRoutes() {
  return <RouterProvider router={router} />;
}
