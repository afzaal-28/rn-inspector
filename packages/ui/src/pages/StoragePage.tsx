import { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Typography,
  Button,
  CircularProgress,
  Chip,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  TextField,
  InputAdornment,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import SearchIcon from '@mui/icons-material/Search';
import StorageIcon from '@mui/icons-material/Storage';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import GlassPanel from '../ui/GlassPanel';
import JsonTreeView from '../components/JsonTreeView';
import { useProxy } from '../context/ProxyContext';

export default function StoragePage() {
  const { storageData, fetchStorage, devices, activeDeviceId, setActiveDeviceId, status } = useProxy();
  const [loading, setLoading] = useState(false);
  const [asyncSearchQuery, setAsyncSearchQuery] = useState('');
  const [reduxSearchQuery, setReduxSearchQuery] = useState('');

  // Get storage for the active device
  const currentStorage = useMemo(() => {
    if (activeDeviceId === 'all') {
      // Merge all device storage or show first available
      const entries = Array.from(storageData.values());
      if (entries.length === 0) return null;
      return entries[0];
    }
    return storageData.get(activeDeviceId) || null;
  }, [storageData, activeDeviceId]);

  const handleRefresh = () => {
    setLoading(true);
    fetchStorage(activeDeviceId === 'all' ? undefined : activeDeviceId);
    // Auto-clear loading after timeout
    setTimeout(() => setLoading(false), 3000);
  };

  // Auto-fetch on mount and when device changes
  useEffect(() => {
    if (status === 'open') {
      handleRefresh();
    }
  }, [activeDeviceId, status]);

  // Clear loading when data arrives
  useEffect(() => {
    if (currentStorage) {
      setLoading(false);
    }
  }, [currentStorage]);

  const filteredAsyncStorage = useMemo(() => {
    if (!currentStorage?.asyncStorage || typeof currentStorage.asyncStorage !== 'object') {
      return currentStorage?.asyncStorage;
    }
    if (!asyncSearchQuery.trim()) return currentStorage.asyncStorage;
    
    const query = asyncSearchQuery.toLowerCase();
    const filtered: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(currentStorage.asyncStorage)) {
      if (key.toLowerCase().includes(query)) {
        filtered[key] = value;
      }
    }
    return filtered;
  }, [currentStorage?.asyncStorage, asyncSearchQuery]);

  const filteredRedux = useMemo(() => {
    if (!currentStorage?.redux || typeof currentStorage.redux !== 'object') {
      return currentStorage?.redux;
    }
    if (!reduxSearchQuery.trim()) return currentStorage.redux;
    
    const query = reduxSearchQuery.toLowerCase();
    const filtered: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(currentStorage.redux)) {
      if (key.toLowerCase().includes(query)) {
        filtered[key] = value;
      }
    }
    return filtered;
  }, [currentStorage?.redux, reduxSearchQuery]);

  const hasAsyncStorageError = currentStorage?.asyncStorage && 
    typeof currentStorage.asyncStorage === 'object' && 
    'error' in currentStorage.asyncStorage;

  const hasReduxError = currentStorage?.redux && 
    typeof currentStorage.redux === 'object' && 
    'error' in currentStorage.redux;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* Header */}
      <Box
        sx={{
          p: 2,
          borderRadius: 2,
          background: (theme) =>
            theme.palette.mode === 'dark'
              ? 'rgba(255,255,255,0.03)'
              : 'rgba(0,0,0,0.02)',
          border: (theme) => `1px solid ${theme.palette.divider}`,
          boxShadow: (theme) =>
            `0 6px 18px ${
              theme.palette.mode === 'dark' ? 'rgba(0,0,0,0.35)' : 'rgba(0,0,0,0.08)'
            }`,
          display: 'flex',
          flexDirection: 'column',
          gap: 1.5,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
          <Box>
            <Typography variant="h5" fontWeight={600}>
              Storage
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Inspect AsyncStorage and Redux state from connected devices
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            {devices.length > 1 && (
              <FormControl size="small" sx={{ minWidth: 180 }}>
                <InputLabel>Device</InputLabel>
                <Select
                  value={activeDeviceId}
                  label="Device"
                  onChange={(e) => setActiveDeviceId(e.target.value)}
                  sx={{ borderRadius: 2 }}
                >
                  <MenuItem value="all">All Devices</MenuItem>
                  {devices.map((d) => (
                    <MenuItem key={d.id} value={d.id}>
                      {d.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
            <Button
              variant="outlined"
              startIcon={loading ? <CircularProgress size={16} /> : <RefreshIcon />}
              onClick={handleRefresh}
              disabled={loading || status !== 'open'}
              sx={{ borderRadius: 999, textTransform: 'none' }}
            >
              {loading ? 'Fetching...' : 'Refresh'}
            </Button>
          </Box>
        </Box>
        {currentStorage && (
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Chip
              size="small"
              label={`Last updated: ${new Date(currentStorage.ts).toLocaleTimeString()}`}
              variant="filled"
            />
            {currentStorage.deviceId && (
              <Chip
                size="small"
                label={`Device: ${devices.find(d => d.id === currentStorage.deviceId)?.label || currentStorage.deviceId}`}
                variant="filled"
              />
            )}
          </Box>
        )}
      </Box>

      {/* Storage Panels */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', md: 'row' },
          gap: 2,
        }}
      >
        {/* AsyncStorage Panel */}
        <Box sx={{ flexBasis: { xs: '100%', md: '50%' }, minHeight: 0, display: 'flex' }}>
          <GlassPanel
            sx={{
              width: '100%',
              height: '100%',
              minHeight: 400,
              display: 'flex',
              flexDirection: 'column',
              gap: 1.5,
              p: { xs: 1.5, md: 2 },
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <StorageIcon color="primary" />
                <Typography variant="subtitle1" fontWeight={600}>
                  AsyncStorage
                </Typography>
              </Box>
              <TextField
                size="small"
                placeholder="Search keys..."
                value={asyncSearchQuery}
                onChange={(e) => setAsyncSearchQuery(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon fontSize="small" />
                    </InputAdornment>
                  ),
                }}
                sx={{
                  width: 180,
                  '& .MuiOutlinedInput-root': { borderRadius: 2 },
                }}
              />
            </Box>
            
            <Box
              sx={{
                flex: 1,
                overflow: 'auto',
                p: 1.5,
                background: (theme) =>
                  theme.palette.mode === 'dark'
                    ? 'rgba(0,0,0,0.2)'
                    : 'rgba(0,0,0,0.03)',
                borderRadius: 1.5,
              }}
            >
              {!currentStorage ? (
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                  <Typography color="text.secondary">
                    {status !== 'open' ? 'Connect to a device to view storage' : 'Click Refresh to fetch storage data'}
                  </Typography>
                </Box>
              ) : hasAsyncStorageError ? (
                <Box sx={{ p: 2 }}>
                  <Typography color="error.main" variant="body2">
                    {(currentStorage.asyncStorage as any)?.error || 'Error fetching AsyncStorage'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                    Make sure @react-native-async-storage/async-storage is installed in your app.
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                    To enable inspection, expose it globally in your app, for example:
                  </Typography>
                  <Box
                    component="pre"
                    sx={{
                      mt: 0.5,
                      p: 1,
                      background: (theme) =>
                        theme.palette.mode === 'dark' ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.05)',
                      borderRadius: 1,
                      fontSize: 12,
                      fontFamily: 'monospace',
                      overflow: 'auto',
                    }}
                  >
                    {`// in your app:
(global as any).AsyncStorage = AsyncStorage;`}
                  </Box>
                </Box>
              ) : filteredAsyncStorage && Object.keys(filteredAsyncStorage).length > 0 ? (
                <JsonTreeView data={filteredAsyncStorage} defaultExpanded />
              ) : (
                <Typography color="text.secondary" sx={{ p: 2 }}>
                  {asyncSearchQuery ? 'No matching keys found' : 'AsyncStorage is empty'}
                </Typography>
              )}
            </Box>
          </GlassPanel>
        </Box>

        {/* Redux Panel */}
        <Box sx={{ flexBasis: { xs: '100%', md: '50%' }, minHeight: 0, display: 'flex' }}>
          <GlassPanel
            sx={{
              width: '100%',
              height: '100%',
              minHeight: 400,
              display: 'flex',
              flexDirection: 'column',
              gap: 1.5,
              p: { xs: 1.5, md: 2 },
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <AccountTreeIcon color="secondary" />
                <Typography variant="subtitle1" fontWeight={600}>
                  Redux State
                </Typography>
              </Box>
              <TextField
                size="small"
                placeholder="Search keys..."
                value={reduxSearchQuery}
                onChange={(e) => setReduxSearchQuery(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon fontSize="small" />
                    </InputAdornment>
                  ),
                }}
                sx={{
                  width: 180,
                  '& .MuiOutlinedInput-root': { borderRadius: 2 },
                }}
              />
            </Box>
            
            <Box
              sx={{
                flex: 1,
                overflow: 'auto',
                p: 1.5,
                background: (theme) =>
                  theme.palette.mode === 'dark'
                    ? 'rgba(0,0,0,0.2)'
                    : 'rgba(0,0,0,0.03)',
                borderRadius: 1.5,
              }}
            >
              {!currentStorage ? (
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                  <Typography color="text.secondary">
                    {status !== 'open' ? 'Connect to a device to view storage' : 'Click Refresh to fetch storage data'}
                  </Typography>
                </Box>
              ) : hasReduxError ? (
                <Box sx={{ p: 2 }}>
                  <Typography color="error.main" variant="body2">
                    {(currentStorage.redux as any)?.error || 'Error fetching Redux state'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                    To enable Redux inspection, expose your store globally:
                  </Typography>
                  <Box
                    component="pre"
                    sx={{
                      mt: 1,
                      p: 1.5,
                      background: (theme) =>
                        theme.palette.mode === 'dark' ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.05)',
                      borderRadius: 1,
                      fontSize: 12,
                      fontFamily: 'monospace',
                      overflow: 'auto',
                    }}
                  >
                    {`// In your store configuration:\nwindow.__RN_INSPECTOR_REDUX_STORE__ = store;`}
                  </Box>
                </Box>
              ) : filteredRedux && Object.keys(filteredRedux).length > 0 ? (
                <JsonTreeView data={filteredRedux} defaultExpanded />
              ) : (
                <Typography color="text.secondary" sx={{ p: 2 }}>
                  {reduxSearchQuery ? 'No matching keys found' : 'Redux state is empty or not available'}
                </Typography>
              )}
            </Box>
          </GlassPanel>
        </Box>
      </Box>
    </Box>
  );
}
