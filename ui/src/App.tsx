import { useState, useEffect, useCallback } from "react";
import { createDockerDesktopClient } from "@docker/extension-api-client";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  CssBaseline,
  Divider,
  Grid,
  IconButton,
  Paper,
  Snackbar,
  TextField,
  ThemeProvider,
  Tooltip,
  Typography,
  createTheme,
} from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import PauseIcon from "@mui/icons-material/Pause";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import RefreshIcon from "@mui/icons-material/Refresh";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import StopIcon from "@mui/icons-material/Stop";

const ddClient = createDockerDesktopClient();

const CONTAINER_NAME = "grafana-otel-lgtm-ext";
const CONFIG_KEY = "grafana-otel-lgtm-config";

const darkTheme = createTheme({
  palette: {
    mode: "dark",
    primary: { main: "#F05A28" },
    secondary: { main: "#FBCA0A" },
    background: { default: "#111217", paper: "#1a1d23" },
  },
  typography: { fontFamily: '"Inter", "Roboto", sans-serif' },
});

const VOLUME_NAME = `${CONTAINER_NAME}-data`;

interface Config {
  grafanaPort: number;
  otlpGrpcPort: number;
  otlpHttpPort: number;
}

const defaultConfig: Config = {
  grafanaPort: 3000,
  otlpGrpcPort: 4317,
  otlpHttpPort: 4318,
};

type ContainerStatus =
  | "running"
  | "paused"
  | "exited"
  | "not_found"
  | "unknown";

function extractError(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "object" && e !== null) {
    const obj = e as Record<string, unknown>;
    if (typeof obj.stderr === "string" && obj.stderr) return obj.stderr.trim();
    if (typeof obj.message === "string" && obj.message) return obj.message;
  }
  const s = String(e);
  return s === "[object Object]" ? "Unknown error" : s;
}

function isValidPort(port: number): boolean {
  return Number.isInteger(port) && port >= 1 && port <= 65535;
}

function loadConfig(): Config {
  try {
    const saved = localStorage.getItem(CONFIG_KEY);
    if (saved) {
      const parsed = { ...defaultConfig, ...JSON.parse(saved) };
      if (!isValidPort(parsed.grafanaPort))
        parsed.grafanaPort = defaultConfig.grafanaPort;
      if (!isValidPort(parsed.otlpGrpcPort))
        parsed.otlpGrpcPort = defaultConfig.otlpGrpcPort;
      if (!isValidPort(parsed.otlpHttpPort))
        parsed.otlpHttpPort = defaultConfig.otlpHttpPort;
      return parsed;
    }
  } catch {
    // ignore parse errors
  }
  return defaultConfig;
}

function StatusBadge({ status }: { status: ContainerStatus | "loading" }) {
  if (status === "loading") {
    return <CircularProgress size={16} sx={{ ml: 1 }} />;
  }
  const map: Record<
    ContainerStatus,
    {
      label: string;
      color: "success" | "error" | "default" | "warning" | "info";
    }
  > = {
    running: { label: "Running", color: "success" },
    paused: { label: "Paused", color: "info" },
    exited: { label: "Stopped", color: "warning" },
    not_found: { label: "Not created", color: "default" },
    unknown: { label: "Unknown", color: "error" },
  };
  const { label, color } = map[status];
  return <Chip label={label} color={color} size="small" sx={{ ml: 1 }} />;
}

function EndpointRow({
  label,
  value,
  onCopy,
}: {
  label: string;
  value: string;
  onCopy: (v: string) => void;
}) {
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1,
        py: 0.5,
      }}
    >
      <Typography variant="body2" color="text.secondary" sx={{ minWidth: 140 }}>
        {label}
      </Typography>
      <Typography
        variant="body2"
        component="code"
        sx={{
          fontFamily: "monospace",
          bgcolor: "rgba(255,255,255,0.05)",
          px: 1,
          py: 0.25,
          borderRadius: 1,
          flexGrow: 1,
        }}
      >
        {value}
      </Typography>
      <Tooltip title="Copy">
        <IconButton size="small" onClick={() => onCopy(value)}>
          <ContentCopyIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    </Box>
  );
}

