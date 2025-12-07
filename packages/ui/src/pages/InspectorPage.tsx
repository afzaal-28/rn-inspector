// @ts-nocheck
import React, { useEffect, useMemo, useState, useCallback, memo } from 'react';
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
  IconButton,
  Collapse,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import SearchIcon from '@mui/icons-material/Search';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import GlassPanel from '../ui/GlassPanel';
import { useProxy } from '../context/ProxyContext';
import type { UINode } from '../hooks/useProxyStream';

// Component type colors
const getTypeColor = (type: string | null): string => {
  if (!type) return '#808080';
  const lowerType = type.toLowerCase();
  if (lowerType.includes('view')) return '#61dafb';
  if (lowerType.includes('text')) return '#98c379';
  if (lowerType.includes('image')) return '#c678dd';
  if (lowerType.includes('button') || lowerType.includes('touchable')) return '#e5c07b';
  if (lowerType.includes('scroll')) return '#56b6c2';
  if (lowerType.includes('input') || lowerType.includes('textinput')) return '#d19a66';
  if (lowerType === 'hostroot' || lowerType === 'root') return '#abb2bf';
  return '#e06c75';
};

type UITreeNodeProps = {
  node: UINode;
  depth?: number;
  selectedNode: UINode | null;
  onSelectNode: (node: UINode) => void;
  searchQuery: string;
};

const UITreeNode = memo(function UITreeNode({
  node,
  depth = 0,
  selectedNode,
  onSelectNode,
  searchQuery,
}: UITreeNodeProps) {
  const [expanded, setExpanded] = useState(depth < 3);
  const hasChildren = node.children && node.children.length > 0;
  const isSelected = selectedNode === node;
  const handleToggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded((prev) => !prev);
  }, []);

  const handleSelect = useCallback(() => {
    onSelectNode(node);
  }, [node, onSelectNode]);

  const matchesSearch = useMemo(() => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    if (node.type?.toLowerCase().includes(query)) return true;
    if (node.props) {
      for (const [key, value] of Object.entries(node.props)) {
        if (key.toLowerCase().includes(query)) return true;
        if (typeof value === 'string' && value.toLowerCase().includes(query)) return true;
      }
    }
    return false;
  }, [node, searchQuery]);

  const childrenMatchSearch = useMemo(() => {
    if (!searchQuery.trim()) return true;
    const checkChildren = (n: UINode): boolean => {
      const query = searchQuery.toLowerCase();
      if (n.type?.toLowerCase().includes(query)) return true;
      if (n.props) {
        for (const [key, value] of Object.entries(n.props)) {
          if (key.toLowerCase().includes(query)) return true;
          if (typeof value === 'string' && value.toLowerCase().includes(query)) return true;
        }
      }
      return n.children?.some(checkChildren) || false;
    };
    return node.children?.some(checkChildren) || false;
  }, [node.children, searchQuery]);

  if (!matchesSearch && !childrenMatchSearch) return null;

  return (
    <Box sx={{ pl: depth > 0 ? 2 : 0 }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          cursor: 'pointer',
          py: 0.5,
          px: 0.5,
          borderRadius: 0.5,
          backgroundColor: isSelected ? 'action.selected' : 'transparent',
          '&:hover': { backgroundColor: isSelected ? 'action.selected' : 'action.hover' },
          opacity: matchesSearch ? 1 : 0.5,
        }}
        onClick={handleSelect}
      >
        {hasChildren ? (
          <IconButton size="small" sx={{ p: 0, mr: 0.5 }} onClick={handleToggle}>
            {expanded ? (
              <ExpandMoreIcon sx={{ fontSize: 16 }} />
            ) : (
              <ChevronRightIcon sx={{ fontSize: 16 }} />
            )}
          </IconButton>
        ) : (
          <Box sx={{ width: 20, mr: 0.5 }} />
        )}
        <Typography
          component="span"
          sx={{
            fontFamily: 'monospace',
            fontSize: 12,
            color: getTypeColor(node.type),
            fontWeight: 500,
          }}
        >
          {node.type || 'Unknown'}
        </Typography>
        {node.key && (
          <Typography
            component="span"
            sx={{ fontFamily: 'monospace', fontSize: 11, color: 'text.secondary', ml: 1 }}
          >
            key="{node.key}"
          </Typography>
        )}
        {node.props?.testID && (
          <Chip
            size="small"
            label={`testID: ${String(node.props.testID)}`}
            sx={{ ml: 1, height: 18, fontSize: 10 }}
          />
        )}
        {node.props?.text && (
          <Typography
            component="span"
            sx={{
              fontFamily: 'monospace',
              fontSize: 11,
              color: '#98c379',
              ml: 1,
              maxWidth: 200,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            "{String(node.props.text).slice(0, 30)}{String(node.props.text).length > 30 ? '...' : ''}"
          </Typography>
        )}
      </Box>
      {hasChildren && (
        <Collapse in={expanded} timeout="auto" unmountOnExit>
          <Box sx={{ borderLeft: '1px solid', borderColor: 'divider', ml: 1 }}>
            {node.children?.map((child, index) => (
              <UITreeNode
                key={`${child.type}-${index}`}
                node={child}
                depth={depth + 1}
                selectedNode={selectedNode}
                onSelectNode={onSelectNode}
                searchQuery={searchQuery}
              />
            ))}
          </Box>
        </Collapse>
      )}
    </Box>
  );
});

