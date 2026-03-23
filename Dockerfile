# Extension image
FROM alpine
LABEL org.opencontainers.image.title="Grafana OpenTelemetry LGTM" \
    org.opencontainers.image.description="Docker Desktop extension to run the Grafana LGTM (Loki, Grafana, Tempo, Mimir) OpenTelemetry stack locally" \
    org.opencontainers.image.vendor="ThePlenkov" \
    com.docker.desktop.extension.api.version=">= 0.3.3" \
    com.docker.desktop.extension.icon="grafana.svg" \
    com.docker.extension.screenshots="[]" \
    com.docker.extension.detailed-description="Run the complete Grafana OpenTelemetry LGTM stack (Loki, Grafana, Tempo, Mimir) locally as a Docker Desktop extension. Collect and visualise logs, traces, and metrics via OpenTelemetry." \
    com.docker.extension.publisher-url="https://github.com/ThePlenkov/grafana-docker-desktop-extension" \
    com.docker.extension.additional-urls="[]" \
    com.docker.extension.categories="monitoring,observability"

COPY ui/dist /ui
COPY metadata.json .
COPY grafana.svg .
COPY docker-compose.yaml .
