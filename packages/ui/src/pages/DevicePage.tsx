import React, { useMemo } from "react";
import { Box, Chip, Stack, Typography } from "@mui/material";
import GlassPanel from "../ui/GlassPanel";
import { useProxy } from "../hooks/useProxyStream";
import PhoneAndroidIcon from "@mui/icons-material/PhoneAndroid";
import PhoneIphoneIcon from "@mui/icons-material/PhoneIphone";
import DeveloperModeIcon from "@mui/icons-material/DeveloperMode";
import SpeedIcon from "@mui/icons-material/Speed";
import AppsIcon from "@mui/icons-material/Apps";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CancelIcon from "@mui/icons-material/Cancel";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import MemoryIcon from "@mui/icons-material/Memory";
import CodeIcon from "@mui/icons-material/Code";
import BuildIcon from "@mui/icons-material/Build";

export function DevicePage() {
  const { deviceInfo } = useProxy();

  const currentDevice = useMemo(() => {
    if (!deviceInfo || deviceInfo.length === 0) return null;
    return deviceInfo[deviceInfo.length - 1];
  }, [deviceInfo]);

  if (!currentDevice) {
    return (
      <Box
        sx={{
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <GlassPanel sx={{ textAlign: "center", p: 4, minWidth: 320 }}>
          <PhoneAndroidIcon sx={{ fontSize: 72, color: "text.secondary", mb: 2 }} />
          <Typography variant="h6" gutterBottom>
            No Device Connected
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Connect a device to view detailed information.
          </Typography>
        </GlassPanel>
      </Box>
    );
  }

  const isIOS = currentDevice.osName?.toLowerCase() === "ios";
  const DeviceIcon = isIOS ? PhoneIphoneIcon : PhoneAndroidIcon;

  const stats = [
    {
      title: "OS",
      value: currentDevice.osName ? `${currentDevice.osName} ${currentDevice.osVersion || ""}` : "Unknown",
      accent: "from-sky-400 to-blue-500",
    },
    {
      title: "Engine",
      value: currentDevice.engineType || "Unknown",
      accent: "from-purple-400 to-indigo-500",
    },
    {
      title: "RN",
      value: currentDevice.reactNativeVersion || "N/A",
      accent: "from-emerald-400 to-teal-500",
    },
  ];

  return (
    <Box
      sx={{
        minHeight: "100%",
        py: 3,
        px: { xs: 2, md: 3 },
      }}
    >
      <Stack spacing={3} maxWidth="1200px" mx="auto">
        {/* Hero */}
        <GlassPanel sx={{ p: { xs: 3, md: 4 }, position: "relative", overflow: "hidden" }}>
          <Box
            sx={{
              position: "absolute",
              inset: 0,
              background: "radial-gradient(circle at 20% 20%, rgba(255,255,255,0.15), transparent 40%), radial-gradient(circle at 80% 0%, rgba(255,255,255,0.12), transparent 35%)",
              pointerEvents: "none",
            }}
          />
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ xs: "flex-start", sm: "center" }}>
            <GlassPanel
              hover={false}
              padding={2.5}
              radius={3}
              sx={{ display: "inline-flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.15)" }}
            >
              <DeviceIcon sx={{ fontSize: 56, color: "text.primary" }} />
            </GlassPanel>

            <Stack spacing={1} flex={1} minWidth={0}>
              <Typography variant="h4" fontWeight={700} color="text.primary" noWrap>
                {currentDevice.deviceName || currentDevice.deviceModel || "Unknown Device"}
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" alignItems="center">
                {currentDevice.deviceBrand && (
                  <Chip label={currentDevice.deviceBrand} size="small" color="primary" variant="filled" />
                )}
              </Stack>
              <Stack direction="row" spacing={1} flexWrap="wrap" pt={1}>
                {stats.map((stat) => (
                  <Box key={stat.title} sx={{ flexBasis: { xs: "100%", sm: "32%" }, minWidth: 0 }}>
                    <StatCard title={stat.title} value={stat.value} accent={stat.accent} />
                  </Box>
                ))}
              </Stack>
            </Stack>
          </Stack>
        </GlassPanel>

        {/* Grid sections */}
        <Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems="stretch" flexWrap="wrap">
          <GlassPanel sx={{ flex: 2, minWidth: 320 }}>
            <SectionHeader icon={<InfoOutlinedIcon color="primary" />} title="Device" />
            <Stack spacing={1.5} mt={2}>
              <InfoRow icon={<PhoneAndroidIcon fontSize="small" />} label="Model" value={currentDevice.deviceModel} />
              <InfoRow icon={<BuildIcon fontSize="small" />} label="Brand" value={currentDevice.deviceBrand} />
              <InfoRow
                icon={<CodeIcon fontSize="small" />}
                label="Device ID"
                value={currentDevice.deviceId}
                mono
                valueSx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%", display: "block" }}
              />
              <InfoRow icon={<InfoOutlinedIcon fontSize="small" />} label="System Version" value={currentDevice.systemVersion} />
            </Stack>
          </GlassPanel>

          <GlassPanel sx={{ flex: 1, minWidth: 280 }}>
            <SectionHeader icon={<AppsIcon color="success" />} title="Application" />
            <Stack spacing={1.5} mt={2}>
              <InfoRow label="Version" value={currentDevice.appVersion} badge />
              <InfoRow label="Build Number" value={currentDevice.appBuildNumber} />
              <InfoRow label="Bundle ID" value={currentDevice.bundleId} mono />
            </Stack>
          </GlassPanel>
        </Stack>

        <Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems="stretch" flexWrap="wrap">
          <GlassPanel sx={{ flex: 2, minWidth: 320 }}>
            <SectionHeader icon={<DeveloperModeIcon color="info" />} title="React Native" />
            <Stack spacing={1.25} mt={2}>
              <InfoRow label="RN Version" value={currentDevice.reactNativeVersion} badge />
              <InfoRow label="Metro" value={currentDevice.metroVersion} badge />
              <InfoRow
                label="Architecture"
                value={currentDevice.isFabricEnabled ? "Fabric" : "Legacy"}
                badge
                badgeColor={currentDevice.isFabricEnabled ? "success" : "default"}
              />
              <StatusRow label="New Architecture" enabled={currentDevice.isNewArchEnabled} />
              <StatusRow label="Bridgeless Mode" enabled={currentDevice.bridgelessEnabled} />
              <StatusRow label="TurboModules" enabled={currentDevice.turboModulesEnabled} />
            </Stack>
          </GlassPanel>

          <GlassPanel sx={{ flex: 1, minWidth: 280 }}>
            <SectionHeader icon={<SpeedIcon color="warning" />} title="JavaScript Engine" />
            <Stack spacing={1.5} mt={2}>
              <InfoRow
                icon={<MemoryIcon fontSize="small" />}
                label="Engine"
                value={currentDevice.engineType}
                badge
                badgeColor={currentDevice.engineType === "Hermes" ? "secondary" : "default"}
              />
              <InfoRow label="Hermes Version" value={currentDevice.hermesVersion} />
              <StatusRow label="JSI Enabled" enabled={currentDevice.jsiEnabled} />
            </Stack>
          </GlassPanel>
        </Stack>

        {currentDevice.ts && (
          <Typography variant="caption" color="text.secondary" align="center" sx={{ pb: 1 }}>
            Last updated: {new Date(currentDevice.ts).toLocaleString()}
          </Typography>
        )}
      </Stack>
    </Box>
  );
}

function SectionHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <Stack direction="row" spacing={1} alignItems="center">
      {icon}
      <Typography variant="subtitle1" fontWeight={700}>
        {title}
      </Typography>
    </Stack>
  );
}

function StatCard({ title, value, accent }: { title: string; value: string; accent: string }) {
  return (
    <GlassPanel hover={false} padding={2} radius={2} sx={{ position: "relative", overflow: "hidden" }}>
      <Box
        sx={{
          position: "absolute",
          inset: 0,
          background: `linear-gradient(90deg, ${accent})`,
          opacity: 0.18,
          pointerEvents: "none",
        }}
      />
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ position: "relative" }}>
        <Typography variant="body2" color="text.secondary">
          {title}
        </Typography>
        <Typography variant="subtitle1" fontWeight={700}>
          {value || "N/A"}
        </Typography>
      </Stack>
    </GlassPanel>
  );
}

function InfoRow({
  icon,
  label,
  value,
  mono = false,
  badge = false,
  badgeColor = "default",
  sx,
  valueSx,
}: {
  icon?: React.ReactNode;
  label: string;
  value?: string | boolean | number;
  mono?: boolean;
  badge?: boolean;
  badgeColor?: "default" | "primary" | "secondary" | "success" | "warning" | "info" | "error";
  sx?: import("@mui/material").SxProps;
  valueSx?: import("@mui/material").SxProps;
}) {
  const hasValue = value !== undefined && value !== null && value !== "" && value !== "unknown";
  return (
    <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1.5} sx={sx}>
      <Stack direction="row" spacing={1} alignItems="center">
        {icon}
        <Typography variant="body2" color="text.secondary">
          {label}
        </Typography>
      </Stack>
      {hasValue ? (
        badge ? (
          <Chip label={String(value)} size="small" color={badgeColor} variant="filled" sx={valueSx} />
        ) : (
          <Typography
            variant="body2"
            sx={{ fontFamily: mono ? "monospace" : undefined, maxWidth: 260, ...valueSx } as any}
            color="text.primary"
            noWrap
          >
            {String(value)}
          </Typography>
        )
      ) : (
        <Typography variant="caption" color="text.disabled" fontStyle="italic">
          N/A
        </Typography>
      )}
    </Stack>
  );
}

function StatusRow({ label, enabled }: { label: string; enabled?: boolean }) {
  return (
    <Stack direction="row" justifyContent="space-between" alignItems="center">
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Stack direction="row" spacing={0.5} alignItems="center">
        {enabled ? (
          <>
            <CheckCircleIcon sx={{ fontSize: 18, color: "success.main" }} />
            <Typography variant="body2" color="success.main" fontWeight={600}>
              Enabled
            </Typography>
          </>
        ) : (
          <>
            <CancelIcon sx={{ fontSize: 18, color: "text.disabled" }} />
            <Typography variant="body2" color="text.secondary">
              Disabled
            </Typography>
          </>
        )}
      </Stack>
    </Stack>
  );
}
