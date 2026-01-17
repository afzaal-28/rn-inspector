import { Box, Typography, Button, Stack } from "@mui/material";
import GlassPanel from "../ui/GlassPanel";

const SessionsPage = () => {
  return (
    <Box sx={{ display: "flex", gap: 2, flexDirection: "column" }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Typography variant="h5" fontWeight={600}>
          Sessions
        </Typography>
        <Button variant="contained" size="small" disabled>
          Export latest
        </Button>
      </Stack>
      <GlassPanel>
        <Typography variant="body2" color="text.secondary">
          Saved sessions will appear here. Wire to proxy storage to list and
          export logs.
        </Typography>
      </GlassPanel>
    </Box>
  );
};

export default SessionsPage;
