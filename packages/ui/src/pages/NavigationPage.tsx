import { useEffect, useState } from 'react';
import {
  Box,
  Stack,
  Typography,
  Button,
  TextField,
  Chip,
  Card,
  CardContent,
  IconButton,
  Divider,
  Alert,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
} from '@mui/material';
import NavigationIcon from '@mui/icons-material/Navigation';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import RefreshIcon from '@mui/icons-material/Refresh';
import LinkIcon from '@mui/icons-material/Link';
import RouteIcon from '@mui/icons-material/Route';
import HistoryIcon from '@mui/icons-material/History';
import GlassPanel from '../ui/GlassPanel';
import JsonTreeView from '../components/JsonTreeView';
import { useProxy } from '../context/ProxyContext';

function formatTimestamp(ts: string) {
  try {
    return new Date(ts).toLocaleTimeString();
  } catch {
    return ts;
  }
}

export default function NavigationPage() {
  const {
    navigationState,
    navigationHistory,
    availableRoutes,
    navigateToRoute,
    replaceToRoute,
    goBack,
    resetNavigation,
    openUrl,
    getNavigationState,
    activeDeviceId,
  } = useProxy();

  const [selectedRoute, setSelectedRoute] = useState<string>('');
  const [routeParams, setRouteParams] = useState<string>('{}');
  const [deepLinkUrl, setDeepLinkUrl] = useState<string>('');
  const [paramsError, setParamsError] = useState<string>('');
  const [navigationMethod, setNavigationMethod] = useState<string>('navigate');
  const [resetState, setResetState] = useState<string>('{}');
  const [resetStateError, setResetStateError] = useState<string>('');

  useEffect(() => {
    if (activeDeviceId) {
      getNavigationState(activeDeviceId);
    }
  }, [activeDeviceId, getNavigationState]);

  const handleNavigate = () => {
    if (!selectedRoute) return;

    try {
      const params = routeParams.trim() ? JSON.parse(routeParams) : undefined;
      setParamsError('');

      if (navigationMethod === 'navigate') {
        navigateToRoute(selectedRoute, params, activeDeviceId);
      } else if (navigationMethod === 'replace') {
        replaceToRoute(selectedRoute, params, activeDeviceId);
      }
    } catch (err) {
      setParamsError('Invalid JSON params');
    }
  };

  const handleOpenUrl = () => {
    if (!deepLinkUrl.trim()) return;
    openUrl(deepLinkUrl, activeDeviceId);
  };

  const handleGoBack = () => {
    goBack(activeDeviceId);
  };

  const handleRefreshState = () => {
    getNavigationState(activeDeviceId);
  };

  const currentRoute = navigationState?.currentRoute;
  const hasHistory = navigationHistory && navigationHistory.length > 0;
  const isNavigationConfigured = Boolean(currentRoute || availableRoutes.length > 0);

  return (
    <Box sx={{ p: 2, height: '100%', overflow: 'auto' }}>
      <Stack spacing={2}>
        <GlassPanel>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <NavigationIcon sx={{ fontSize: 28 }} />
            <Typography variant="h5" fontWeight="bold">
              Navigation Inspector
            </Typography>
            <Box sx={{ flex: 1 }} />
            <IconButton size="small" onClick={handleRefreshState} title="Refresh navigation state">
              <RefreshIcon />
            </IconButton>
          </Box>
        </GlassPanel>

        {!isNavigationConfigured && (
          <GlassPanel>
            <Alert severity="info" sx={{ mb: 2 }}>
              <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                Navigation Setup Required
              </Typography>
              <Typography variant="body2" gutterBottom>
                To enable navigation inspection, add the following to your React Native app:
              </Typography>
              <Box
                component="pre"
                sx={{
                  bgcolor: 'background.default',
                  p: 1.5,
                  borderRadius: 1,
                  overflow: 'auto',
                  fontSize: '0.75rem',
                  fontFamily: 'monospace',
                  mt: 1,
                }}
              >
                {`import { useEffect, useRef } from 'react';
import { NavigationContainer } from '@react-navigation/native';

function App() {
  const navigationRef = useRef(null);

  useEffect(() => {
    if (global.__RN_INSPECTOR_NAVIGATION__) {
      global.__RN_INSPECTOR_NAVIGATION__
        .setNavigationRef(navigationRef.current);
    }
  }, []);

  return (
    <NavigationContainer ref={navigationRef}>
      {/* Your navigation stack */}
    </NavigationContainer>
  );
}`}
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                After adding this code, reload your app and refresh this page.
              </Typography>
            </Alert>
          </GlassPanel>
        )}

        <GlassPanel>
          <Stack spacing={2}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <RouteIcon />
              <Typography variant="h6">Current Route</Typography>
            </Box>
            <Divider />
            {currentRoute ? (
              <Card variant="outlined">
                <CardContent>
                  <Stack spacing={1}>
                    <Box>
                      <Typography variant="caption" color="text.secondary">
                        Route Name
                      </Typography>
                      <Typography variant="body1" fontWeight="bold">
                        {currentRoute.name}
                      </Typography>
                    </Box>
                    {currentRoute.key && (
                      <Box>
                        <Typography variant="caption" color="text.secondary">
                          Key
                        </Typography>
                        <Typography variant="body2" fontFamily="monospace">
                          {currentRoute.key}
                        </Typography>
                      </Box>
                    )}
                    {currentRoute.path && (
                      <Box>
                        <Typography variant="caption" color="text.secondary">
                          Path
                        </Typography>
                        <Typography variant="body2" fontFamily="monospace">
                          {currentRoute.path}
                        </Typography>
                      </Box>
                    )}
                    {currentRoute.params && Object.keys(currentRoute.params).length > 0 && (
                      <Box>
                        <Typography variant="caption" color="text.secondary">
                          Params
                        </Typography>
                        <JsonTreeView data={currentRoute.params} />
                      </Box>
                    )}
                  </Stack>
                </CardContent>
              </Card>
            ) : (
              <Alert severity="info">
                No current route information available. Make sure the navigation ref is set in your
                React Native app.
              </Alert>
            )}
          </Stack>
        </GlassPanel>

        <GlassPanel>
          <Stack spacing={2}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <HistoryIcon />
              <Typography variant="h6">Navigation History</Typography>
              {hasHistory && <Chip label={navigationHistory.length} size="small" color="primary" />}
            </Box>
            <Divider />
            {hasHistory ? (
              <Box sx={{ maxHeight: 300, overflow: 'auto', borderRadius: 1 }}>
                <Stack spacing={1}>
                  {navigationHistory.map((entry, index) => (
                    <Card
                      key={`${entry.key}-${index}`}
                      variant="outlined"
                      sx={{ bgcolor: 'background.default' }}
                    >
                      <CardContent sx={{ py: 1, '&:last-child': { pb: 1 } }}>
                        <Stack direction="row" spacing={2} alignItems="center">
                          <Box sx={{ flex: 1 }}>
                            <Typography variant="body2" fontWeight="bold">
                              {entry.name}
                            </Typography>
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              fontFamily="monospace"
                            >
                              {entry.key}
                            </Typography>
                          </Box>
                          <Typography variant="caption" color="text.secondary">
                            {formatTimestamp(entry.timestamp)}
                          </Typography>
                        </Stack>
                        {entry.params && Object.keys(entry.params).length > 0 && (
                          <Box sx={{ mt: 1 }}>
                            <JsonTreeView data={entry.params} />
                          </Box>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </Stack>
              </Box>
            ) : (
              <Alert severity="info">No navigation history available yet.</Alert>
            )}
          </Stack>
        </GlassPanel>

        <GlassPanel>
          <Stack spacing={2}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <RouteIcon />
              <Typography variant="h6">Navigate to Route</Typography>
            </Box>
            <Divider />
            {availableRoutes && availableRoutes.length > 0 ? (
              <>
                <Box>
                  <Typography variant="caption" color="text.secondary" mb={1}>
                    Available Routes
                  </Typography>
                  <Stack direction="row" spacing={1} flexWrap="wrap" gap={1}>
                    {availableRoutes.map((route) => (
                      <Chip
                        key={route.key}
                        label={`${route.name} (${route.key})`}
                        onClick={() => setSelectedRoute(route.name)}
                        color={selectedRoute === route.name ? 'primary' : 'default'}
                        variant="filled"
                        title={`Key: ${route.key}`}
                      />
                    ))}
                  </Stack>
                </Box>

                <FormControl fullWidth size="small">
                  <InputLabel>Navigation Method</InputLabel>
                  <Select
                    value={navigationMethod}
                    label="Navigation Method"
                    onChange={(e) => setNavigationMethod(e.target.value)}
                  >
                    <MenuItem value="navigate">Navigate</MenuItem>
                    <MenuItem value="replace">Replace</MenuItem>
                  </Select>
                </FormControl>

                <TextField
                  label="Route Key"
                  value={selectedRoute}
                  onChange={(e) => setSelectedRoute(e.target.value)}
                  size="small"
                  fullWidth
                  helperText="Route key to navigate to (e.g., Browse-6X4B3CMpoXVB51hbn-YQn)"
                />
                <TextField
                  label="Route Params (JSON)"
                  value={routeParams}
                  onChange={(e) => {
                    setRouteParams(e.target.value);
                    setParamsError('');
                  }}
                  size="small"
                  fullWidth
                  multiline
                  rows={3}
                  error={!!paramsError}
                  helperText={paramsError || 'e.g., {"id": 123, "name": "test"}'}
                  placeholder="{}"
                />
                <Button
                  variant="contained"
                  onClick={handleNavigate}
                  disabled={!selectedRoute}
                  startIcon={<NavigationIcon />}
                  fullWidth
                >
                  {navigationMethod === 'navigate' ? 'Navigate' : 'Replace'}
                </Button>
              </>
            ) : (
              <Alert severity="warning">
                No available routes detected. Make sure your app is running with navigation properly
                configured.
              </Alert>
            )}
          </Stack>
        </GlassPanel>

        <GlassPanel>
          <Stack spacing={2}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <RefreshIcon />
              <Typography variant="h6">Reset Navigation</Typography>
            </Box>
            <Divider />
            <TextField
              label="Navigation State (JSON)"
              value={resetState}
              onChange={(e) => {
                setResetState(e.target.value);
                setResetStateError('');
              }}
              size="small"
              fullWidth
              multiline
              rows={4}
              error={!!resetStateError}
              helperText={resetStateError || 'e.g., {"index": 0, "routes": [{"name": "Home"}]}'}
              placeholder='{"index": 0, "routes": []}'
            />
            <Button
              variant="outlined"
              onClick={() => {
                try {
                  const state = resetState.trim() ? JSON.parse(resetState) : {};
                  setResetStateError('');
                  resetNavigation(state, activeDeviceId);
                } catch (err) {
                  setResetStateError('Invalid JSON state');
                }
              }}
              startIcon={<RefreshIcon />}
              fullWidth
              color="warning"
            >
              Reset Navigation State
            </Button>
          </Stack>
        </GlassPanel>

        <GlassPanel>
          <Stack spacing={2}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <LinkIcon />
              <Typography variant="h6">Deep Link</Typography>
            </Box>
            <Divider />
            <TextField
              label="Deep Link URL"
              value={deepLinkUrl}
              onChange={(e) => setDeepLinkUrl(e.target.value)}
              size="small"
              fullWidth
              placeholder="myapp://screen/details?id=123"
              helperText="Enter a deep link URL to open in the app"
            />
            <Button
              variant="contained"
              onClick={handleOpenUrl}
              disabled={!deepLinkUrl.trim()}
              startIcon={<LinkIcon />}
              fullWidth
            >
              Open Deep Link
            </Button>
          </Stack>
        </GlassPanel>

        <GlassPanel>
          <Stack spacing={2}>
            <Typography variant="h6">Navigation Controls</Typography>
            <Divider />
            <Button
              variant="outlined"
              onClick={handleGoBack}
              startIcon={<ArrowBackIcon />}
              fullWidth
            >
              Go Back
            </Button>
          </Stack>
        </GlassPanel>

        {Boolean(navigationState?.state && typeof navigationState.state === 'object') &&
          navigationState && (
            <GlassPanel>
              <Stack spacing={2}>
                <Typography variant="h6">Full Navigation State</Typography>
                <Divider />
                <Box
                  sx={{
                    maxHeight: 400,
                    overflow: 'auto',
                    bgcolor: 'background.default',
                    p: 1,
                    borderRadius: 1,
                  }}
                >
                  <JsonTreeView data={navigationState.state as Record<string, unknown>} />
                </Box>
              </Stack>
            </GlassPanel>
          )}
      </Stack>
    </Box>
  );
}
