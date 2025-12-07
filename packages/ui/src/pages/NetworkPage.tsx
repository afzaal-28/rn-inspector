import { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Chip,
  Stack,
  Typography,
  Tooltip,
  Drawer,
  Tabs,
  Tab,
  IconButton,
  Button,
  TextField,
  InputAdornment,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit';
import CallMadeIcon from '@mui/icons-material/CallMade';
import GlassPanel from '../ui/GlassPanel';
import type { NetworkEvent } from '../hooks/useProxyStream';
import { useProxy } from '../context/ProxyContext';
import SearchIcon from '@mui/icons-material/Search';

function formatTs(ts: string) {
  try {
    return new Date(ts).toLocaleTimeString();
  } catch {
    return ts;
  }
}

const NetworkPage = () => {
  const { networkEvents, activeDeviceId, networkClearedAtMs, setNetworkClearedAtMs } = useProxy();
  const [selectedEvent, setSelectedEvent] = useState<NetworkEvent | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'headers' | 'payload' | 'response'>('headers');
  const [fullScreen, setFullScreen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showHtmlPreview, setShowHtmlPreview] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getStatusColor = (status?: number): 'success' | 'warning' | 'error' | 'default' => {
    if (!status) return 'default';
    if (status >= 200 && status < 300) return 'success';
    if (status >= 300 && status < 400) return 'warning';
    if (status >= 400) return 'error';
    return 'default';
  };

  const getCurrentTabContent = (): string => {
    if (!selectedEvent) return '';
    if (activeTab === 'headers') {
      const reqHeaders = selectedEvent.requestHeaders
        ? Object.entries(selectedEvent.requestHeaders).map(([k, v]) => `${k}: ${v}`).join('\n')
        : '';
      const resHeaders = selectedEvent.responseHeaders
        ? Object.entries(selectedEvent.responseHeaders).map(([k, v]) => `${k}: ${v}`).join('\n')
        : '';
      return `Request Headers:\n${reqHeaders}\n\nResponse Headers:\n${resHeaders}`;
    }
    if (activeTab === 'payload') {
      return selectedEvent.requestBody != null ? JSON.stringify(selectedEvent.requestBody, null, 2) : '';
    }
    if (activeTab === 'response') {
      return selectedEvent.responseBody != null
        ? typeof selectedEvent.responseBody === 'string'
          ? selectedEvent.responseBody
          : JSON.stringify(selectedEvent.responseBody, null, 2)
        : '';
    }
    return '';
  };

  const responseContentType = useMemo(() => {
    if (!selectedEvent || !selectedEvent.responseHeaders) return '';
    const headers = selectedEvent.responseHeaders;
    const target = 'content-type';
    for (const [k, v] of Object.entries(headers)) {
      if (k.toLowerCase() === target) return v;
    }
    return '';
  }, [selectedEvent]);

  const isImageResponse = responseContentType.toLowerCase().includes('image/');
  const isPdfResponse = responseContentType.toLowerCase().includes('application/pdf');
  const isVideoResponse = responseContentType.toLowerCase().includes('video/');
  const isHtmlResponse = responseContentType.toLowerCase().includes('text/html');
  const isTextLikeResponse = !isImageResponse && !isPdfResponse && !isVideoResponse;

  const mergedNetworkEvents = useMemo(() => {
    const byId = new Map<string, NetworkEvent>();
    const latest = networkEvents.slice(-600);

    latest.forEach((evt) => {
      const key = evt.id || `${evt.method}:${evt.url}:${evt.ts}`;
      const existing = byId.get(key);
      if (!existing) {
        byId.set(key, { ...evt });
      } else {
        byId.set(key, {
          ...existing,
          ...evt,
          ts: existing.ts,
        });
      }
    });

    return Array.from(byId.values()).sort((a, b) => {
      const aTs = Date.parse(a.ts);
      const bTs = Date.parse(b.ts);
      if (Number.isNaN(aTs) || Number.isNaN(bTs)) return 0;
      return bTs - aTs;
    });
  }, [networkEvents]);

  const filteredNetworkEvents = useMemo(() => {
    let latest = mergedNetworkEvents;

    if (networkClearedAtMs) {
      latest = latest.filter((evt) => {
        const tsMs = Date.parse(evt.ts);
        if (Number.isNaN(tsMs)) return true;
        return tsMs > networkClearedAtMs;
      });
    }

    let byDevice = latest;
    if (activeDeviceId) {
      byDevice = byDevice.filter((evt) => !evt.deviceId || evt.deviceId === activeDeviceId);
    }

    const query = searchQuery.trim().toLowerCase();
    if (query) {
      byDevice = byDevice.filter((evt) => {
        const url = evt.url.toLowerCase();
        const method = evt.method.toLowerCase();
        const statusText = evt.status != null ? String(evt.status) : '';
        return (
          url.includes(query) ||
          method.includes(query) ||
          statusText.toLowerCase().includes(query)
        );
      });
    }

    return byDevice;
  }, [mergedNetworkEvents, activeDeviceId, searchQuery, networkClearedAtMs]);

  useEffect(() => {
    setShowHtmlPreview(false);
  }, [selectedEvent, activeTab]);

  const handleClear = () => {
    if (networkEvents.length > 0) {
      const last = networkEvents[networkEvents.length - 1];
      const lastMs = Date.parse(last.ts);
      setNetworkClearedAtMs(Number.isNaN(lastMs) ? Date.now() : lastMs);
    } else {
      setNetworkClearedAtMs(Date.now());
    }
    setSelectedEvent(null);
    setDrawerOpen(false);
  };

  return (
    <Box sx={{ display: 'flex', gap: 2, flexDirection: 'column' }}>
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
            `0 6px 18px ${theme.palette.mode === 'dark' ? 'rgba(0,0,0,0.35)' : 'rgba(0,0,0,0.08)'}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1.5,
        }}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <Typography variant="h5" fontWeight={600}>
            Network
          </Typography>
          <Typography variant="caption" color="text.secondary">
            HTTP requests captured from proxy (last 300)
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
          <Box
            sx={(theme) => ({
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              px: 1,
              py: 0.5,
              borderRadius: 999,
              backdropFilter: 'blur(14px) saturate(130%)',
              WebkitBackdropFilter: 'blur(14px) saturate(130%)',
              border: `1px solid ${theme.palette.divider}`,
            })}
          >
            <TextField
              size="small"
              placeholder="Search requests"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" />
                  </InputAdornment>
                ),
              }}
              sx={{
                minWidth: 260,
                '& .MuiOutlinedInput-root': {
                  borderRadius: 999,
                  border: 'none',
                  px: 1,
                  py: 0.25,
                  '& fieldset': {
                    border: 'none',
                  },
                  '&:hover fieldset': {
                    border: 'none',
                  },
                  '&.Mui-focused fieldset': {
                    border: 'none',
                  },
                  '&.Mui-focused': {
                    boxShadow: 'none',
                    outline: 'none',
                  },
                },
              }}
            />
          </Box>
          <Button
            size="small"
            variant="outlined"
            onClick={handleClear}
            disabled={networkEvents.length === 0}
            sx={(theme) => ({
              textTransform: 'none',
              borderRadius: 999,
              px: 1.75,
              fontSize: 12,
              borderColor: theme.palette.divider,
              '&:hover': {
                borderColor: theme.palette.primary.main,
              },
            })}
          >
            Clear
          </Button>
        </Box>
      </Box>
      <GlassPanel
        sx={{
          overflow: 'auto',
          p: { xs: 1.5, md: 2 },
        }}
      >
        {networkEvents.length === 0 ? (
          <Box sx={{ py: 4, textAlign: 'center', color: 'text.secondary' }}>
            Waiting for network events from proxy…
          </Box>
        ) : (
          <Stack spacing={1}>
            {filteredNetworkEvents.map((evt, idx) => (
                <Box
                  key={`${evt.ts}-${idx}`}
                  onClick={() => {
                    setSelectedEvent(evt);
                    setActiveTab('headers');
                    setDrawerOpen(true);
                  }}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                    px: 1.5,
                    py: 1,
                    borderRadius: 2,
                    border: (theme) => `1px solid ${theme.palette.divider}`,
                    cursor: 'pointer',
                    '&:hover': {
                      backgroundColor: 'action.hover',
                    },
                  }}
                >
                  <Box sx={{ minWidth: 110 }}>
                    <Typography variant="caption" color="text.secondary">
                      {formatTs(evt.ts)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {evt.durationMs != null ? `${evt.durationMs} ms` : '—'}
                    </Typography>
                  </Box>
                  <Box sx={{ minWidth: 80 }}>
                    <Chip
                      size="small"
                      icon={<CallMadeIcon fontSize="small" />}
                      label={evt.method}
                      variant="filled"
                      color="default"
                      sx={{ textTransform: 'uppercase', borderRadius: 2 }}
                    />
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Tooltip title={evt.url}>
                      <Typography variant="body2" noWrap>
                        {evt.url}
                      </Typography>
                    </Tooltip>
                  </Box>
                  <Box sx={{ minWidth: 90, textAlign: 'right' }}>
                    <Chip
                      size="small"
                      label={evt.status != null ? evt.status : 'Pending'}
                      color={getStatusColor(evt.status)}
                      variant="filled"
                      sx={{ mr: evt.error ? 0.5 : 0, borderRadius: 2, textTransform: 'none' }}
                    />
                    {evt.error && (
                      <Typography component="span" variant="caption" color="text.secondary">
                        {` (${evt.error})`}
                      </Typography>
                    )}
                  </Box>
                </Box>
              ))}
          </Stack>
        )}
      </GlassPanel>

      <Drawer
        anchor="right"
        open={drawerOpen && !!selectedEvent}
        onClose={() => setDrawerOpen(false)}
        PaperProps={{
          sx: {
            width: fullScreen ? '100%' : { xs: '100%', sm: 560 },
            background: (theme) => theme.palette.background.paper,
            border: 'none',
            borderRadius: 0,
            boxShadow: 'none',
            overflow: 'hidden',
            m: 0,
            height: '100%',
          },
        }}
      >
        <Box sx={{ p: 0, height: '100%', display: 'flex', flexDirection: 'column', position: 'relative' }}>
          {/* Accent glow */}
          <Box
            aria-hidden
            sx={(theme) => ({
              position: 'absolute',
              top: -80,
              right: -60,
              width: 220,
              height: 220,
              borderRadius: '50%',
              background: `linear-gradient(135deg, ${theme.palette.info.main}, ${theme.palette.primary.main})`,
              opacity: 0.15,
              filter: 'blur(40px)',
              pointerEvents: 'none',
            })}
          />

          {/* Header */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              p: 2,
              m: 2,
              mb: 0,
              background: (theme) =>
                theme.palette.mode === 'dark'
                  ? 'rgba(255,255,255,0.03)'
                  : 'rgba(0,0,0,0.02)',
              backdropFilter: 'blur(14px) saturate(140%)',
              WebkitBackdropFilter: 'blur(14px) saturate(140%)',
              border: (theme) => `1px solid ${theme.palette.divider}`,
              borderRadius: 2,
              boxShadow: (theme) =>
                `0 6px 20px ${theme.palette.mode === 'dark' ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.08)'}`,
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0, flex: 1 }}>
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography variant="h6" sx={{ fontWeight: 700, letterSpacing: 0.2, lineHeight: 1.2 }}>
                  Request Details
                </Typography>
                {selectedEvent && (
                  <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                    {selectedEvent.method} • {formatTs(selectedEvent.ts)}
                  </Typography>
                )}
              </Box>
            </Box>

            <Box
              sx={{
                display: 'inline-flex',
                gap: 0.5,
                background: (theme) =>
                  theme.palette.mode === 'dark'
                    ? 'rgba(255,255,255,0.04)'
                    : 'rgba(0,0,0,0.03)',
                backdropFilter: 'blur(10px)',
                WebkitBackdropFilter: 'blur(10px)',
                border: (theme) => `1px solid ${theme.palette.divider}`,
                borderRadius: 2,
                px: 0.5,
                py: 0.25,
              }}
            >
              <Tooltip title={copied ? 'Copied!' : 'Copy content'}>
                <IconButton onClick={() => handleCopy(getCurrentTabContent())} size="small" color={copied ? 'success' : 'default'}>
                  <ContentCopyIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <IconButton onClick={() => setFullScreen((v) => !v)} size="small">
                {fullScreen ? <FullscreenExitIcon fontSize="small" /> : <FullscreenIcon fontSize="small" />}
              </IconButton>
              <IconButton onClick={() => setDrawerOpen(false)} size="small">
                <CloseIcon fontSize="small" />
              </IconButton>
            </Box>
          </Box>

          {selectedEvent && (
            <Box sx={{ flex: 1, overflow: 'auto', p: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
              {/* URL & Status Card */}
              <Box
                sx={{
                  p: 2,
                  background: (theme) =>
                    theme.palette.mode === 'dark'
                      ? 'rgba(255,255,255,0.02)'
                      : 'rgba(0,0,0,0.01)',
                  border: (theme) => `1px solid ${theme.palette.divider}`,
                  borderRadius: 2,
                  transition: 'all 0.2s ease',
                  '&:hover': {
                    background: (theme) =>
                      theme.palette.mode === 'dark'
                        ? 'rgba(255,255,255,0.04)'
                        : 'rgba(0,0,0,0.02)',
                    transform: 'translateY(-1px)',
                  },
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5, flexWrap: 'wrap' }}>
                  <Chip
                    size="small"
                    label={selectedEvent.method}
                    variant="filled"
                    sx={{ fontWeight: 600 }}
                  />
                  <Chip
                    size="small"
                    label={selectedEvent.status ?? 'Pending'}
                    color={getStatusColor(selectedEvent.status)}
                    variant="filled"
                    sx={{ fontWeight: 600 }}
                  />
                  {selectedEvent.durationMs != null && (
                    <Chip
                      size="small"
                      label={`${selectedEvent.durationMs} ms`}
                      variant="filled"
                      color="default"
                    />
                  )}
                  {selectedEvent.error && (
                    <Chip
                      size="small"
                      label={selectedEvent.error}
                      color="error"
                      variant="filled"
                    />
                  )}
                </Box>
                <Typography
                  variant="body2"
                  sx={{
                    fontFamily: '"Fira Code", "JetBrains Mono", monospace',
                    fontSize: 12,
                    wordBreak: 'break-all',
                    color: 'text.secondary',
                  }}
                >
                  {selectedEvent.url}
                </Typography>
              </Box>

              {/* Tabs */}
              <Box
                sx={{
                  background: (theme) =>
                    theme.palette.mode === 'dark'
                      ? 'rgba(255,255,255,0.02)'
                      : 'rgba(0,0,0,0.01)',
                  border: (theme) => `1px solid ${theme.palette.divider}`,
                  borderRadius: 2,
                  overflow: 'hidden',
                }}
              >
                <Tabs
                  value={activeTab}
                  onChange={(_event, value) => setActiveTab(value)}
                  variant="fullWidth"
                  sx={{
                    minHeight: 44,
                    '& .MuiTab-root': {
                      minHeight: 44,
                      fontWeight: 600,
                      fontSize: 13,
                    },
                  }}
                >
                  <Tab value="headers" label="Headers" />
                  <Tab value="payload" label="Payload" />
                  <Tab value="response" label="Response" />
                </Tabs>
              </Box>

              {/* Tab Content */}
              <Box
                sx={{
                  flex: 1,
                  p: 2,
                  background: (theme) =>
                    theme.palette.mode === 'dark'
                      ? 'rgba(255,255,255,0.02)'
                      : 'rgba(0,0,0,0.01)',
                  border: (theme) => `1px solid ${theme.palette.divider}`,
                  borderRadius: 2,
                  overflow: 'auto',
                  transition: 'all 0.2s ease',
                  '&:hover': {
                    background: (theme) =>
                      theme.palette.mode === 'dark'
                        ? 'rgba(255,255,255,0.04)'
                        : 'rgba(0,0,0,0.02)',
                  },
                }}
              >
                {activeTab === 'headers' && (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {/* Request Headers */}
                    <Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                        <Typography variant="overline" color="text.secondary">
                          Request Headers
                        </Typography>
                        {selectedEvent.requestHeaders && (
                          <Tooltip title="Copy">
                            <IconButton
                              size="small"
                              onClick={() =>
                                handleCopy(
                                  Object.entries(selectedEvent.requestHeaders!)
                                    .map(([k, v]) => `${k}: ${v}`)
                                    .join('\n')
                                )
                              }
                            >
                              <ContentCopyIcon sx={{ fontSize: 14 }} />
                            </IconButton>
                          </Tooltip>
                        )}
                      </Box>
                      {selectedEvent.requestHeaders ? (
                        <Box
                          sx={{
                            borderRadius: 1.5,
                            border: (theme) => `1px solid ${theme.palette.divider}`,
                            overflow: 'hidden',
                          }}
                        >
                          {Object.entries(selectedEvent.requestHeaders).map(([key, value]) => (
                            <Box
                              key={key}
                              sx={{
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: 2,
                                px: 1.25,
                                py: 0.75,
                                borderBottom: '1px solid',
                                borderColor: 'divider',
                                '&:last-of-type': { borderBottom: 'none' },
                              }}
                            >
                              <Typography
                                variant="caption"
                                color="text.secondary"
                                sx={{ minWidth: 140, fontWeight: 600, wordBreak: 'break-all' }}
                              >
                                {key}
                              </Typography>
                              <Typography
                                variant="body2"
                                sx={{
                                  flex: 1,
                                  wordBreak: 'break-word',
                                  fontFamily: '"Fira Code", "JetBrains Mono", monospace',
                                  fontSize: 12,
                                }}
                              >
                                {Array.isArray(value) ? value.join(', ') : String(value)}
                              </Typography>
                            </Box>
                          ))}
                        </Box>
                      ) : (
                        <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                          No request headers available.
                        </Typography>
                      )}
                    </Box>

                    {/* Response Headers */}
                    <Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                        <Typography variant="overline" color="text.secondary">
                          Response Headers
                        </Typography>
                        {selectedEvent.responseHeaders && (
                          <Tooltip title="Copy">
                            <IconButton
                              size="small"
                              onClick={() =>
                                handleCopy(
                                  Object.entries(selectedEvent.responseHeaders!)
                                    .map(([k, v]) => `${k}: ${v}`)
                                    .join('\n')
                                )
                              }
                            >
                              <ContentCopyIcon sx={{ fontSize: 14 }} />
                            </IconButton>
                          </Tooltip>
                        )}
                      </Box>
                      {selectedEvent.responseHeaders ? (
                        <Box
                          sx={{
                            borderRadius: 1.5,
                            border: (theme) => `1px solid ${theme.palette.divider}`,
                            overflow: 'hidden',
                          }}
                        >
                          {Object.entries(selectedEvent.responseHeaders).map(([key, value]) => (
                            <Box
                              key={key}
                              sx={{
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: 2,
                                px: 1.25,
                                py: 0.75,
                                borderBottom: '1px solid',
                                borderColor: 'divider',
                                '&:last-of-type': { borderBottom: 'none' },
                              }}
                            >
                              <Typography
                                variant="caption"
                                color="text.secondary"
                                sx={{ minWidth: 140, fontWeight: 600, wordBreak: 'break-all' }}
                              >
                                {key}
                              </Typography>
                              <Typography
                                variant="body2"
                                sx={{
                                  flex: 1,
                                  wordBreak: 'break-word',
                                  fontFamily: '"Fira Code", "JetBrains Mono", monospace',
                                  fontSize: 12,
                                }}
                              >
                                {Array.isArray(value) ? value.join(', ') : String(value)}
                              </Typography>
                            </Box>
                          ))}
                        </Box>
                      ) : (
                        <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                          No response headers available.
                        </Typography>
                      )}
                    </Box>
                  </Box>
                )}

                {activeTab === 'payload' && (
                  <Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                      <Typography variant="overline" color="text.secondary">
                        Request Payload
                      </Typography>
                      {selectedEvent.requestBody != null && (
                        <Tooltip title="Copy">
                          <IconButton
                            size="small"
                            onClick={() => handleCopy(JSON.stringify(selectedEvent.requestBody, null, 2))}
                          >
                            <ContentCopyIcon sx={{ fontSize: 14 }} />
                          </IconButton>
                        </Tooltip>
                      )}
                    </Box>
                    {selectedEvent.requestBody != null ? (
                      <Box
                        component="pre"
                        sx={{
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                          fontFamily: '"Fira Code", "JetBrains Mono", monospace',
                          fontSize: 12,
                          lineHeight: 1.6,
                          m: 0,
                          p: 1.5,
                          background: (theme) =>
                            theme.palette.mode === 'dark'
                              ? 'rgba(0,0,0,0.3)'
                              : 'rgba(0,0,0,0.04)',
                          borderRadius: 1.5,
                          maxHeight: 400,
                          overflow: 'auto',
                        }}
                      >
                        {JSON.stringify(selectedEvent.requestBody, null, 2)}
                      </Box>
                    ) : (
                      <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                        No request payload captured.
                      </Typography>
                    )}
                  </Box>
                )}

                {activeTab === 'response' && (
                  <Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                      <Typography variant="overline" color="text.secondary">
                        Response Body
                      </Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {selectedEvent.responseBody != null && isTextLikeResponse && (
                          <Tooltip title="Copy">
                            <IconButton
                              size="small"
                              onClick={() =>
                                handleCopy(
                                  typeof selectedEvent.responseBody === 'string'
                                    ? selectedEvent.responseBody
                                    : JSON.stringify(selectedEvent.responseBody, null, 2)
                                )
                              }
                            >
                              <ContentCopyIcon sx={{ fontSize: 14 }} />
                            </IconButton>
                          </Tooltip>
                        )}
                        {selectedEvent?.responseBody != null && isHtmlResponse && (
                          <Button
                            size="small"
                            variant={showHtmlPreview ? 'contained' : 'outlined'}
                            onClick={() => setShowHtmlPreview((v) => !v)}
                            sx={{ textTransform: 'none' }}
                          >
                            {showHtmlPreview ? 'Hide HTML preview' : 'Render HTML'}
                          </Button>
                        )}
                        {selectedEvent && (
                          <Button
                            component="a"
                            href={selectedEvent.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            size="small"
                            variant="outlined"
                            sx={{ textTransform: 'none' }}
                          >
                            Open in browser
                          </Button>
                        )}
                      </Box>
                    </Box>
                    {selectedEvent.responseBody != null ? (
                      isImageResponse ? (
                        <Box
                          sx={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'flex-start',
                            gap: 1,
                          }}
                        >
                          <Box
                            component="img"
                            src={selectedEvent.url}
                            alt="Response image"
                            sx={{
                              maxWidth: '100%',
                              maxHeight: 360,
                              borderRadius: 1.5,
                              border: (theme) => `1px solid ${theme.palette.divider}`,
                              objectFit: 'contain',
                              backgroundColor: 'background.paper',
                            }}
                          />
                          <Typography variant="caption" color="text.secondary">
                            {responseContentType || 'image/*'}
                          </Typography>
                        </Box>
                      ) : isPdfResponse ? (
                        <Box
                          sx={{
                            borderRadius: 1.5,
                            border: (theme) => `1px solid ${theme.palette.divider}`,
                            overflow: 'hidden',
                            height: 360,
                          }}
                        >
                          <Box
                            component="iframe"
                            src={selectedEvent.url}
                            title="PDF preview"
                            sx={{
                              width: '100%',
                              height: '100%',
                              border: 'none',
                              backgroundColor: 'background.paper',
                            }}
                          />
                        </Box>
                      ) : isVideoResponse ? (
                        <Box
                          sx={{
                            borderRadius: 1.5,
                            border: (theme) => `1px solid ${theme.palette.divider}`,
                            overflow: 'hidden',
                          }}
                        >
                          <Box
                            component="video"
                            src={selectedEvent.url}
                            controls
                            sx={{
                              width: '100%',
                              maxHeight: 360,
                              backgroundColor: 'black',
                            }}
                          />
                        </Box>
                      ) : (
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <Box
                            component="pre"
                            sx={{
                              whiteSpace: 'pre-wrap',
                              wordBreak: 'break-word',
                              fontFamily: '"Fira Code", "JetBrains Mono", monospace',
                              fontSize: 12,
                              lineHeight: 1.6,
                              m: 0,
                              p: 1.5,
                              background: (theme) =>
                                theme.palette.mode === 'dark'
                                  ? 'rgba(0,0,0,0.3)'
                                  : 'rgba(0,0,0,0.04)',
                              borderRadius: 1.5,
                              maxHeight: 400,
                              overflow: 'auto',
                            }}
                          >
                            {typeof selectedEvent.responseBody === 'string'
                              ? selectedEvent.responseBody
                              : JSON.stringify(selectedEvent.responseBody, null, 2)}
                          </Box>
                          {isHtmlResponse && showHtmlPreview && typeof selectedEvent.responseBody === 'string' && (
                            <Box
                              sx={{
                                borderRadius: 1.5,
                                border: (theme) => `1px solid ${theme.palette.divider}`,
                                overflow: 'hidden',
                                height: 360,
                              }}
                            >
                              <Box
                                component="iframe"
                                srcDoc={selectedEvent.responseBody}
                                title="HTML preview"
                                sx={{
                                  width: '100%',
                                  height: '100%',
                                  border: 'none',
                                  backgroundColor: 'background.paper',
                                }}
                              />
                            </Box>
                          )}
                        </Box>
                      )
                    ) : (
                      <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                        No response body captured.
                      </Typography>
                    )}
                  </Box>
                )}
              </Box>
            </Box>
          )}
        </Box>
      </Drawer>
    </Box>
  );
};

export default NetworkPage;
