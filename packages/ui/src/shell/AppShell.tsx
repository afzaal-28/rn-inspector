import { useMemo, useState, useEffect, useRef } from 'react';
import {
  AppBar,
  Box,
  CssBaseline,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Typography,
  Tooltip,
  MenuItem,
  Chip,
  Popper,
  ClickAwayListener,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import TerminalIcon from '@mui/icons-material/Terminal';
import LanIcon from '@mui/icons-material/Lan';
import StorageIcon from '@mui/icons-material/Storage';
import SettingsIcon from '@mui/icons-material/Settings';
import LightModeIcon from '@mui/icons-material/LightMode';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import NetworkCheckIcon from '@mui/icons-material/NetworkCheck';
import NavigationIcon from '@mui/icons-material/Navigation';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import { useProxy } from '../context/ProxyContext';

const drawerWidth = 220;

const navItems = [
  {
    label: 'Console',
    icon: <TerminalIcon fontSize="small" />,
    path: '/',
    disabled: false,
  },
  {
    label: 'Network',
    icon: <NetworkCheckIcon fontSize="small" />,
    path: '/network',
    disabled: false,
  },
  {
    label: 'Storage',
    icon: <StorageIcon fontSize="small" />,
    path: '/storage',
    disabled: false,
  },
  {
    label: 'Navigation',
    icon: <NavigationIcon fontSize="small" />,
    path: '/navigation',
    disabled: true,
  },
  {
    label: 'Charts',
    icon: <ShowChartIcon fontSize="small" />,
    path: '/charts',
    disabled: false,
  },
  {
    label: 'Inspector',
    icon: <LanIcon fontSize="small" />,
    path: '/inspector',
    disabled: true,
  },
  {
    label: 'Sessions',
    icon: <StorageIcon fontSize="small" />,
    path: '/sessions',
    disabled: true,
  },
  {
    label: 'Settings',
    icon: <SettingsIcon fontSize="small" />,
    path: '/settings',
    disabled: true,
  },
  {
    label: 'Application',
    icon: <LanIcon fontSize="small" />,
    path: '/application',
    disabled: true,
  },
  {
    label: 'Components',
    icon: <TerminalIcon fontSize="small" />,
    path: '/components',
    disabled: true,
  },
  {
    label: 'Preview',
    icon: <LanIcon fontSize="small" />,
    path: '/preview',
    disabled: true,
  },
];

const heartbeatPatterns: string[] = [
  // idle / flat
  '0,12 24,12 48,12 72,12 96,12 120,12',
  // normal activity
  '0,12 12,12 22,12 32,4 44,20 56,8 70,16 84,10 100,12 120,12',
  // high activity (sharper spikes)
  '0,12 10,12 20,2 30,22 40,6 50,20 60,4 72,22 84,8 96,14 108,12 120,12',
];

export default function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { mode, toggleTheme } = useTheme();
  const {
    devices,
    activeDeviceId,
    setActiveDeviceId,
    captureConsole,
    setCaptureConsole,
    captureNetwork,
    setCaptureNetwork,
    devtoolsStatus,
    reconnectDevtools,
    status,
    stats,
    reconnect,
  } = useProxy();

  const effectiveDevtoolsStatus: 'unknown' | 'open' | 'closed' | 'error' =
    devtoolsStatus === 'unknown' && devices.length > 0 ? 'open' : devtoolsStatus;

  const [heartbeatPatternIndex, setHeartbeatPatternIndex] = useState(0);
  const lastActivityRef = useRef({ console: 0, network: 0 });
  const [deviceAnchorEl, setDeviceAnchorEl] = useState<HTMLElement | null>(null);
  const deviceMenuOpen = Boolean(deviceAnchorEl);

  useEffect(() => {
    const durationMs = 1000;
    const interval = setInterval(() => {
      const prev = lastActivityRef.current;
      const deltaConsole = Math.max(0, stats.consoleCount - prev.console);
      const deltaNetwork = Math.max(0, stats.networkCount - prev.network);
      const totalDelta = deltaConsole + deltaNetwork;

      // Update last seen counts
      lastActivityRef.current = {
        console: stats.consoleCount,
        network: stats.networkCount,
      };

      // Decide pattern based on recent activity
      let index = 0; // idle / flat
      if (totalDelta > 0 && totalDelta <= 5) {
        index = 1; // normal pulse
      } else if (totalDelta > 5) {
        index = 2; // high activity / sharp spikes
      }

      setHeartbeatPatternIndex(index);
    }, durationMs);

    return () => clearInterval(interval);
  }, [stats.consoleCount, stats.networkCount]);

  const activePath = useMemo(() => {
    const found = navItems.find((item) =>
      item.path === '/' ? location.pathname === '/' : location.pathname.startsWith(item.path),
    );
    return found?.path ?? '/';
  }, [location.pathname]);

  const heartbeatPoints = heartbeatPatterns[heartbeatPatternIndex];

  const handleDeviceToggle = (event: React.MouseEvent<HTMLElement>) => {
    if (deviceMenuOpen) {
      setDeviceAnchorEl(null);
    } else {
      setDeviceAnchorEl(event.currentTarget as HTMLElement);
    }
  };

  const handleDeviceSelect = (id: string) => {
    setActiveDeviceId(id);
    setDeviceAnchorEl(null);
  };

  const drawer = (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        gap: 1,
        py: 1.5,
        px: 1,
      }}
    >
      <Box
        sx={(theme) => ({
          px: 2,
          borderRadius: 2,
          background: theme.palette.custom.glassBg,
          border: `1px solid ${theme.palette.custom.glassBorder}`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        })}
      >
        <Box
          component="img"
          src="/banner.png"
          sx={{ width: '100%', height: 'auto', display: 'block' }}
        />
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ textAlign: 'center', mt: -1, mb: 1 }}
        >
          DevTools for React Native
        </Typography>
      </Box>
      <Divider sx={{ opacity: 0.4, mx: 1 }} />
      <List
        sx={{
          flex: 1,
          py: 0,
          overflowY: 'auto',
          overflowX: 'hidden',
          pr: 0.5,
        }}
      >
        {navItems.map((item) => (
          <ListItemButton
            key={item.path}
            selected={!item.disabled && activePath === item.path}
            disabled={item.disabled}
            onClick={() => {
              if (item.disabled) return;
              navigate(item.path);
              setMobileOpen(false);
            }}
            sx={(theme) => ({
              borderRadius: 1.5,
              mx: 0.5,
              my: 0.25,
              px: 1.5,
              '&.Mui-selected': {
                backgroundColor: theme.palette.action.selected,
                color: theme.palette.primary.main,
                '& .MuiListItemIcon-root': {
                  color: theme.palette.primary.main,
                },
              },
              '&:hover': {
                backgroundColor: theme.palette.action.hover,
              },
            })}
          >
            <ListItemIcon sx={{ minWidth: 36 }}>{item.icon}</ListItemIcon>
            <ListItemText primary={item.label} />
          </ListItemButton>
        ))}
      </List>
      <Divider sx={{ opacity: 0.4, mx: 1 }} />
      <List sx={{ py: 0.5 }}>
        <ListItemButton
          onClick={toggleTheme}
          sx={(theme) => ({
            borderRadius: 1.5,
            mx: 0.5,
            my: 0.25,
            px: 1.25,
            py: 0.25,
            minHeight: 36,
            '&:hover': {
              backgroundColor: theme.palette.action.hover,
            },
          })}
        >
          <ListItemIcon sx={{ minWidth: 32, mr: 0.5, color: 'text.secondary' }}>
            {mode === 'light' ? (
              <LightModeIcon fontSize="small" />
            ) : (
              <DarkModeIcon fontSize="small" />
            )}
          </ListItemIcon>
          <ListItemText
            primary={`Theme: ${mode === 'light' ? 'Light' : 'Dark'}`}
            primaryTypographyProps={{ variant: 'body2', fontWeight: 500 }}
          />
        </ListItemButton>
      </List>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex' }}>
      <CssBaseline />
      <AppBar
        position="fixed"
        elevation={0}
        sx={(theme) => ({
          ml: { sm: `${drawerWidth}px` },
          width: { sm: `calc(100% - ${drawerWidth}px)` },
          background: theme.palette.custom.glassBg,
          backdropFilter: 'blur(18px) saturate(160%)',
          WebkitBackdropFilter: 'blur(18px) saturate(160%)',
          borderBottom: `1px solid ${theme.palette.divider}`,
          boxShadow: theme.palette.custom.glassShadow,
        })}
      >
        <Toolbar
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              minWidth: 0,
            }}
          >
            <IconButton
              color="inherit"
              edge="start"
              onClick={() => setMobileOpen(!mobileOpen)}
              sx={{ mr: 1, display: { sm: 'none' } }}
            >
              <MenuIcon />
            </IconButton>
            <Box sx={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <Typography variant="h6" noWrap component="div" fontWeight={700} color="text.primary">
                RN Inspector
              </Typography>
            </Box>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box
              onClick={handleDeviceToggle}
              sx={(theme) => ({
                minWidth: 220,
                maxWidth: 260,
                px: 1.5,
                py: 0.5,
                borderRadius: 999,
                border: `1px solid ${theme.palette.divider}`,
                display: 'flex',
                alignItems: 'center',
                gap: 0.75,
                cursor: 'pointer',
                backgroundColor: theme.palette.background.paper,
                '&:hover': {
                  backgroundColor:
                    theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
                },
              })}
            >
              <Typography variant="caption" color="text.secondary">
                Device
              </Typography>
              <Typography
                variant="body2"
                noWrap
                color="text.primary"
                sx={{ flex: 1, fontWeight: 500 }}
              >
                {(devices.find((d) => d.id === activeDeviceId)?.label ?? activeDeviceId) ||
                  'No device selected'}
              </Typography>
            </Box>

            <Popper
              open={deviceMenuOpen}
              anchorEl={deviceAnchorEl}
              placement="bottom-start"
              modifiers={[{ name: 'offset', options: { offset: [0, 4] } }]}
              sx={(theme) => ({ zIndex: theme.zIndex.tooltip })}
            >
              <ClickAwayListener onClickAway={() => setDeviceAnchorEl(null)}>
                <Box
                  sx={(theme) => ({
                    minWidth: 220,
                    maxHeight: 320,
                    overflowY: 'auto',
                    borderRadius: 1.5,
                    border: `1px solid ${theme.palette.divider}`,
                    backgroundColor: theme.palette.background.paper,
                    p: 0.5,
                  })}
                >
                  {devices.map((device) => (
                    <MenuItem
                      key={device.id}
                      sx={{ borderRadius: 1, verticalGap: 0.5 }}
                      selected={activeDeviceId === device.id}
                      onClick={() => handleDeviceSelect(device.id)}
                    >
                      {device.label}
                    </MenuItem>
                  ))}
                </Box>
              </ClickAwayListener>
            </Popper>

            <Tooltip
              title={
                captureConsole ? 'Pause capturing console logs' : 'Start capturing console logs'
              }
            >
              <Chip
                size="small"
                label="Console"
                color={captureConsole ? 'success' : 'default'}
                variant="filled"
                onClick={() => setCaptureConsole(!captureConsole)}
                sx={{ cursor: 'pointer' }}
              />
            </Tooltip>

            <Tooltip
              title={
                status === 'open'
                  ? 'Proxy websocket connected'
                  : 'Proxy disconnected. Click to try reconnecting.'
              }
            >
              <Chip
                size="small"
                label={`WS: ${status}${
                  stats.networkCount || stats.consoleCount
                    ? ` • ${stats.consoleCount} logs / ${stats.networkCount} reqs`
                    : ''
                }`}
                color={
                  status === 'open' ? 'success' : status === 'connecting' ? 'warning' : 'default'
                }
                variant="filled"
                onClick={status === 'open' ? undefined : reconnect}
                sx={{ cursor: status === 'open' ? 'default' : 'pointer' }}
              />
            </Tooltip>

            <Tooltip
              title={
                captureNetwork
                  ? 'Pause capturing network requests'
                  : 'Start capturing network requests'
              }
            >
              <Chip
                size="small"
                label="Network"
                color={captureNetwork ? 'success' : 'default'}
                variant="filled"
                onClick={() => setCaptureNetwork(!captureNetwork)}
                sx={{ cursor: 'pointer' }}
              />
            </Tooltip>

            <Tooltip
              title={
                effectiveDevtoolsStatus === 'open'
                  ? 'DevTools bridges connected'
                  : 'DevTools disconnected or errored. Click to try reconnecting.'
              }
            >
              <Chip
                size="small"
                label={
                  effectiveDevtoolsStatus === 'open'
                    ? 'DevTools: connected'
                    : effectiveDevtoolsStatus === 'error'
                      ? 'DevTools: error'
                      : effectiveDevtoolsStatus === 'closed'
                        ? 'DevTools: closed'
                        : 'DevTools: unknown'
                }
                color={
                  effectiveDevtoolsStatus === 'open'
                    ? 'success'
                    : effectiveDevtoolsStatus === 'error'
                      ? 'error'
                      : 'default'
                }
                variant="filled"
                onClick={effectiveDevtoolsStatus === 'open' ? undefined : reconnectDevtools}
                sx={{
                  cursor: effectiveDevtoolsStatus === 'open' ? 'default' : 'pointer',
                }}
              />
            </Tooltip>

            <Box
              sx={(theme) => ({
                width: 160,
                height: 28,
                display: 'flex',
                alignItems: 'center',
                color: theme.palette.success.main,
              })}
            >
              <Box
                component="svg"
                viewBox="0 0 120 24"
                sx={{
                  width: '100%',
                  height: '100%',
                  color: '#4caf50',
                  '& .heartbeat-path': {
                    strokeDasharray: 150,
                    strokeDashoffset: 150,
                    animation: 'heartbeatMove 1.4s ease-in-out infinite',
                  },
                  '@keyframes heartbeatMove': {
                    '0%': { strokeDashoffset: 150, opacity: 0.4 },
                    '30%': { strokeDashoffset: 90, opacity: 1 },
                    '60%': { strokeDashoffset: 40, opacity: 0.7 },
                    '100%': { strokeDashoffset: 0, opacity: 0.4 },
                  },
                }}
              >
                <polyline
                  className="heartbeat-path"
                  points={heartbeatPoints}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              </Box>
            </Box>

            <Box
              component="img"
              src="/Legend_moyai.png"
              sx={(theme) => ({
                width: 32,
                height: 32,
                borderRadius: 1,
                objectFit: 'cover',
                ml: 1,
                boxShadow: `0 6px 16px ${
                  theme.palette.mode === 'dark'
                    ? theme.palette.common.black + '55'
                    : theme.palette.grey[500] + '55'
                }`,
              })}
            />
          </Box>
        </Toolbar>
      </AppBar>

      <Box
        component="nav"
        sx={{ width: { sm: drawerWidth }, flexShrink: { sm: 0 } }}
        aria-label="navigation"
      >
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          ModalProps={{ keepMounted: true }}
          sx={(theme) => ({
            display: { xs: 'block', sm: 'none' },
            '& .MuiDrawer-paper': {
              boxSizing: 'border-box',
              width: drawerWidth,
              background: theme.palette.custom.glassBg,
              backdropFilter: 'blur(20px) saturate(160%)',
              WebkitBackdropFilter: 'blur(20px) saturate(160%)',
              borderRight: `1px solid ${theme.palette.divider}`,
              boxShadow: theme.palette.custom.glassShadow,
            },
          })}
        >
          {drawer}
        </Drawer>
        <Drawer
          variant="permanent"
          sx={(theme) => ({
            display: { xs: 'none', sm: 'block' },
            '& .MuiDrawer-paper': {
              boxSizing: 'border-box',
              width: drawerWidth,
              background: theme.palette.custom.glassBg,
              backdropFilter: 'blur(20px) saturate(160%)',
              WebkitBackdropFilter: 'blur(20px) saturate(160%)',
              borderRight: `1px solid ${theme.palette.divider}`,
              boxShadow: theme.palette.custom.glassShadow,
              borderRadius: 0,
              overflow: 'hidden',
            },
          })}
          open
        >
          {drawer}
        </Drawer>
      </Box>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: 3,
          width: { sm: `calc(100% - ${drawerWidth}px)` },
        }}
      >
        <Toolbar />
        <Outlet />
      </Box>
    </Box>
  );
}
