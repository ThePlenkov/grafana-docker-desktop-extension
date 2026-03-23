# Grafana OpenTelemetry LGTM – Docker Desktop Extension

A Docker Desktop extension that runs the complete
[Grafana LGTM](https://github.com/grafana/docker-otel-lgtm) (Loki, Grafana,
Tempo, Mimir) observability stack locally, with a built-in OpenTelemetry
Collector. Send logs, traces, and metrics from any container and inspect them
in Grafana's built-in UI.

## Features

- **Start / Stop / Restart / Remove** the `grafana/otel-lgtm` container
  directly from Docker Desktop
- **Pause / Unpause** support for paused containers
- **Configuration panel** – customise host ports before the first start;
  settings are persisted across sessions
- **Data persistence toggle** – optionally persist Grafana, Loki and Tempo data
  across container recreations
- **One-click "Open Grafana"** button to launch Grafana in your browser
- **Endpoint info** – shows the OTLP gRPC, OTLP HTTP, and Grafana URLs with
  copy-to-clipboard support (reflects actual port bindings of the running
  container)
- **Live status polling** – the status badge refreshes every 5 seconds
- **Port validation** – ports must be 1–65535 and must not overlap

## Quick start (extension)

```bash
# Install from a locally-built image
docker build -t grafana-otel-lgtm-extension .
docker extension install grafana-otel-lgtm-extension
```

Open Docker Desktop → **Grafana LGTM** tab.

> **Note:** The extension manages a container named `grafana-otel-lgtm-ext`.
> The standalone Compose file below uses a different container name
> (`grafana-otel-lgtm`) so the two modes do not conflict.

## Quick start (standalone Compose)

If you don't need the Docker Desktop extension, use the bundled Compose file
directly:

```bash
docker compose up -d
```

This starts `grafana/otel-lgtm` with the default ports bound to **localhost
only** (not exposed to the network):

| Service      | Port  |
|-------------|-------|
| Grafana UI  | 3000  |
| OTLP gRPC   | 4317  |
| OTLP HTTP   | 4318  |

## Sending telemetry

Point your application's OTLP exporter at:

```
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318   # HTTP
# or
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317   # gRPC
```

Then open <http://localhost:3000> (default credentials **admin / admin**) to
visualise your logs, traces, and metrics in Grafana.

## Development

```bash
cd ui
npm ci
npm run build    # production build → ui/dist/
npm run dev      # dev server at http://localhost:5173
```

Build the extension image:

```bash
docker build -t grafana-otel-lgtm-extension .
```
