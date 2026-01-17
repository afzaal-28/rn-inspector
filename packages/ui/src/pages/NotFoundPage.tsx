import { Box, Button, Stack, Typography } from "@mui/material";
import GlassPanel from "../ui/GlassPanel";
import { useNavigate } from "react-router-dom";

const NotFoundPage = () => {
  const navigate = useNavigate();

  return (
    <Box sx={{ display: "flex", justifyContent: "center", mt: 6 }}>
      <GlassPanel sx={{ maxWidth: 420, textAlign: "center" }}>
        <Stack spacing={2} alignItems="center">
          <Typography variant="h4" fontWeight={700}>
            404
          </Typography>
          <Typography variant="h6">Page not found</Typography>
          <Typography variant="body2" color="text.secondary">
            The page you are looking for doesn’t exist. Go back to the Console
            to continue.
          </Typography>
          <Stack direction="row" spacing={1}>
            <Button variant="contained" onClick={() => navigate("/")}>
              Go to Console
            </Button>
            <Button variant="outlined" onClick={() => navigate(-1)}>
              Go back
            </Button>
          </Stack>
        </Stack>
      </GlassPanel>
    </Box>
  );
};

export default NotFoundPage;