interface ActivePorts {
  grafana: number;
  otlpGrpc: number;
  otlpHttp: number;
}

export function App() {
  const [status, setStatus] = useState<ContainerStatus | "loading">("loading");
  const [config, setConfig] = useState<Config>(loadConfig);
  const [draftConfig, setDraftConfig] = useState<Config>(loadConfig);
  const [activePorts, setActivePorts] = useState<ActivePorts | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [toast, setToast] = useState<{
    msg: string;
    severity: "success" | "error" | "info";
  } | null>(null);

  const checkStatus = useCallback(async () => {
    try {
      const result = await ddClient.docker.cli.exec("inspect", [
        CONTAINER_NAME,
      ]);
      const data = JSON.parse(result.stdout);
      const container = Array.isArray(data) ? data[0] : data;
      const s: string = container?.State?.Status ?? "";

      if (s === "running") setStatus("running");
      else if (s === "paused") setStatus("paused");
      else if (s === "exited" || s === "created") setStatus("exited");
      else setStatus("unknown");

      // Parse actual port bindings
      try {
        const ports = container?.NetworkSettings?.Ports;
        if (ports) {
          const getHostPort = (containerPort: string): number => {
            const bindings = ports[containerPort];
            if (Array.isArray(bindings) && bindings.length > 0) {
              return parseInt(bindings[0].HostPort, 10) || 0;
            }
            return 0;
          };
          setActivePorts({
            grafana: getHostPort("3000/tcp"),
            otlpGrpc: getHostPort("4317/tcp"),
            otlpHttp: getHostPort("4318/tcp"),
          });
        }
      } catch {
        setActivePorts(null);
      }
    } catch {
      setStatus("not_found");
      setActivePorts(null);
    }
  }, []);

  useEffect(() => {
    checkStatus();
    const id = setInterval(checkStatus, 5000);
    return () => clearInterval(id);
  }, [checkStatus]);

  const withLoading = async (fn: () => Promise<void>) => {
    setActionLoading(true);
    try {
      await fn();
    } finally {
      setActionLoading(false);
    }
  };

  const handleStart = () =>
    withLoading(async () => {
      try {
        if (status === "not_found") {
          const runArgs = [
            "-d",
            "--name",
            CONTAINER_NAME,
            "--label",
            "com.docker.desktop.extension.managed-by=grafana-otel-lgtm-ext",
            "--restart",
            "unless-stopped",
            "-v",
            `${VOLUME_NAME}:/data`,
            "-p",
            `${config.grafanaPort}:3000`,
            "-p",
            `${config.otlpGrpcPort}:4317`,
            "-p",
            `${config.otlpHttpPort}:4318`,
          ];
          runArgs.push("grafana/otel-lgtm");
          await ddClient.docker.cli.exec("run", runArgs);
        } else {
          await ddClient.docker.cli.exec("start", [CONTAINER_NAME]);
        }
        setToast({ msg: "Container started successfully", severity: "success" });
        await checkStatus();
      } catch (e) {
        setToast({
          msg: `Failed to start: ${extractError(e)}`,
          severity: "error",
        });
      }
    });

  const handleStop = () =>
    withLoading(async () => {
      try {
        await ddClient.docker.cli.exec("stop", [CONTAINER_NAME]);
        setToast({ msg: "Container stopped", severity: "success" });
        await checkStatus();
      } catch (e) {
        setToast({
          msg: `Failed to stop: ${extractError(e)}`,
          severity: "error",
        });
      }
    });

  const handleUnpause = () =>
    withLoading(async () => {
      try {
        await ddClient.docker.cli.exec("unpause", [CONTAINER_NAME]);
        setToast({ msg: "Container unpaused", severity: "success" });
        await checkStatus();
      } catch (e) {
        setToast({
          msg: `Failed to unpause: ${extractError(e)}`,
          severity: "error",
        });
      }
    });

  const handleRestart = () =>
    withLoading(async () => {
      try {
        await ddClient.docker.cli.exec("restart", [CONTAINER_NAME]);
        setToast({ msg: "Container restarted", severity: "success" });
        await checkStatus();
      } catch (e) {
        setToast({
          msg: `Failed to restart: ${extractError(e)}`,
          severity: "error",
        });
      }
    });

  const handleRemove = () =>
    withLoading(async () => {
      try {
        if (status === "running" || status === "paused") {
          await ddClient.docker.cli.exec("stop", [CONTAINER_NAME]);
        }
        await ddClient.docker.cli.exec("rm", [CONTAINER_NAME]);
        setToast({
          msg: "Container removed. Telemetry data is preserved in the volume and will be available on next start.",
          severity: "info",
        });
        await checkStatus();
      } catch (e) {
        setToast({
          msg: `Failed to remove: ${extractError(e)}`,
          severity: "error",
        });
      }
    });

  // Use actual ports from the running container when available, fall back to config
  const displayPorts =
    activePorts && status !== "not_found"
      ? {
          grafana: activePorts.grafana,
          otlpGrpc: activePorts.otlpGrpc,
          otlpHttp: activePorts.otlpHttp,
        }
      : {
          grafana: config.grafanaPort,
          otlpGrpc: config.otlpGrpcPort,
          otlpHttp: config.otlpHttpPort,
        };

  const handleOpenGrafana = async () => {
    await ddClient.host.openExternal(
      `http://localhost:${displayPorts.grafana}`,
    );
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setToast({ msg: "Copied to clipboard", severity: "info" });
  };

  const handleSaveConfig = () => {
    const { grafanaPort, otlpGrpcPort, otlpHttpPort } = draftConfig;
    if (
      !isValidPort(grafanaPort) ||
      !isValidPort(otlpGrpcPort) ||
      !isValidPort(otlpHttpPort)
    ) {
      setToast({
        msg: "Ports must be integers between 1 and 65535.",
        severity: "error",
      });
      return;
    }
    const ports = [grafanaPort, otlpGrpcPort, otlpHttpPort];
    if (new Set(ports).size !== ports.length) {
      setToast({ msg: "Ports must not overlap.", severity: "error" });
      return;
    }
    localStorage.setItem(CONFIG_KEY, JSON.stringify(draftConfig));
    setConfig(draftConfig);
    setToast({
      msg: "Configuration saved. Remove and re-start the container to apply port changes.",
      severity: "info",
    });
  };

  const isRunning = status === "running";
  const isPaused = status === "paused";
  const isStopped = status === "exited";
  const isNotFound = status === "not_found";
  const canStart = (isStopped || isNotFound) && !actionLoading;
  const canStop = (isRunning || isPaused) && !actionLoading;
  const canUnpause = isPaused && !actionLoading;
  const canRestart = (isRunning || isPaused) && !actionLoading;
  const canRemove = (isRunning || isStopped || isPaused) && !actionLoading;

  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <Box sx={{ p: 3, maxWidth: 860, mx: "auto" }}>
        {/* Header */}
        <Box sx={{ display: "flex", alignItems: "center", mb: 3, gap: 2 }}>
          <Box
            component="img"
            src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA4MCA4MCI+CiAgPGRlZnM+CiAgICA8bGluZWFyR3JhZGllbnQgaWQ9ImciIHgxPSIwJSIgeTE9IjAlIiB4Mj0iMTAwJSIgeTI9IjEwMCUiPgogICAgICA8c3RvcCBvZmZzZXQ9IjAlIiBzdHlsZT0ic3RvcC1jb2xvcjojRjA1QTI4Ii8+CiAgICAgIDxzdG9wIG9mZnNldD0iMTAwJSIgc3R5bGU9InN0b3AtY29sb3I6I0ZCQ0EwQSIvPgogICAgPC9saW5lYXJHcmFkaWVudD4KICA8L2RlZnM+CiAgPGNpcmNsZSBjeD0iNDAiIGN5PSI0MCIgcj0iMzgiIGZpbGw9InVybCgjZykiLz4KICA8cGF0aCBmaWxsPSIjZmZmIiBkPSJNNDAgMTZjLTEzLjMgMC0yNCAxMC43LTI0IDI0czEwLjcgMjQgMjQgMjQgMjQtMTAuNyAyNC0yNC0xMC43LTI0LTI0LTI0em0wIDQyYy05LjkgMC0xOC04LjEtMTgtMThzOC4xLTE4IDE4LTE4IDE4IDguMSAxOCAxOC04LjEgMTgtMTggMTh6Ii8+CiAgPGNpcmNsZSBjeD0iNDAiIGN5PSI0MCIgcj0iOCIgZmlsbD0iI2ZmZiIvPgo8L3N2Zz4K"
            alt="Grafana"
            sx={{ width: 48, height: 48 }}
          />
          <Box>
            <Typography variant="h5" fontWeight={700}>
              Grafana OpenTelemetry LGTM
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Loki · Grafana · Tempo · Prometheus — all-in-one observability stack
            </Typography>
          </Box>
          <Box sx={{ ml: "auto", display: "flex", alignItems: "center" }}>
            <Typography variant="body2" color="text.secondary">
              Status
            </Typography>
            <StatusBadge status={status} />
            <Tooltip title="Refresh status">
              <IconButton
                size="small"
                sx={{ ml: 1 }}
                onClick={checkStatus}
                disabled={actionLoading}
              >
                <RefreshIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>

        {/* Controls */}
        <Paper sx={{ p: 2, mb: 2 }}>
          <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1.5 }}>
            Controls
          </Typography>
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
            <Button
              variant="contained"
              color="primary"
              startIcon={
                actionLoading ? (
                  <CircularProgress size={16} color="inherit" />
                ) : (
                  <PlayArrowIcon />
                )
              }
              disabled={!canStart}
              onClick={handleStart}
            >
              Start
            </Button>
            {isPaused && (
              <Button
                variant="contained"
                color="info"
                startIcon={<PauseIcon />}
                disabled={!canUnpause}
                onClick={handleUnpause}
              >
                Unpause
              </Button>
            )}
            <Button
              variant="outlined"
              startIcon={<StopIcon />}
              disabled={!canStop}
              onClick={handleStop}
            >
              Stop
            </Button>
            <Button
              variant="outlined"
              startIcon={<RestartAltIcon />}
              disabled={!canRestart}
              onClick={handleRestart}
            >
              Restart
            </Button>
            <Button
              variant="outlined"
              color="error"
              startIcon={<DeleteOutlineIcon />}
              disabled={!canRemove}
              onClick={handleRemove}
              sx={{ ml: "auto" }}
            >
              Remove
            </Button>
          </Box>
        </Paper>

        {/* Open Grafana */}
        {(isRunning || isPaused) && (
          <Paper sx={{ p: 2, mb: 2 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
              <Box sx={{ flexGrow: 1 }}>
                <Typography variant="subtitle1" fontWeight={600}>
                  Grafana Dashboard
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Default credentials: <strong>admin / admin</strong>
                </Typography>
              </Box>
              <Button
                variant="contained"
                color="secondary"
                endIcon={<OpenInNewIcon />}
                onClick={handleOpenGrafana}
                sx={{ color: "#000" }}
              >
                Open Grafana
              </Button>
            </Box>
          </Paper>
        )}

        {/* Endpoints */}
        <Paper sx={{ p: 2, mb: 2 }}>
          <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>
            OpenTelemetry Endpoints
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            Point your OTLP exporters at these addresses:
          </Typography>
          <EndpointRow
            label="OTLP gRPC"
            value={`localhost:${displayPorts.otlpGrpc}`}
            onCopy={handleCopy}
          />
          <Divider sx={{ my: 0.5 }} />
          <EndpointRow
            label="OTLP HTTP"
            value={`http://localhost:${displayPorts.otlpHttp}`}
            onCopy={handleCopy}
          />
          <Divider sx={{ my: 0.5 }} />
          <EndpointRow
            label="Grafana UI"
            value={`http://localhost:${displayPorts.grafana}`}
            onCopy={handleCopy}
          />
          <Divider sx={{ my: 1 }} />
          <Typography variant="caption" color="text.secondary">
            Set{" "}
            <code>
              OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:
              {displayPorts.otlpHttp}
            </code>{" "}
            in your application to send telemetry to this stack.
          </Typography>
        </Paper>

        {/* Configuration */}
        <Accordion
          sx={{
            bgcolor: "background.paper",
            "&:before": { display: "none" },
            borderRadius: 1,
          }}
        >
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="subtitle1" fontWeight={600}>
              Configuration
            </Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={4}>
                <TextField
                  label="Grafana Port"
                  type="number"
                  size="small"
                  fullWidth
                  value={draftConfig.grafanaPort}
                  onChange={(e) =>
                    setDraftConfig((c) => ({
                      ...c,
                      grafanaPort: Number(e.target.value),
                    }))
                  }
                  inputProps={{ min: 1, max: 65535, step: 1 }}
                  error={!isValidPort(draftConfig.grafanaPort)}
                  helperText={
                    !isValidPort(draftConfig.grafanaPort)
                      ? "1\u201365535"
                      : "Default: 3000"
                  }
                />
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField
                  label="OTLP gRPC Port"
                  type="number"
                  size="small"
                  fullWidth
                  value={draftConfig.otlpGrpcPort}
                  onChange={(e) =>
                    setDraftConfig((c) => ({
                      ...c,
                      otlpGrpcPort: Number(e.target.value),
                    }))
                  }
                  inputProps={{ min: 1, max: 65535, step: 1 }}
                  error={!isValidPort(draftConfig.otlpGrpcPort)}
                  helperText={
                    !isValidPort(draftConfig.otlpGrpcPort)
                      ? "1\u201365535"
                      : "Default: 4317"
                  }
                />
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField
                  label="OTLP HTTP Port"
                  type="number"
                  size="small"
                  fullWidth
                  value={draftConfig.otlpHttpPort}
                  onChange={(e) =>
                    setDraftConfig((c) => ({
                      ...c,
                      otlpHttpPort: Number(e.target.value),
                    }))
                  }
                  inputProps={{ min: 1, max: 65535, step: 1 }}
                  error={!isValidPort(draftConfig.otlpHttpPort)}
                  helperText={
                    !isValidPort(draftConfig.otlpHttpPort)
                      ? "1\u201365535"
                      : "Default: 4318"
                  }
                />
              </Grid>
              <Grid item xs={12}>
                <Box sx={{ display: "flex", gap: 1 }}>
                  <Button
                    variant="contained"
                    size="small"
                    onClick={handleSaveConfig}
                  >
                    Save Configuration
                  </Button>
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={() => setDraftConfig(defaultConfig)}
                  >
                    Reset to Defaults
                  </Button>
                </Box>
              </Grid>
            </Grid>
          </AccordionDetails>
        </Accordion>
      </Box>

      <Snackbar
        open={!!toast}
        autoHideDuration={4000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          severity={toast?.severity ?? "info"}
          onClose={() => setToast(null)}
          variant="filled"
        >
          {toast?.msg}
        </Alert>
      </Snackbar>
    </ThemeProvider>
  );
}
