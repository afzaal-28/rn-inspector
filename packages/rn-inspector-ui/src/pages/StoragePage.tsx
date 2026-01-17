import { useEffect, useMemo, useState } from "react";
import {
  Box,
  Typography,
  Button,
  CircularProgress,
  Chip,
  TextField,
  InputAdornment,
  LinearProgress,
} from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";
import SearchIcon from "@mui/icons-material/Search";
import StorageIcon from "@mui/icons-material/Storage";
import AccountTreeIcon from "@mui/icons-material/AccountTree";
import GlassPanel from "../ui/GlassPanel";
import JsonTreeView from "../components/JsonTreeView";
import { useProxy } from "../context/ProxyContext";

export default function StoragePage() {
  const {
    storageData,
    fetchStorage,
    devices,
    activeDeviceId,
    status,
    mutateStorage,
  } = useProxy();
  const [loading, setLoading] = useState(false);
  const [asyncInput, setAsyncInput] = useState("");
  const [reduxInput, setReduxInput] = useState("");
  const [asyncSearchQuery, setAsyncSearchQuery] = useState("");
  const [reduxSearchQuery, setReduxSearchQuery] = useState("");
  const searchingAsync = asyncInput !== asyncSearchQuery;
  const searchingRedux = reduxInput !== reduxSearchQuery;

  // debounce search inputs to avoid heavy updates on each keystroke
  useEffect(() => {
    const handle = setTimeout(() => setAsyncSearchQuery(asyncInput), 220);
    return () => clearTimeout(handle);
  }, [asyncInput]);

  useEffect(() => {
    const handle = setTimeout(() => setReduxSearchQuery(reduxInput), 220);
    return () => clearTimeout(handle);
  }, [reduxInput]);

  const filterByQuery = (data: any, query: string): any => {
    const q = query.toLowerCase();

    const recurse = (value: any, keyMatch: boolean): any => {
      const isPrimitive = value === null || typeof value !== "object";
      if (isPrimitive) {
        const matchesValue =
          typeof value === "string" ? value.toLowerCase().includes(q) : false;
        return keyMatch || matchesValue ? value : undefined;
      }

      if (Array.isArray(value)) {
        const mapped = value
          .map((item, idx) => recurse(item, keyMatch || `${idx}`.includes(q)))
          .filter((v) => v !== undefined);
        return mapped.length ? mapped : undefined;
      }

      const result: Record<string, any> = {};
      for (const [k, v] of Object.entries(value)) {
        const childKeyMatch = keyMatch || k.toLowerCase().includes(q);
        const child = recurse(v, childKeyMatch);
        if (child !== undefined) {
          result[k] = child;
        }
      }

      return Object.keys(result).length ? result : undefined;
    };

    return recurse(data, false) ?? null;
  };

  // Get storage for the active device
  const currentStorage = useMemo(() => {
    if (!activeDeviceId) return null;
    return storageData.get(activeDeviceId) || null;
  }, [storageData, activeDeviceId]);

  const handleRefresh = () => {
    if (!activeDeviceId) return;
    setLoading(true);
    fetchStorage(activeDeviceId);
    // Auto-clear loading after timeout
    setTimeout(() => setLoading(false), 3000);
  };

  // Auto-fetch on mount and when device changes
  useEffect(() => {
    if (status === "open") {
      handleRefresh();
    }
  }, [activeDeviceId, status]);

  // Clear loading when data arrives
  useEffect(() => {
    if (currentStorage) {
      setLoading(false);
    }
  }, [currentStorage]);

  const filteredAsyncStorage = useMemo(() => {
    if (
      !currentStorage?.asyncStorage ||
      typeof currentStorage.asyncStorage !== "object"
    ) {
      return currentStorage?.asyncStorage;
    }
    if (!asyncSearchQuery.trim()) return currentStorage.asyncStorage;
    return filterByQuery(currentStorage.asyncStorage, asyncSearchQuery);
  }, [currentStorage?.asyncStorage, asyncSearchQuery]);

  const filteredRedux = useMemo(() => {
    if (!currentStorage?.redux || typeof currentStorage.redux !== "object") {
      return currentStorage?.redux;
    }
    if (!reduxSearchQuery.trim()) return currentStorage.redux;
    return filterByQuery(currentStorage.redux, reduxSearchQuery);
  }, [currentStorage?.redux, reduxSearchQuery]);

  const hasAsyncStorageError =
    currentStorage?.asyncStorage &&
    typeof currentStorage.asyncStorage === "object" &&
    "error" in currentStorage.asyncStorage;

  const hasReduxError =
    currentStorage?.redux &&
    typeof currentStorage.redux === "object" &&
    "error" in currentStorage.redux;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {/* Header */}
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
            `0 6px 18px ${
              theme.palette.mode === "dark"
                ? "rgba(0,0,0,0.35)"
                : "rgba(0,0,0,0.08)"
            }`,
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
            gap: 2,
          }}
        >
          <Box>
            <Typography variant="h5" fontWeight={600}>
              Storage
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Inspect AsyncStorage and Redux state from connected devices
            </Typography>
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
            <Button
              variant="outlined"
              startIcon={
                loading ? <CircularProgress size={16} /> : <RefreshIcon />
              }
              onClick={handleRefresh}
              disabled={loading || status !== "open"}
              sx={{ borderRadius: 999, textTransform: "none" }}
            >
              {loading ? "Fetching..." : "Refresh"}
            </Button>
          </Box>
        </Box>
        {currentStorage && (
          <Box sx={{ display: "flex", gap: 1 }}>
            <Chip
              size="small"
              label={`Last updated: ${new Date(currentStorage.ts).toLocaleTimeString()}`}
              variant="filled"
            />
            {currentStorage.deviceId && (
              <Chip
                size="small"
                label={`Device: ${devices.find((d) => d.id === currentStorage.deviceId)?.label || currentStorage.deviceId}`}
                variant="filled"
              />
            )}
          </Box>
        )}
        <Box
          sx={{
            mt: 1,
            p: 1.5,
            borderRadius: 1.5,
            background: (theme) =>
              theme.palette.mode === "dark"
                ? "rgba(0,0,0,0.2)"
                : "rgba(0,0,0,0.04)",
            border: (theme) => `1px dashed ${theme.palette.divider}`,
          }}
        >
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: "block", mb: 0.5 }}
          >
            Editing requires these globals in your React Native app:
          </Typography>
          <Box
            component="pre"
            sx={{ fontSize: 12, fontFamily: "monospace", m: 0 }}
          >
            {`// AsyncStorage access
import AsyncStorage from '@react-native-async-storage/async-storage';
global.__RN_INSPECTOR_ASYNC_STORAGE__ = AsyncStorage;

// Redux access
global.__RN_INSPECTOR_REDUX_STORE__ = store;

// Reducer hook (allow state replacement)
if (action.type === '__RN_INSPECTOR_REDUX_SET_STATE__') {
  return action.payload;
}`}
          </Box>
        </Box>
      </Box>

      {/* Storage Panels */}
      <Box
        sx={{
          display: "flex",
          flexDirection: { xs: "column", md: "row" },
          gap: 2,
        }}
      >
        {/* AsyncStorage Panel */}
        <Box
          sx={{
            flexBasis: { xs: "100%", md: "50%" },
            minHeight: 0,
            display: "flex",
          }}
        >
          <GlassPanel
            sx={{
              width: "100%",
              height: "100%",
              minHeight: 400,
              display: "flex",
              flexDirection: "column",
              gap: 1.5,
              p: { xs: 1.5, md: 2 },
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
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <StorageIcon color="primary" />
                <Typography variant="subtitle1" fontWeight={600}>
                  AsyncStorage
                </Typography>
              </Box>
              <TextField
                size="small"
                placeholder="Search keys..."
                value={asyncInput}
                onChange={(e) => setAsyncInput(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon fontSize="small" />
                    </InputAdornment>
                  ),
                }}
                sx={{
                  width: 180,
                  "& .MuiOutlinedInput-root": { borderRadius: 2 },
                }}
              />
            </Box>

            <Box
              sx={{
                flex: 1,
                overflow: "auto",
                p: 1.5,
                background: (theme) =>
                  theme.palette.mode === "dark"
                    ? "rgba(0,0,0,0.2)"
                    : "rgba(0,0,0,0.03)",
                borderRadius: 1.5,
                position: "relative",
              }}
            >
              {searchingAsync && (
                <LinearProgress
                  sx={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    height: 3,
                    borderRadius: 999,
                  }}
                />
              )}
              {!currentStorage ? (
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    height: "100%",
                  }}
                >
                  <Typography color="text.secondary">
                    {status !== "open"
                      ? "Connect to a device to view storage"
                      : "Click Refresh to fetch storage data"}
                  </Typography>
                </Box>
              ) : hasAsyncStorageError ? (
                <Box sx={{ p: 2 }}>
                  <Typography color="error.main" variant="body2">
                    {(currentStorage.asyncStorage as any)?.error ||
                      "Error fetching AsyncStorage"}
                  </Typography>

                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ mt: 0.5, display: "block" }}
                  >
                    To enable async-storage inspection, expose it globally in
                    your app. Either alias or direct global works:
                  </Typography>
                  <Box
                    component="pre"
                    sx={{
                      mt: 0.5,
                      p: 1,
                      background: (theme) =>
                        theme.palette.mode === "dark"
                          ? "rgba(0,0,0,0.3)"
                          : "rgba(0,0,0,0.05)",
                      borderRadius: 1,
                      fontSize: 12,
                      fontFamily: "monospace",
                      overflow: "auto",
                    }}
                  >
                    {`// in your app:
import AsyncStorage from '@react-native-async-storage/async-storage';
// preferred alias
global.__RN_INSPECTOR_ASYNC_STORAGE__ = AsyncStorage;

// legacy support
global.AsyncStorage = AsyncStorage;`}
                  </Box>
                </Box>
              ) : filteredAsyncStorage &&
                Object.keys(filteredAsyncStorage).length > 0 ? (
                <JsonTreeView
                  data={filteredAsyncStorage}
                  defaultExpanded
                  searchQuery={asyncSearchQuery}
                  storageTarget="asyncStorage"
                  onMutate={mutateStorage}
                />
              ) : (
                <Typography color="text.secondary" sx={{ p: 2 }}>
                  {asyncSearchQuery
                    ? "No matching keys found"
                    : "AsyncStorage is empty"}
                </Typography>
              )}
            </Box>
          </GlassPanel>
        </Box>

        {/* Redux Panel */}
        <Box
          sx={{
            flexBasis: { xs: "100%", md: "50%" },
            minHeight: 0,
            display: "flex",
          }}
        >
          <GlassPanel
            sx={{
              width: "100%",
              height: "100%",
              minHeight: 400,
              display: "flex",
              flexDirection: "column",
              gap: 1.5,
              p: { xs: 1.5, md: 2 },
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
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <AccountTreeIcon color="secondary" />
                <Typography variant="subtitle1" fontWeight={600}>
                  Redux State
                </Typography>
              </Box>
              <TextField
                size="small"
                placeholder="Search keys..."
                value={reduxInput}
                onChange={(e) => setReduxInput(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon fontSize="small" />
                    </InputAdornment>
                  ),
                }}
                sx={{
                  width: 180,
                  "& .MuiOutlinedInput-root": { borderRadius: 2 },
                }}
              />
            </Box>

            <Box
              sx={{
                flex: 1,
                overflow: "auto",
                p: 1.5,
                background: (theme) =>
                  theme.palette.mode === "dark"
                    ? "rgba(0,0,0,0.2)"
                    : "rgba(0,0,0,0.03)",
                borderRadius: 1.5,
                position: "relative",
              }}
            >
              {searchingRedux && (
                <LinearProgress
                  color="secondary"
                  sx={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    height: 3,
                    borderRadius: 999,
                  }}
                />
              )}
              {!currentStorage ? (
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    height: "100%",
                  }}
                >
                  <Typography color="text.secondary">
                    {status !== "open"
                      ? "Connect to a device to view storage"
                      : "Click Refresh to fetch storage data"}
                  </Typography>
                </Box>
              ) : hasReduxError ? (
                <Box sx={{ p: 2 }}>
                  <Typography color="error.main" variant="body2">
                    {(currentStorage.redux as any)?.error ||
                      "Error fetching Redux state"}
                  </Typography>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ mt: 1, display: "block" }}
                  >
                    To enable Redux inspection, expose your store globally, for
                    example:
                  </Typography>
                  <Box
                    component="pre"
                    sx={{
                      mt: 1,
                      p: 1.5,
                      background: (theme) =>
                        theme.palette.mode === "dark"
                          ? "rgba(0,0,0,0.3)"
                          : "rgba(0,0,0,0.05)",
                      borderRadius: 1,
                      fontSize: 12,
                      fontFamily: "monospace",
                      overflow: "auto",
                    }}
                  >
                    {`// In your store configuration:\nwindow.__RN_INSPECTOR_REDUX_STORE__ = store;`}
                  </Box>
                </Box>
              ) : filteredRedux && Object.keys(filteredRedux).length > 0 ? (
                <JsonTreeView
                  data={filteredRedux}
                  defaultExpanded
                  searchQuery={reduxSearchQuery}
                  storageTarget="redux"
                  onMutate={mutateStorage}
                />
              ) : (
                <Typography color="text.secondary" sx={{ p: 2 }}>
                  {reduxSearchQuery
                    ? "No matching keys found"
                    : "Redux state is empty or not available"}
                </Typography>
              )}
            </Box>
          </GlassPanel>
        </Box>
      </Box>
    </Box>
  );
}
