import { useState, useCallback, memo, useEffect } from 'react';
import { Box, IconButton, Typography, Collapse } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';

type JsonTreeViewProps = {
  data: unknown;
  name?: string;
  defaultExpanded?: boolean;
  depth?: number;
  maxDepth?: number;
  searchQuery?: string;
};

const getValueColor = (value: unknown): string => {
  if (value === null) return '#808080';
  if (value === undefined) return '#808080';
  if (typeof value === 'string') return '#ce9178';
  if (typeof value === 'number') return '#b5cea8';
  if (typeof value === 'boolean') return '#569cd6';
  return 'inherit';
};

const getTypeLabel = (value: unknown): string => {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (Array.isArray(value)) return `Array(${value.length})`;
  if (typeof value === 'object') return `Object`;
  return typeof value;
};

const formatValue = (value: unknown): string => {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return `"${value}"`;
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return String(value);
  return String(value);
};

const isExpandable = (value: unknown): boolean => {
  if (value === null || value === undefined) return false;
  if (typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.length > 0;
  return Object.keys(value).length > 0;
};

const JsonTreeNode = memo(function JsonTreeNode({
  data,
  name,
  defaultExpanded = false,
  depth = 0,
  maxDepth = 10,
  searchQuery = '',
}: JsonTreeViewProps) {
  const q = searchQuery.trim().toLowerCase();

  const hasMatch = useCallback(
    (value: unknown, keyName?: string): boolean => {
      if (!q) return false;

      if (typeof keyName === 'string' && keyName.toLowerCase().includes(q)) return true;

      if (value === null || value === undefined) return false;
      const t = typeof value;
      if (t === 'string') return (value as string).toLowerCase().includes(q);
      if (t === 'number' || t === 'boolean' || t === 'bigint')
        return String(value).toLowerCase().includes(q);
      if (Array.isArray(value)) return value.some((item) => hasMatch(item));
      if (t === 'object')
        return Object.entries(value as Record<string, unknown>).some(([k, v]) => hasMatch(v, k));
      return false;
    },
    [q],
  );

  const expandable = isExpandable(data);
  const selfOrDescendantMatch = q ? hasMatch(data, name) : false;

  const [expanded, setExpanded] = useState((defaultExpanded && depth < 2) || selfOrDescendantMatch);

  useEffect(() => {
    if (!q) {
      setExpanded(defaultExpanded && depth < 2);
    } else if (selfOrDescendantMatch) {
      setExpanded(true);
    }
  }, [q, selfOrDescendantMatch, defaultExpanded, depth]);

  const handleToggle = useCallback(() => {
    setExpanded((prev) => !prev);
  }, []);

  if (depth > maxDepth) {
    return (
      <Typography
        component="span"
        sx={{ fontFamily: 'monospace', fontSize: 12, color: '#808080' }}
      >
        [Max depth exceeded]
      </Typography>
    );
  }

  // Render primitive values
  if (!expandable) {
    return (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          pl: depth > 0 ? 2.5 : 0,
          py: 0.25,
        }}
      >
        {name !== undefined && (
          <>
            <Typography
              component="span"
              sx={{
                fontFamily: 'monospace',
                fontSize: 12,
                color: '#9cdcfe',
                backgroundColor: q && name?.toLowerCase().includes(q) ? 'rgba(255, 193, 7, 0.25)' : 'transparent',
              }}
            >
              {name}
            </Typography>
            <Typography
              component="span"
              sx={{ fontFamily: 'monospace', fontSize: 12, color: 'text.secondary' }}
            >
              :
            </Typography>
          </>
        )}
        <Typography
          component="span"
          sx={{
            fontFamily: 'monospace',
            fontSize: 12,
            color: getValueColor(data),
            backgroundColor:
              q && typeof data === 'string' && data.toLowerCase().includes(q) ? 'rgba(255, 193, 7, 0.25)' : 'transparent',
            wordBreak: 'break-word',
          }}
        >
          {formatValue(data)}
        </Typography>
      </Box>
    );
  }

  // Render expandable objects/arrays
  const isArray = Array.isArray(data);
  const entries = isArray
    ? (data as unknown[]).map((v, i) => [String(i), v] as [string, unknown])
    : Object.entries(data as Record<string, unknown>);

  return (
    <Box sx={{ pl: depth > 0 ? 2 : 0 }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          cursor: 'pointer',
          '&:hover': { backgroundColor: 'action.hover' },
          borderRadius: 1,
          py: 0.25,
        }}
        onClick={handleToggle}
      >
        <IconButton size="small" sx={{ p: 0, mr: 0.5 }}>
          {expanded ? (
            <ExpandMoreIcon sx={{ fontSize: 16 }} />
          ) : (
            <ChevronRightIcon sx={{ fontSize: 16 }} />
          )}
        </IconButton>
        {name !== undefined && (
          <>
            <Typography
              component="span"
              sx={{
                fontFamily: 'monospace',
                fontSize: 12,
                color: '#9cdcfe',
                backgroundColor: q && (name?.toLowerCase().includes(q) || selfOrDescendantMatch) ? 'rgba(255, 193, 7, 0.25)' : 'transparent',
              }}
            >
              {name}
            </Typography>
            <Typography
              component="span"
              sx={{ fontFamily: 'monospace', fontSize: 12, color: 'text.secondary', mx: 0.5 }}
            >
              :
            </Typography>
          </>
        )}
        <Typography
          component="span"
          sx={{ fontFamily: 'monospace', fontSize: 12, color: 'text.secondary' }}
        >
          {getTypeLabel(data)}
        </Typography>
        {!expanded && (
          <Typography
            component="span"
            sx={{ fontFamily: 'monospace', fontSize: 12, color: 'text.disabled', ml: 1 }}
          >
            {isArray ? '[...]' : '{...}'}
          </Typography>
        )}
      </Box>
      <Collapse in={expanded} timeout="auto" unmountOnExit>
        <Box sx={{ borderLeft: '1px solid', borderColor: 'divider', ml: 1 }}>
          {entries.map(([key, value]) => (
            <JsonTreeNode
              key={key}
              data={value}
              name={key}
              depth={depth + 1}
              maxDepth={maxDepth}
              searchQuery={searchQuery}
            />
          ))}
        </Box>
      </Collapse>
    </Box>
  );
});

export default function JsonTreeView({
  data,
  name,
  defaultExpanded = true,
  maxDepth = 10,
  searchQuery = '',
}: JsonTreeViewProps) {
  if (Array.isArray(data) && name === undefined) {
    return (
      <Box sx={{ fontFamily: 'monospace', fontSize: 12 }}>
        {data.map((item, index) => (
          <JsonTreeNode
            key={index}
            data={item}
            name={data.length > 1 ? `[${index}]` : undefined}
            defaultExpanded={defaultExpanded}
            depth={0}
            maxDepth={maxDepth}
            searchQuery={searchQuery}
          />
        ))}
      </Box>
    );
  }

  return (
    <Box sx={{ fontFamily: 'monospace', fontSize: 12 }}>
      <JsonTreeNode
        data={data}
        name={name}
        defaultExpanded={defaultExpanded}
        depth={0}
        maxDepth={maxDepth}
        searchQuery={searchQuery}
      />
    </Box>
  );
}
