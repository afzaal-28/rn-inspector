import { useMemo, useState } from 'react';
import { AppBar, Box, CssBaseline, Divider, Drawer, IconButton, List, ListItemButton, ListItemIcon, ListItemText, Toolbar, Typography } from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import TerminalIcon from '@mui/icons-material/Terminal';
import LanIcon from '@mui/icons-material/Lan';
import StorageIcon from '@mui/icons-material/Storage';
import SettingsIcon from '@mui/icons-material/Settings';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';

const drawerWidth = 220;

const navItems = [
  { label: 'Console', icon: <TerminalIcon fontSize="small" />, path: '/' },
  { label: 'Network', icon: <LanIcon fontSize="small" />, path: '/network' },
  { label: 'Sessions', icon: <StorageIcon fontSize="small" />, path: '/sessions' },
  { label: 'Settings', icon: <SettingsIcon fontSize="small" />, path: '/settings' },
];

export default function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { mode, toggleTheme } = useTheme();

  const activePath = useMemo(() => {
    const found = navItems.find((item) => (item.path === '/' ? location.pathname === '/' : location.pathname.startsWith(item.path)));
    return found?.path ?? '/';
  }, [location.pathname]);

  const drawer = (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Box sx={{ px: 2, py: 2 }}>
        <Typography variant="h6" fontWeight={700}>
          RN Inspector
        </Typography>
        <Typography variant="body2" color="text.secondary">
          DevTools for React Native
        </Typography>
      </Box>
      <Divider />
      <List sx={{ flex: 1 }}>
        {navItems.map((item) => (
          <ListItemButton
            key={item.path}
            selected={activePath === item.path}
            onClick={() => {
              navigate(item.path);
              setMobileOpen(false);
            }}
            sx={{
              borderRadius: 1.5,
              mx: 1,
              my: 0.25,
            }}
          >
            <ListItemIcon sx={{ minWidth: 36 }}>{item.icon}</ListItemIcon>
            <ListItemText primary={item.label} />
          </ListItemButton>
        ))}
      </List>
      <Divider />
      <List sx={{ py: 1 }}>
        <ListItemButton
          onClick={toggleTheme}
          sx={{
            borderRadius: 1.5,
            mx: 1,
            my: 0.25,
          }}
        >
          <ListItemText primary={`Switch to ${mode === 'light' ? 'dark' : 'light'} mode`} />
        </ListItemButton>
      </List>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex' }}>
      <CssBaseline />
      <AppBar position="fixed" sx={{ ml: { sm: `${drawerWidth}px` }, width: { sm: `calc(100% - ${drawerWidth}px)` } }}>
        <Toolbar>
          <IconButton color="inherit" edge="start" onClick={() => setMobileOpen(!mobileOpen)} sx={{ mr: 2, display: { sm: 'none' } }}>
            <MenuIcon />
          </IconButton>
          <Typography variant="h6" noWrap component="div">
            RN Inspector
          </Typography>
        </Toolbar>
      </AppBar>

      <Box component="nav" sx={{ width: { sm: drawerWidth }, flexShrink: { sm: 0 } }} aria-label="navigation">
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          ModalProps={{ keepMounted: true }}
          sx={{
            display: { xs: 'block', sm: 'none' },
            '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth },
          }}
        >
          {drawer}
        </Drawer>
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: 'none', sm: 'block' },
            '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth },
          }}
          open
        >
          {drawer}
        </Drawer>
      </Box>

      <Box component="main" sx={{ flexGrow: 1, p: 3, width: { sm: `calc(100% - ${drawerWidth}px)` } }}>
        <Toolbar />
        <Outlet />
      </Box>
    </Box>
  );
}
