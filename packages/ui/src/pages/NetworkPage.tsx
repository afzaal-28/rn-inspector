import { Box, Chip, Stack, Typography, Table, TableBody, TableCell, TableHead, TableRow, Tooltip } from '@mui/material';
import GlassPanel from '../ui/GlassPanel';
import { useProxyStream } from '../hooks/useProxyStream';

function formatTs(ts: string) {
  try {
    return new Date(ts).toLocaleTimeString();
  } catch {
    return ts;
  }
}

const NetworkPage = () => {
  const { networkEvents, status, stats } = useProxyStream();

  return (
    <Box sx={{ display: 'flex', gap: 2, flexDirection: 'column' }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Typography variant="h5" fontWeight={600}>
          Network
        </Typography>
        <Chip
          size="small"
          label={`WS: ${status}${stats.networkCount ? ` • ${stats.networkCount} reqs` : ''}`}
          color={status === 'open' ? 'success' : status === 'connecting' ? 'warning' : 'default'}
        />
      </Stack>
      <GlassPanel sx={{ overflow: 'hidden' }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell sx={{ width: 110 }}>Time</TableCell>
              <TableCell sx={{ width: 90 }}>Method</TableCell>
              <TableCell>URL</TableCell>
              <TableCell sx={{ width: 90 }}>Status</TableCell>
              <TableCell sx={{ width: 110 }}>Duration</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {networkEvents.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                  Waiting for network events from proxy…
                </TableCell>
              </TableRow>
            ) : (
              networkEvents
                .slice(-300)
                .reverse()
                .map((evt, idx) => (
                  <TableRow key={`${evt.ts}-${idx}`} hover>
                    <TableCell>{formatTs(evt.ts)}</TableCell>
                    <TableCell>
                      <Chip size="small" label={evt.method} variant="outlined" />
                    </TableCell>
                    <TableCell sx={{ maxWidth: 360 }}>
                      <Tooltip title={evt.url}>
                        <Typography variant="body2" noWrap>
                          {evt.url}
                        </Typography>
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      {evt.status ?? '—'}
                      {evt.error ? ` (${evt.error})` : ''}
                    </TableCell>
                    <TableCell>{evt.durationMs != null ? `${evt.durationMs} ms` : '—'}</TableCell>
                  </TableRow>
                ))
            )}
          </TableBody>
        </Table>
      </GlassPanel>
    </Box>
  );
};

export default NetworkPage;
