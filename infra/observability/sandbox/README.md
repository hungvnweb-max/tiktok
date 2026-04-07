# Observability Sandbox

Local sandbox for end-to-end reconciliation monitoring:

- Videotik API (with reconciliation loops enabled)
- JSON exporter mapping `/health` to metrics
- Prometheus scraping + alert rules
- Grafana datasource, dashboard, and unified alerting provisioning

## One Command Up

```bash
docker compose -f infra/observability/sandbox/docker-compose.yml up --build
```

## Access

- API: `http://localhost:3000/health`
- Prometheus: `http://localhost:9090`
- Grafana: `http://localhost:3001` (`admin` / `admin`)
- Alert sink events: `http://localhost:9999/events`
- Mailhog UI: `http://localhost:8025`

## One Command Down

```bash
docker compose -f infra/observability/sandbox/docker-compose.yml down -v
```

## End-to-End Verify

```bash
npm run sandbox:observability:e2e
```

Optional flags:

- `-- --skip-up` when stack is already running
- `-- --keep-up` to keep containers after verification

The E2E check validates delivery, not only provisioning:

- triggers Grafana receiver test endpoint
- verifies webhook reaches alert sink
- verifies email reaches Mailhog inbox
- validates negative delivery branches:
  - webhook connection-refused path returns failed status
  - email invalid-address path returns failed status

## Notes

- Sandbox intentionally sets invalid reconciliation stale windows (`-1`) so consecutive failure alerts trigger quickly for validation.
- Replace alert placeholders before real environments:
  - `VIDEOTIK_ALERT_WEBHOOK_URL`
  - `VIDEOTIK_ALERT_EMAIL_TO`