export default function InspectorPage() {
  const { inspectorData, fetchUI, devices, activeDeviceId, setActiveDeviceId, status } = useProxy();
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNode, setSelectedNode] = useState<UINode | null>(null);

  // Get inspector data for the active device
  const currentInspector = useMemo(() => {
    if (!activeDeviceId) return null;
    return inspectorData.get(activeDeviceId) || null;
  }, [inspectorData, activeDeviceId]);

  const handleRefresh = useCallback(() => {
    if (!activeDeviceId) return;
    setLoading(true);
    setSelectedNode(null);
    fetchUI(activeDeviceId);
    setTimeout(() => setLoading(false), 3000);
  }, [fetchUI, activeDeviceId]);

  // Auto-fetch on mount and when device changes
  useEffect(() => {
    if (status === 'open') {
      handleRefresh();
    }
  }, [activeDeviceId, status]);

  // Clear loading when data arrives
  useEffect(() => {
    if (currentInspector) {
      setLoading(false);
    }
  }, [currentInspector]);

  const handleSelectNode = useCallback((node: UINode) => {
    setSelectedNode(node);
  }, []);

  // Count total nodes
  const nodeCount = useMemo(() => {
    if (!currentInspector?.hierarchy) return 0;
    const count = (node: UINode): number => {
      return 1 + (node.children?.reduce((acc, child) => acc + count(child), 0) || 0);
    };
    return count(currentInspector.hierarchy);
  }, [currentInspector?.hierarchy]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, height: 'calc(100vh - 120px)' }}>
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
              UI Inspector
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Inspect React Native component hierarchy
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
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
        {currentInspector && (
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Chip
              size="small"
              label={`Last updated: ${new Date(currentInspector.ts).toLocaleTimeString()}`}
              variant="filled"
            />
            <Chip
              size="small"
              label={`${nodeCount} components`}
              variant="filled"
            />
            {currentInspector.deviceId && (
              <Chip
                size="small"
                label={devices.find(d => d.id === currentInspector.deviceId)?.label || currentInspector.deviceId}
                variant="filled"
              />
            )}
          </Box>
        )}
      </Box>

      {/* Main Content */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', md: 'row' },
          gap: 2,
          flex: 1,
          minHeight: 0,
        }}
      >
        {/* Component Tree */}
        <Box sx={{ flexBasis: { xs: '100%', md: '58%' }, minHeight: 0, display: 'flex' }}>
          <GlassPanel
            sx={{
              width: '100%',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              gap: 1.5,
              p: { xs: 1.5, md: 2 },
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <AccountTreeIcon color="primary" />
                <Typography variant="subtitle1" fontWeight={600}>
                  Component Tree
                </Typography>
              </Box>
              <TextField
                size="small"
                placeholder="Search components..."
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
                  width: 200,
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
              {!currentInspector ? (
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                  <Typography color="text.secondary">
                    {status !== 'open' ? 'Connect to a device to inspect UI' : 'Click Refresh to fetch component tree'}
                  </Typography>
                </Box>
              ) : currentInspector.error ? (
                <Box sx={{ p: 2 }}>
                  <Typography color="error.main" variant="body2">
                    {currentInspector.error}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                    Make sure your React Native app is running with debugging enabled.
                  </Typography>
                </Box>
              ) : currentInspector.hierarchy && (currentInspector.hierarchy as any).note ? (
                <Box sx={{ p: 2 }}>
                  <Typography variant="body2" fontWeight={600} gutterBottom>
                    Component tree not available
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    {(currentInspector.hierarchy as any).note || 'The Inspector prototype could not access the component tree from this debugger.'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                    This experimental UI Inspector depends on internal React DevTools hooks and may not work in all
                    React Native debugger setups. There is no additional code you need to add to your app; full UI
                    inspection will require deeper integration (similar to official React DevTools for React Native).
                  </Typography>
                </Box>
              ) : currentInspector.hierarchy ? (
                <UITreeNode
                  node={currentInspector.hierarchy}
                  selectedNode={selectedNode}
                  onSelectNode={handleSelectNode}
                  searchQuery={searchQuery}
                />
              ) : (
                <Typography color="text.secondary" sx={{ p: 2 }}>
                  No component tree available
                </Typography>
              )}
            </Box>
          </GlassPanel>
        </Box>

        {/* Properties Panel */}
        <Box sx={{ flexBasis: { xs: '100%', md: '42%' }, minHeight: 0, display: 'flex' }}>
          <GlassPanel
            sx={{
              width: '100%',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              gap: 1.5,
              p: { xs: 1.5, md: 2 },
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="subtitle1" fontWeight={600}>
                Properties
              </Typography>
              {selectedNode && (
                <Chip
                  size="small"
                  variant='filled'
                  label={selectedNode.type || 'Unknown'}
                />
              )}
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
              {!selectedNode ? (
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                  <Typography color="text.secondary">
                    Select a component to view its properties
                  </Typography>
                </Box>
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  {/* Component Info */}
                  <Box>
                    <Typography variant="overline" color="text.secondary">
                      Component
                    </Typography>
                    <Typography
                      sx={{
                        fontFamily: 'monospace',
                        fontSize: 14,
                        color: getTypeColor(selectedNode.type),
                        fontWeight: 600,
                      }}
                    >
                      {selectedNode.type || 'Unknown'}
                    </Typography>
                  </Box>

                  {selectedNode.key && (
                    <Box>
                      <Typography variant="overline" color="text.secondary">
                        Key
                      </Typography>
                      <Typography sx={{ fontFamily: 'monospace', fontSize: 13 }}>
                        {selectedNode.key}
                      </Typography>
                    </Box>
                  )}

                  {/* Props */}
                  {selectedNode.props && Object.keys(selectedNode.props).length > 0 && (
                    <Box>
                      <Typography variant="overline" color="text.secondary">
                        Props
                      </Typography>
                      <Box
                        sx={{
                          mt: 0.5,
                          p: 1.5,
                          background: (theme) =>
                            theme.palette.mode === 'dark'
                              ? 'rgba(0,0,0,0.3)'
                              : 'rgba(0,0,0,0.04)',
                          borderRadius: 1,
                          fontFamily: 'monospace',
                          fontSize: 12,
                        }}
                      >
                        {Object.entries(selectedNode.props).map(([key, value]) => (
                          <Box key={key} sx={{ display: 'flex', gap: 1, py: 0.25 }}>
                            <Typography
                              component="span"
                              sx={{ color: '#9cdcfe', fontFamily: 'monospace', fontSize: 12 }}
                            >
                              {key}:
                            </Typography>
                            <Typography
                              component="span"
                              sx={{
                                fontFamily: 'monospace',
                                fontSize: 12,
                                color: typeof value === 'string' ? '#ce9178' : '#b5cea8',
                                wordBreak: 'break-word',
                              }}
                            >
                              {typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}
                            </Typography>
                          </Box>
                        ))}
                      </Box>
                    </Box>
                  )}

                  {/* Children count */}
                  {selectedNode.children && selectedNode.children.length > 0 && (
                    <Box>
                      <Typography variant="overline" color="text.secondary">
                        Children
                      </Typography>
                      <Typography sx={{ fontFamily: 'monospace', fontSize: 13 }}>
                        {selectedNode.children.length} child component{selectedNode.children.length !== 1 ? 's' : ''}
                      </Typography>
                    </Box>
                  )}

                  {/* Note if present */}
                  {selectedNode.note && (
                    <Box
                      sx={{
                        p: 1.5,
                        background: (theme) =>
                          theme.palette.mode === 'dark'
                            ? 'rgba(255,193,7,0.1)'
                            : 'rgba(255,193,7,0.15)',
                        borderRadius: 1,
                        border: '1px solid',
                        borderColor: 'warning.main',
                      }}
                    >
                      <Typography variant="caption" color="warning.main">
                        {selectedNode.note}
                      </Typography>
                    </Box>
                  )}
                </Box>
              )}
            </Box>
          </GlassPanel>
        </Box>
      </Box>
    </Box>
  );
}
