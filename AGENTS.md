# Project Notes

## Package manager
Use **bun** (not npm/yarn) for all JS/TS operations (`bun install`, `bun run build`, etc.).

## Build & verify
```sh
cd ui && bun run build
```

## Extension rebuild
```sh
cd ui && bun run build && cd .. && docker build -t grafana-otel-lgtm-extension . && docker extension update grafana-otel-lgtm-extension --force
```
