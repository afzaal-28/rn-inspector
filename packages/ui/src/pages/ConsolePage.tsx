import { Box, Chip, Stack, Typography, Table, TableBody, TableCell, TableHead, TableRow } from '@mui/material';
import GlassPanel from '../ui/GlassPanel';
import { useProxyStream } from '../hooks/useProxyStream';

const levelColor: Record<string, 'default' | 'primary' | 'warning' | 'error' | 'info' | 'success'> = {
  log: 'default',
  info: 'info',
  warn: 'warning',
  error: 'error',
};

function formatTs(ts: string) {
  try {
    return new Date(ts).toLocaleTimeString();
  } catch {
    return ts;
  }
}

const ConsolePage = () => {
  const { consoleEvents, status, stats } = useProxyStream();

  return (
    <Box sx={{ display: 'flex', gap: 2, flexDirection: 'column' }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Typography variant="h5" fontWeight={600}>
          Console
        </Typography>
        <Chip
          size="small"
          label={`WS: ${status}${stats.consoleCount ? ` • ${stats.consoleCount} logs` : ''}`}
          color={status === 'open' ? 'success' : status === 'connecting' ? 'warning' : 'default'}
        />
      </Stack>
      <GlassPanel sx={{ overflow: 'hidden' }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell sx={{ width: 110 }}>Time</TableCell>
              <TableCell sx={{ width: 90 }}>Level</TableCell>
              <TableCell>Message</TableCell>
              <TableCell sx={{ width: 90 }}>Origin</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {consoleEvents.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                  Waiting for console events from proxy…
                </TableCell>
              </TableRow>
            ) : (
              consoleEvents
                .slice(-300)
                .reverse()
                .map((evt, idx) => (
                  <TableRow key={`${evt.ts}-${idx}`} hover>
                    <TableCell>{formatTs(evt.ts)}</TableCell>
                    <TableCell>
                      <Chip size="small" label={evt.level} color={levelColor[evt.level] ?? 'default'} variant="outlined" />
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: 13 }}>{evt.msg}</TableCell>
                    <TableCell sx={{ color: 'text.secondary' }}>{evt.origin ?? 'metro'}</TableCell>
                  </TableRow>
                ))
            )}
          </TableBody>
        </Table>
      </GlassPanel>
    </Box>
  );
};

export default ConsolePage;
