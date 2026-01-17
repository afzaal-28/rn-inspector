import { useMemo, useState, useEffect, useRef } from "react";
import {
  Box,
  Typography,
  Button,
  Stack,
  Paper,
  Chip,
  Divider,
  Popper,
  ClickAwayListener,
  MenuItem,
} from "@mui/material";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import StopIcon from "@mui/icons-material/Stop";
import SyncIcon from "@mui/icons-material/Sync";
import InfoIcon from "@mui/icons-material/Info";
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";
import { useProxy } from "../context/ProxyContext";
import GlassPanel from "../ui/GlassPanel";

const mirrorPlatforms: Array<{
  value: "android" | "ios" | "ios-sim" | "ios-device";
  label: string;
}> = [
  { value: "android", label: "Android (adb/scrcpy)" },
  { value: "ios-sim", label: "iOS Simulator (xcrun simctl)" },
  { value: "ios-device", label: "iOS Device (xcrun, requires trust)" },
  { value: "ios", label: "iOS (auto)" },
];

export default function DevicePage() {
  const { devices, activeDeviceId, mirrorData, startMirror, stopMirror } =
    useProxy();

  const [platform, setPlatform] = useState<
    "android" | "ios" | "ios-sim" | "ios-device"
  >("android");
  // @ts-ignore
  const [fps, setFps] = useState<number | null>(null);
  const lastFrameTsRef = useRef<number | null>(null);
  const [platformAnchor, setPlatformAnchor] = useState<HTMLElement | null>(
    null,
  );
  const platformOpen = Boolean(platformAnchor);

  const currentDevice = useMemo(
    () => devices.find((d) => d.id === activeDeviceId) || null,
    [devices, activeDeviceId],
  );

  const mirror = useMemo(() => {
    if (!activeDeviceId) return null;
    return mirrorData.get(activeDeviceId) || null;
  }, [mirrorData, activeDeviceId]);

  // crude FPS estimator based on incoming frames
  useEffect(() => {
    const ts = mirror?.ts ? Date.parse(mirror.ts) : null;
    if (!ts) return;
    const last = lastFrameTsRef.current;
    lastFrameTsRef.current = ts;
    if (last) {
      const delta = ts - last;
      if (delta > 0) setFps(Math.round(1000 / delta));
    }
  }, [mirror?.ts]);

  const handleStart = () => {
    if (!activeDeviceId) return;
    startMirror(platform, activeDeviceId);
  };

  const handleStop = () => {
    if (!activeDeviceId) return;
    stopMirror(activeDeviceId);
  };

  const handlePlatformToggle = (event: React.MouseEvent<HTMLElement>) => {
    setPlatformAnchor(platformOpen ? null : event.currentTarget);
  };

  const handlePlatformSelect = (
    value: "android" | "ios" | "ios-sim" | "ios-device",
  ) => {
    setPlatform(value);
    setPlatformAnchor(null);
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
        {/* Device details */}
        <GlassPanel
          sx={{
            flex: 1,
            minWidth: 320,
            display: "flex",
            flexDirection: "column",
            gap: 1,
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <InfoIcon fontSize="small" />
            <Typography variant="subtitle1" fontWeight={600}>
              Device Details
            </Typography>
          </Box>
          <Divider />
          <Stack spacing={0.5}>
            <Typography variant="body2" color="text.secondary">
              ID: {currentDevice?.id || "—"}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Label: {currentDevice?.label || "—"}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              DevTools URL: {currentDevice?.url || "—"}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Mirror platform: {platform}
            </Typography>
          </Stack>
          <Divider />
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={1}
            alignItems="center"
          >
            <Button
              variant="outlined"
              size="small"
              endIcon={<ArrowDropDownIcon />}
              onClick={handlePlatformToggle}
              sx={{
                maxWidth: "100%",
                justifyContent: "space-between",
              }}
            >
              <Typography
                sx={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {mirrorPlatforms.find((p) => p.value === platform)?.label ||
                  "Select platform"}
              </Typography>
            </Button>

            <Popper
              open={platformOpen}
              anchorEl={platformAnchor}
              placement="bottom-start"
              sx={{ zIndex: (theme) => theme.zIndex.tooltip }}
            >
              <ClickAwayListener onClickAway={() => setPlatformAnchor(null)}>
                <Box
                  sx={(theme) => ({
                    minWidth: 220,
                    maxHeight: 260,
                    overflowY: "auto",
                    borderRadius: 1.5,
                    mt: 1,
                    border: `1px solid ${theme.palette.divider}`,
                    backgroundColor: theme.palette.background.paper,
                    p: 0.5,
                  })}
                >
                  {mirrorPlatforms.map((p) => (
                    <MenuItem
                      key={p.value}
                      selected={platform === p.value}
                      onClick={() => handlePlatformSelect(p.value)}
                      sx={{ borderRadius: 1 }}
                    >
                      {p.label}
                    </MenuItem>
                  ))}
                </Box>
              </ClickAwayListener>
            </Popper>
          </Stack>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={1}
            alignItems="center"
            sx={{ mt: 1 }}
          >
            <Button
              variant="contained"
              size="small"
              startIcon={<PlayArrowIcon />}
              onClick={handleStart}
              disabled={!activeDeviceId}
            >
              Start
            </Button>
            <Button
              variant="outlined"
              size="small"
              color="error"
              startIcon={<StopIcon />}
              onClick={handleStop}
              disabled={!activeDeviceId}
            >
              Stop
            </Button>
            <Button
              variant="text"
              size="small"
              startIcon={<SyncIcon />}
              onClick={() => setPlatform(platform)}
            >
              Refresh
            </Button>
          </Stack>
          <Divider />
          <Paper
            variant="outlined"
            sx={{
              p: 1.5,
              background: (theme) =>
                theme.palette.mode === "dark"
                  ? "rgba(255,255,255,0.03)"
                  : "rgba(0,0,0,0.02)",
              fontFamily: "monospace",
              fontSize: 12,
              whiteSpace: "pre-wrap",
            }}
          >
            {`Requirements:
- Build the Rust mirror binary in packages/cli/src/bin/mirror-rs
- Copy binaries to packages/cli/src/bin/<platform>
- Run a device-side companion (MediaProjection / ReplayKit) that streams frames

Notes:
- Mirror uses a live video stream (no screenshot polling)
- Errors from the mirror binary are surfaced in the UI panel below.`}
          </Paper>
        </GlassPanel>

        {/* Mirror panel */}
        <GlassPanel
          sx={{
            flex: 2,
            minHeight: 360,
            display: "flex",
            flexDirection: "column",
            gap: 1,
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Typography variant="subtitle1" fontWeight={600}>
              Live Screen Mirror
            </Typography>
            {mirror?.ts && (
              <Chip
                size="small"
                label={`Updated ${new Date(mirror.ts).toLocaleTimeString()}`}
                variant="outlined"
              />
            )}
            {mirror?.error && (
              <Chip
                size="small"
                color="error"
                label={mirror.error}
                variant="filled"
              />
            )}
          </Box>
          <Box
            sx={{
              flex: 1,
              minHeight: 300,
              borderRadius: 2,
              border: (theme) => `1px solid ${theme.palette.divider}`,
              background: (theme) =>
                mirror?.frame
                  ? theme.palette.background.paper
                  : theme.palette.mode === "dark"
                    ? "rgba(255,255,255,0.02)"
                    : "rgba(0,0,0,0.02)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
              position: "relative",
            }}
          >
            {mirror?.frame ? (
              <Box
                component="img"
                src={mirror.frame}
                alt="Mirror frame"
                sx={{ width: "100%", height: "100%", objectFit: "contain" }}
              />
            ) : (
              <Typography color="text.secondary" variant="body2">
                {mirror?.error
                  ? mirror.error
                  : activeDeviceId
                    ? "No frame yet. Click Start mirror."
                    : "Select a device to start mirroring."}
              </Typography>
            )}
          </Box>
        </GlassPanel>
      </Stack>
    </Box>
  );
}
