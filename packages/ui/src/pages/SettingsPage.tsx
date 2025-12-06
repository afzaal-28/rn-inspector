import { Box, Button, FormControlLabel, Stack, Switch, TextField, Typography } from '@mui/material';
import GlassPanel from '../ui/GlassPanel';
import { useTheme } from '../context/ThemeContext';

const SettingsPage = () => {
  const { mode, toggleTheme } = useTheme();

  return (
    <Box sx={{ display: 'flex', gap: 2, flexDirection: 'column', maxWidth: 820 }}>
      <Typography variant="h5" fontWeight={600}>
        Settings
      </Typography>

      <GlassPanel sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Typography variant="subtitle1" fontWeight={600}>
          Appearance
        </Typography>
        <FormControlLabel
          control={<Switch checked={mode === 'dark'} onChange={toggleTheme} />}
          label={`Theme: ${mode === 'dark' ? 'Dark' : 'Light'}`}
        />
      </GlassPanel>

      <GlassPanel sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Typography variant="subtitle1" fontWeight={600}>
          Connection
        </Typography>
        <Stack spacing={2} direction={{ xs: 'column', sm: 'row' }}>
          <TextField label="Proxy WebSocket URL" placeholder="ws://localhost:8081/inspector" fullWidth />
          <Button variant="contained" disabled>
            Connect
          </Button>
        </Stack>
        <TextField label="Log directory" placeholder="~/rn-logs" fullWidth disabled helperText="wire to proxy settings" />
      </GlassPanel>
    </Box>
  );
};

export default SettingsPage;
