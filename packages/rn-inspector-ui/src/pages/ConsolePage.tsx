import { useMemo, useState } from "react";
import {
  Box,
  Chip,
  Stack,
  Typography,
  Tabs,
  Tab,
  Drawer,
  IconButton,
  Tooltip,
  TextField,
  InputAdornment,
  Button,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import FullscreenIcon from "@mui/icons-material/Fullscreen";
import FullscreenExitIcon from "@mui/icons-material/FullscreenExit";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import NotesIcon from "@mui/icons-material/Notes";
import GlassPanel from "../ui/GlassPanel";
import JsonTreeView from "../components/JsonTreeView";
import type { ConsoleEvent } from "../hooks/useProxyStream";
import { useProxy } from "../context/ProxyContext";
import SearchIcon from "@mui/icons-material/Search";

const levelColor: Record<
  string,
  "default" | "primary" | "warning" | "error" | "info" | "success"
> = {
  log: "default",
  info: "info",
  warn: "warning",
  error: "error",
};

const getLevelIcon = (level: string) => {
  switch (level) {
    case "error":
      return <ErrorOutlineIcon fontSize="small" />;
    case "warn":
      return <WarningAmberIcon fontSize="small" />;
    case "info":
      return <InfoOutlinedIcon fontSize="small" />;
    default:
      return <NotesIcon fontSize="small" />;
  }
};

function formatTs(ts: string) {
  try {
    return new Date(ts).toLocaleTimeString();
  } catch {
    return ts;
  }
}

const ConsolePage = () => {
  const {
    consoleEvents,
    activeDeviceId,
    consoleClearedAtMs,
    setConsoleClearedAtMs,
  } = useProxy();
  const [levelFilter, setLevelFilter] = useState<
    "all" | "log" | "info" | "warn" | "error"
  >("all");
  const [selectedEvent, setSelectedEvent] = useState<ConsoleEvent | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [fullScreen, setFullScreen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const handleCopyMessage = () => {
    if (selectedEvent?.msg) {
      navigator.clipboard.writeText(selectedEvent.msg);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const filteredEvents = useMemo(() => {
    let latest = consoleEvents.slice(-300);

    if (consoleClearedAtMs) {
      latest = latest.filter((evt) => {
        const tsMs = Date.parse(evt.ts);
        if (Number.isNaN(tsMs)) return true;
        return tsMs > consoleClearedAtMs;
      });
    }

    latest = latest.reverse();

    let byLevel =
      levelFilter === "all"
        ? latest
        : latest.filter((evt) => evt.level === levelFilter);

    if (activeDeviceId) {
      byLevel = byLevel.filter(
        (evt) => !evt.deviceId || evt.deviceId === activeDeviceId,
      );
    }

    const query = searchQuery.trim().toLowerCase();
    if (query) {
      byLevel = byLevel.filter((evt) => evt.msg.toLowerCase().includes(query));
    }

    return byLevel;
  }, [
    consoleEvents,
    levelFilter,
    activeDeviceId,
    searchQuery,
    consoleClearedAtMs,
  ]);

  const groupedEvents = useMemo(() => {
    const groups = new Map<
      string,
      {
        event: ConsoleEvent;
        count: number;
      }
    >();

    filteredEvents.forEach((evt) => {
      const key = `${evt.level}|${evt.origin ?? "metro"}|${evt.deviceId ?? ""}|${evt.msg}`;
      const existing = groups.get(key);
      if (existing) {
        existing.count += 1;
        // Prefer the latest timestamp for the representative event
        const prevTs = Date.parse(existing.event.ts);
        const currentTs = Date.parse(evt.ts);
        if (
          !Number.isNaN(currentTs) &&
          (Number.isNaN(prevTs) || currentTs > prevTs)
        ) {
          existing.event = evt;
        }
      } else {
        groups.set(key, { event: evt, count: 1 });
      }
    });

    return Array.from(groups.values());
  }, [filteredEvents]);

  const handleClear = () => {
    if (consoleEvents.length > 0) {
      const last = consoleEvents[consoleEvents.length - 1];
      const lastMs = Date.parse(last.ts);
      setConsoleClearedAtMs(Number.isNaN(lastMs) ? Date.now() : lastMs);
    } else {
      setConsoleClearedAtMs(Date.now());
    }
    setSelectedEvent(null);
    setDrawerOpen(false);
  };

  return (
    <Box sx={{ display: "flex", gap: 2, flexDirection: "column" }}>
      <Box
        sx={{
          p: 2,
          borderRadius: 2,
          background: (theme) =>
            theme.palette.mode === "dark"
              ? "rgba(255,255,255,0.03)"
              : "rgba(0,0,0,0.02)",
          border: (theme) => `1px solid ${theme.palette.divider}`,
          boxShadow: (theme) =>
            `0 6px 18px ${theme.palette.mode === "dark" ? "rgba(0,0,0,0.35)" : "rgba(0,0,0,0.08)"}`,
          display: "flex",
          flexDirection: "column",
          gap: 1.5,
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 1.5,
          }}
        >
          <Box sx={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
            <Typography variant="h5" fontWeight={600}>
              Console
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Live logs from proxy
            </Typography>
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.25 }}>
            <Box
              sx={(theme) => ({
                display: "flex",
                alignItems: "center",
                gap: 1,
                px: 1,
                py: 0.5,
                borderRadius: 999,
                backdropFilter: "blur(14px) saturate(130%)",
                WebkitBackdropFilter: "blur(14px) saturate(130%)",
                border: `1px solid ${theme.palette.divider}`,
              })}
            >
              <TextField
                size="small"
                placeholder="Search logs"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                variant="outlined"
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon fontSize="small" />
                    </InputAdornment>
                  ),
                }}
                sx={{
                  minWidth: 260,
                  "& .MuiOutlinedInput-root": {
                    borderRadius: 999,
                    border: "none",
                    px: 1,
                    py: 0.25,
                    "& fieldset": {
                      border: "none",
                    },
                    "&:hover fieldset": {
                      border: "none",
                    },
                    "&.Mui-focused fieldset": {
                      border: "none",
                    },
                    "&.Mui-focused": {
                      boxShadow: "none",
                      outline: "none",
                    },
                  },
                }}
              />
            </Box>
            <Button
              size="small"
              variant="outlined"
              onClick={handleClear}
              disabled={consoleEvents.length === 0}
              sx={(theme) => ({
                textTransform: "none",
                borderRadius: 999,
                px: 1.75,
                fontSize: 12,
                borderColor: theme.palette.divider,
                "&:hover": {
                  borderColor: theme.palette.primary.main,
                },
              })}
            >
              Clear
            </Button>
          </Box>
        </Box>
        <Tabs
          value={levelFilter}
          onChange={(_event, value) => setLevelFilter(value)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{
            minHeight: 40,
            "& .MuiTab-root": {
              minHeight: 40,
              fontWeight: 600,
              fontSize: 13,
              textTransform: "none",
            },
          }}
        >
          <Tab value="all" label="All" />
          <Tab value="log" label="Log" />
          <Tab value="info" label="Info" />
          <Tab value="warn" label="Warn" />
          <Tab value="error" label="Error" />
        </Tabs>
      </Box>
      <GlassPanel
        sx={{
          overflow: "auto",
          p: { xs: 1.5, md: 2 },
        }}
      >
        {groupedEvents.length === 0 ? (
          <Box sx={{ py: 4, textAlign: "center", color: "text.secondary" }}>
            Waiting for console events from proxy…
          </Box>
        ) : (
          <Stack spacing={1}>
            {groupedEvents.map(({ event: evt, count }, idx) => (
              <Box
                key={`${evt.ts}-${idx}`}
                onClick={() => {
                  setSelectedEvent(evt);
                  setDrawerOpen(true);
                }}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1.5,
                  px: 1.5,
                  py: 1,
                  borderRadius: 2,
                  border: (theme) => `1px solid ${theme.palette.divider}`,
                  cursor: "pointer",
                  "&:hover": {
                    backgroundColor: "action.hover",
                  },
                }}
              >
                <Box sx={{ minWidth: 110 }}>
                  <Typography variant="caption" color="text.secondary">
                    {formatTs(evt.ts)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {evt.origin ?? "metro"}
                  </Typography>
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography
                    variant="body2"
                    noWrap
                    sx={{ fontFamily: "monospace", fontSize: 13 }}
                    title={evt.msg}
                  >
                    {evt.msg}
                  </Typography>
                </Box>
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                  {count > 1 && (
                    <Chip
                      size="small"
                      label={count}
                      color="info"
                      variant="filled"
                      sx={{ minWidth: 32, fontWeight: 600, borderRadius: 2 }}
                    />
                  )}
                  <Chip
                    size="small"
                    icon={getLevelIcon(evt.level)}
                    label={evt.level}
                    color={levelColor[evt.level] ?? "default"}
                    variant="filled"
                    sx={{ textTransform: "capitalize", borderRadius: 2 }}
                  />
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
            width: fullScreen ? "100%" : { xs: "100%", sm: 520 },
            background: (theme) => theme.palette.background.paper,
            border: "none",
            borderRadius: 0,
            boxShadow: "none",
            overflow: "hidden",
            m: 0,
            height: "100%",
          },
        }}
      >
        <Box
          sx={{
            p: 0,
            height: "100%",
            display: "flex",
            flexDirection: "column",
            position: "relative",
          }}
        >
          {/* Accent glow */}
          <Box
            aria-hidden
            sx={(theme) => ({
              position: "absolute",
              top: -80,
              right: -60,
              width: 220,
              height: 220,
              borderRadius: "50%",
              background: `linear-gradient(135deg, ${theme.palette.primary.main}, ${theme.palette.secondary.main})`,
              opacity: 0.15,
              filter: "blur(40px)",
              pointerEvents: "none",
            })}
          />

          {/* Header */}
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              p: 2,
              m: 2,
              mb: 0,
              background: (theme) =>
                theme.palette.mode === "dark"
                  ? "rgba(255,255,255,0.03)"
                  : "rgba(0,0,0,0.02)",
              backdropFilter: "blur(14px) saturate(140%)",
              WebkitBackdropFilter: "blur(14px) saturate(140%)",
              border: (theme) => `1px solid ${theme.palette.divider}`,
              borderRadius: 2,
              boxShadow: (theme) =>
                `0 6px 20px ${theme.palette.mode === "dark" ? "rgba(0,0,0,0.3)" : "rgba(0,0,0,0.08)"}`,
            }}
          >
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1.5,
                minWidth: 0,
              }}
            >
              <Box>
                <Typography
                  variant="h6"
                  sx={{ fontWeight: 700, letterSpacing: 0.2, lineHeight: 1.2 }}
                >
                  Log Details
                </Typography>
                {selectedEvent && (
                  <Typography variant="caption" color="text.secondary">
                    {formatTs(selectedEvent.ts)} •{" "}
                    {selectedEvent.origin ?? "metro"}
                  </Typography>
                )}
              </Box>
            </Box>

            <Box
              sx={{
                display: "inline-flex",
                gap: 0.5,
                background: (theme) =>
                  theme.palette.mode === "dark"
                    ? "rgba(255,255,255,0.04)"
                    : "rgba(0,0,0,0.03)",
                backdropFilter: "blur(10px)",
                WebkitBackdropFilter: "blur(10px)",
                border: (theme) => `1px solid ${theme.palette.divider}`,
                borderRadius: 2,
                px: 0.5,
                py: 0.25,
              }}
            >
              <Tooltip title={copied ? "Copied!" : "Copy message"}>
                <IconButton
                  onClick={handleCopyMessage}
                  size="small"
                  color={copied ? "success" : "default"}
                >
                  <ContentCopyIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <IconButton onClick={() => setFullScreen((v) => !v)} size="small">
                {fullScreen ? (
                  <FullscreenExitIcon fontSize="small" />
                ) : (
                  <FullscreenIcon fontSize="small" />
                )}
              </IconButton>
              <IconButton onClick={() => setDrawerOpen(false)} size="small">
                <CloseIcon fontSize="small" />
              </IconButton>
            </Box>
          </Box>

          {selectedEvent && (
            <Box sx={{ flex: 1, overflow: "auto", p: 2 }}>
              <Box
                sx={{
                  mb: 3,
                  p: 2,
                  background: (theme) =>
                    theme.palette.mode === "dark"
                      ? "rgba(255,255,255,0.02)"
                      : "rgba(0,0,0,0.01)",
                  border: (theme) => `1px solid ${theme.palette.divider}`,
                  borderRadius: 2,
                  transition: "all 0.2s ease",
                  "&:hover": {
                    background: (theme) =>
                      theme.palette.mode === "dark"
                        ? "rgba(255,255,255,0.04)"
                        : "rgba(0,0,0,0.02)",
                    transform: "translateY(-1px)",
                  },
                }}
              >
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 1,
                  }}
                >
                  <Typography
                    variant="overline"
                    color="text.secondary"
                    sx={{ letterSpacing: 0.8 }}
                  >
                    Level
                  </Typography>
                  <Chip
                    size="small"
                    label={selectedEvent.level.toUpperCase()}
                    color={levelColor[selectedEvent.level] ?? "default"}
                    variant="filled"
                    sx={{
                      fontWeight: 600,
                      letterSpacing: 0.5,
                      px: 0.75,
                    }}
                  />
                </Box>
              </Box>

              <Box
                sx={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 2,
                }}
              >
                <Box
                  sx={{
                    p: 2,
                    background: (theme) =>
                      theme.palette.mode === "dark"
                        ? "rgba(255,255,255,0.02)"
                        : "rgba(0,0,0,0.01)",
                    border: (theme) => `1px solid ${theme.palette.divider}`,
                    borderRadius: 2,
                    transition: "all 0.2s ease",
                    "&:hover": {
                      background: (theme) =>
                        theme.palette.mode === "dark"
                          ? "rgba(255,255,255,0.04)"
                          : "rgba(0,0,0,0.02)",
                      transform: "translateY(-1px)",
                    },
                  }}
                >
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      mb: 1.5,
                    }}
                  >
                    <Typography variant="overline" color="text.secondary">
                      Message
                    </Typography>
                    <Tooltip title={copied ? "Copied!" : "Copy"}>
                      <IconButton size="small" onClick={handleCopyMessage}>
                        <ContentCopyIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    </Tooltip>
                  </Box>
                  <Box
                    component="pre"
                    sx={{
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      fontFamily: '"Fira Code", "JetBrains Mono", monospace',
                      fontSize: 13,
                      lineHeight: 1.6,
                      m: 0,
                      p: 2,
                      background: (theme) =>
                        theme.palette.mode === "dark"
                          ? "rgba(0,0,0,0.3)"
                          : "rgba(0,0,0,0.04)",
                      borderRadius: 1.5,
                      maxHeight: "none",
                      overflow: "auto",
                    }}
                  >
                    {selectedEvent.msg}
                  </Box>
                </Box>

                {selectedEvent.rawArgs && selectedEvent.rawArgs.length > 0 && (
                  <Box
                    sx={{
                      p: 2,
                      background: (theme) =>
                        theme.palette.mode === "dark"
                          ? "rgba(255,255,255,0.02)"
                          : "rgba(0,0,0,0.01)",
                      border: (theme) => `1px solid ${theme.palette.divider}`,
                      borderRadius: 2,
                      transition: "all 0.2s ease",
                      "&:hover": {
                        background: (theme) =>
                          theme.palette.mode === "dark"
                            ? "rgba(255,255,255,0.04)"
                            : "rgba(0,0,0,0.02)",
                        transform: "translateY(-1px)",
                      },
                    }}
                  >
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        mb: 1.5,
                      }}
                    >
                      <Typography variant="overline" color="text.secondary">
                        Formatted
                      </Typography>
                    </Box>
                    <Box
                      sx={{
                        p: 2,
                        background: (theme) =>
                          theme.palette.mode === "dark"
                            ? "rgba(0,0,0,0.3)"
                            : "rgba(0,0,0,0.04)",
                        borderRadius: 1.5,
                        maxHeight: "none",
                        overflow: "auto",
                      }}
                    >
                      <JsonTreeView
                        data={selectedEvent.rawArgs}
                        defaultExpanded
                      />
                    </Box>
                  </Box>
                )}
                {selectedEvent.rawCdpArgs &&
                  selectedEvent.rawCdpArgs.length > 0 && (
                    <Box
                      sx={{
                        p: 2,
                        background: (theme) =>
                          theme.palette.mode === "dark"
                            ? "rgba(255,255,255,0.02)"
                            : "rgba(0,0,0,0.01)",
                        border: (theme) => `1px solid ${theme.palette.divider}`,
                        borderRadius: 2,
                        transition: "all 0.2s ease",
                        "&:hover": {
                          background: (theme) =>
                            theme.palette.mode === "dark"
                              ? "rgba(255,255,255,0.04)"
                              : "rgba(0,0,0,0.02)",
                          transform: "translateY(-1px)",
                        },
                      }}
                    >
                      <Box
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          mb: 1.5,
                        }}
                      >
                        <Typography variant="overline" color="text.secondary">
                          Raw CDP
                        </Typography>
                      </Box>
                      <Box
                        sx={{
                          p: 2,
                          background: (theme) =>
                            theme.palette.mode === "dark"
                              ? "rgba(0,0,0,0.3)"
                              : "rgba(0,0,0,0.04)",
                          borderRadius: 1.5,
                          maxHeight: "none",
                          overflow: "auto",
                        }}
                      >
                        <JsonTreeView
                          data={selectedEvent.rawCdpArgs}
                          defaultExpanded
                        />
                      </Box>
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

export default ConsolePage;
