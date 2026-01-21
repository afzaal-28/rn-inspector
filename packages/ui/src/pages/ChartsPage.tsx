import { useMemo } from "react";
import { Box, Stack, Typography, Card, CardContent, Chip } from "@mui/material";
import { LineChart } from "@mui/x-charts/LineChart";
import { BarChart } from "@mui/x-charts/BarChart";
import { PieChart } from "@mui/x-charts/PieChart";
import BarChartIcon from "@mui/icons-material/BarChart";
import TimelineIcon from "@mui/icons-material/Timeline";
import PieChartIcon from "@mui/icons-material/PieChart";
import GlassPanel from "../ui/GlassPanel";
import { useProxy } from "../context/ProxyContext";

export default function ChartsPage() {
  const { consoleEvents, networkEvents, navigationHistory } = useProxy();

  const consoleByLevel = useMemo(() => {
    const counts: Record<string, number> = {
      log: 0,
      info: 0,
      warn: 0,
      error: 0,
    };
    consoleEvents.forEach((event) => {
      const level = event.level || "log";
      counts[level] = (counts[level] || 0) + 1;
    });
    return counts;
  }, [consoleEvents]);

  const networkByStatus = useMemo(() => {
    const counts: Record<string, number> = {};
    networkEvents.forEach((event) => {
      if (event.status) {
        const statusGroup = Math.floor(event.status / 100) * 100;
        const key = `${statusGroup}s`;
        counts[key] = (counts[key] || 0) + 1;
      }
    });
    return counts;
  }, [networkEvents]);

  const networkByMethod = useMemo(() => {
    const counts: Record<string, number> = {};
    networkEvents.forEach((event) => {
      const method = event.method || "UNKNOWN";
      counts[method] = (counts[method] || 0) + 1;
    });
    return counts;
  }, [networkEvents]);

  const eventTimeline = useMemo(() => {
    const now = Date.now();
    const timeWindow = 60000;
    const bucketSize = 5000;
    const buckets: Record<
      number,
      { console: number; network: number; navigation: number }
    > = {};

    for (let i = 0; i < timeWindow; i += bucketSize) {
      const bucketTime = now - timeWindow + i;
      buckets[bucketTime] = { console: 0, network: 0, navigation: 0 };
    }

    consoleEvents.forEach((event) => {
      try {
        const eventTime = new Date(event.ts).getTime();
        const bucketTime =
          Math.floor((eventTime - (now - timeWindow)) / bucketSize) *
            bucketSize +
          (now - timeWindow);
        if (buckets[bucketTime]) {
          buckets[bucketTime].console++;
        }
      } catch {}
    });

    networkEvents.forEach((event) => {
      try {
        const eventTime = new Date(event.ts).getTime();
        const bucketTime =
          Math.floor((eventTime - (now - timeWindow)) / bucketSize) *
            bucketSize +
          (now - timeWindow);
        if (buckets[bucketTime]) {
          buckets[bucketTime].network++;
        }
      } catch {}
    });

    navigationHistory.forEach((entry) => {
      try {
        const eventTime = new Date(entry.timestamp).getTime();
        const bucketTime =
          Math.floor((eventTime - (now - timeWindow)) / bucketSize) *
            bucketSize +
          (now - timeWindow);
        if (buckets[bucketTime]) {
          buckets[bucketTime].navigation++;
        }
      } catch {}
    });

    const sortedBuckets = Object.entries(buckets).sort(
      ([a], [b]) => Number(a) - Number(b),
    );

    return {
      labels: sortedBuckets.map(([time]) => {
        const date = new Date(Number(time));
        return date.toLocaleTimeString([], {
          minute: "2-digit",
          second: "2-digit",
        });
      }),
      console: sortedBuckets.map(([, counts]) => counts.console),
      network: sortedBuckets.map(([, counts]) => counts.network),
      navigation: sortedBuckets.map(([, counts]) => counts.navigation),
    };
  }, [consoleEvents, networkEvents, navigationHistory]);

  const consolePieData = useMemo(() => {
    return Object.entries(consoleByLevel)
      .filter(([, value]) => value > 0)
      .map(([label, value], index) => ({
        id: index,
        value,
        label: label.toUpperCase(),
      }));
  }, [consoleByLevel]);

  const networkStatusPieData = useMemo(() => {
    return Object.entries(networkByStatus)
      .filter(([, value]) => value > 0)
      .map(([label, value], index) => ({
        id: index,
        value,
        label,
      }));
  }, [networkByStatus]);

  const networkMethodBarData = useMemo(() => {
    return Object.entries(networkByMethod)
      .filter(([, value]) => value > 0)
      .map(([method, count]) => ({ method, count }));
  }, [networkByMethod]);

  const totalConsole = consoleEvents.length;
  const totalNetwork = networkEvents.length;
  const totalNavigation = navigationHistory.length;

  return (
    <Box sx={{ p: 2, height: "100%", overflow: "auto" }}>
      <Stack spacing={2}>
        <GlassPanel>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <BarChartIcon sx={{ fontSize: 28 }} />
            <Typography variant="h5" fontWeight="bold">
              Event Analytics
            </Typography>
          </Box>
        </GlassPanel>

        <Box
          sx={{
            display: "grid",
            gap: 2,
            gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
            alignItems: "stretch",
          }}
        >
          <Card variant="outlined" sx={{ height: "100%", display: "flex" }}>
            <CardContent
              sx={{ height: "100%", display: "flex", flexDirection: "column" }}
            >
              <Typography variant="h6" color="primary" gutterBottom>
                Console Events
              </Typography>
              <Typography variant="h3" fontWeight="bold">
                {totalConsole}
              </Typography>
              <Stack direction="row" spacing={1} mt={1} flexWrap="wrap">
                {Object.entries(consoleByLevel).map(
                  ([level, count]) =>
                    count > 0 && (
                      <Chip
                        key={level}
                        label={`${level}: ${count}`}
                        size="small"
                        color={
                          level === "error"
                            ? "error"
                            : level === "warn"
                              ? "warning"
                              : level === "info"
                                ? "info"
                                : "default"
                        }
                      />
                    ),
                )}
              </Stack>
            </CardContent>
          </Card>

          <Card variant="outlined" sx={{ height: "100%", display: "flex" }}>
            <CardContent
              sx={{ height: "100%", display: "flex", flexDirection: "column" }}
            >
              <Typography variant="h6" color="secondary" gutterBottom>
                Network Requests
              </Typography>
              <Typography variant="h3" fontWeight="bold">
                {totalNetwork}
              </Typography>
              <Stack direction="row" spacing={1} mt={1} flexWrap="wrap">
                {Object.entries(networkByStatus).map(([status, count]) => (
                  <Chip
                    key={status}
                    label={`${status}: ${count}`}
                    size="small"
                    color={
                      status.startsWith("2")
                        ? "success"
                        : status.startsWith("4") || status.startsWith("5")
                          ? "error"
                          : "default"
                    }
                  />
                ))}
              </Stack>
            </CardContent>
          </Card>

          <Card variant="outlined" sx={{ height: "100%", display: "flex" }}>
            <CardContent
              sx={{ height: "100%", display: "flex", flexDirection: "column" }}
            >
              <Typography variant="h6" color="success.main" gutterBottom>
                Navigation Events
              </Typography>
              <Typography variant="h3" fontWeight="bold">
                {totalNavigation}
              </Typography>
              <Typography variant="caption" color="text.secondary" mt={1}>
                Route changes tracked
              </Typography>
            </CardContent>
          </Card>
        </Box>

        <GlassPanel>
          <Stack spacing={2}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <TimelineIcon />
              <Typography variant="h6">Event Timeline (Last 60s)</Typography>
            </Box>
            <Box sx={{ width: "100%", height: 300 }}>
              <LineChart
                xAxis={[
                  {
                    scaleType: "point",
                    data: eventTimeline.labels,
                  },
                ]}
                series={[
                  {
                    data: eventTimeline.console,
                    label: "Console",
                    color: "#2196f3",
                  },
                  {
                    data: eventTimeline.network,
                    label: "Network",
                    color: "#ff9800",
                  },
                  {
                    data: eventTimeline.navigation,
                    label: "Navigation",
                    color: "#4caf50",
                  },
                ]}
                height={300}
              />
            </Box>
          </Stack>
        </GlassPanel>

        <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
          <Box sx={{ flex: "1 1 400px", minWidth: 0, height: "100%" }}>
            <GlassPanel>
              <Stack spacing={2}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <PieChartIcon />
                  <Typography variant="h6">Console Events by Level</Typography>
                </Box>
                {consolePieData.length > 0 ? (
                  <Box sx={{ width: "100%", height: 300 }}>
                    <PieChart
                      series={[
                        {
                          data: consolePieData,
                        },
                      ]}
                      height={300}
                    />
                  </Box>
                ) : (
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    textAlign="center"
                    py={4}
                  >
                    No console events to display
                  </Typography>
                )}
              </Stack>
            </GlassPanel>
          </Box>

          <Box sx={{ flex: "1 1 400px", minWidth: 0, height: "100%" }}>
            <GlassPanel>
              <Stack spacing={2}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <PieChartIcon />
                  <Typography variant="h6">Network Status Codes</Typography>
                </Box>
                {networkStatusPieData.length > 0 ? (
                  <Box sx={{ width: "100%", height: 300 }}>
                    <PieChart
                      series={[
                        {
                          data: networkStatusPieData,
                        },
                      ]}
                      height={300}
                    />
                  </Box>
                ) : (
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    textAlign="center"
                    py={4}
                  >
                    No network events to display
                  </Typography>
                )}
              </Stack>
            </GlassPanel>
          </Box>
        </Box>

        <GlassPanel>
          <Stack spacing={2}>
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
                height: "100%",
              }}
            >
              <BarChartIcon />
              <Typography variant="h6">Network Requests by Method</Typography>
            </Box>
            {networkMethodBarData.length > 0 ? (
              <Box sx={{ width: "100%", height: 300 }}>
                <BarChart
                  dataset={networkMethodBarData}
                  xAxis={[{ scaleType: "band", dataKey: "method" }]}
                  series={[{ dataKey: "count", label: "Requests" }]}
                  height={300}
                />
              </Box>
            ) : (
              <Typography
                variant="body2"
                color="text.secondary"
                textAlign="center"
                py={4}
              >
                No network events to display
              </Typography>
            )}
          </Stack>
        </GlassPanel>
      </Stack>
    </Box>
  );
}
