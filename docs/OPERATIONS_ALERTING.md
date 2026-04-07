# Operations Alerting (Reconciliation)

This document provides starter alerting templates for the render/publish reconciliation loops.

## Signals

Health endpoint:

- `GET /health`
- fields:
  - `reconciliation.render.*`
  - `reconciliation.publish.*`

Runtime warning logs:

- `render reconciliation has ...`
- `publish reconciliation has ...`
- `render reconciliation pending count ...`
- `publish reconciliation pending count ...`

## Included Templates

- Prometheus JSON exporter module:
  - `infra/observability/prometheus/json-exporter/reconciliation-health-module.yml`
- Prometheus alert rules:
  - `infra/observability/prometheus/alerts/reconciliation-alerts.rules.yml`
- Loki log-based rules:
  - `infra/observability/loki/reconciliation-alerts.yml`
- Grafana dashboard JSON:
  - `infra/observability/grafana/reconciliation-overview.dashboard.json`
- Grafana Unified Alerting provisioning:
  - `infra/observability/grafana/alerting/reconciliation-unified-alerting.yml`
  - `infra/observability/grafana/alerting/contact-points.yml`
  - `infra/observability/grafana/alerting/notification-policies.yml`

## Grafana Import

1. Open Grafana Dashboard import.
2. Upload `reconciliation-overview.dashboard.json`.
3. Map `DS_PROMETHEUS` to your Prometheus datasource.
4. Save dashboard (folder/tag as your ops convention).

## Grafana Unified Alerting Provisioning

1. Set `DS_PROMETHEUS_UID` in Grafana runtime environment (or replace placeholders manually).
2. Copy `reconciliation-unified-alerting.yml` into Grafana provisioning alerting directory.
2. Set contact point placeholders:
   - `VIDEOTIK_ALERT_WEBHOOK_URL`
   - `VIDEOTIK_ALERT_EMAIL_TO`
3. Copy all three files into Grafana provisioning alerting directory:
   - `reconciliation-unified-alerting.yml`
   - `contact-points.yml`
   - `notification-policies.yml`
4. Restart/reload Grafana provisioning.
5. Confirm rule group `videotik-reconciliation` is loaded and linked to the correct datasource.

## Local End-to-End Sandbox

Use the ready sandbox stack:

- `npm run sandbox:observability:up`
- `npm run sandbox:observability:down`
- `npm run sandbox:observability:e2e`
- `npm run preflight:staging` (fails fast when required staging env/secrets are missing)
- `npm run preflight:staging:snapshot` (writes JSON snapshot to `.artifacts/preflight/staging-preflight.json`)
- `npm run preflight:staging:baseline` (promotes current snapshot to baseline)
- `npm run preflight:staging:diff` (compares baseline vs current and warns drift)
- `npm run preflight:staging:diff:strict` (compares baseline vs current and fails on drift)
- `npm run smoke:staging:full` (runs typecheck + publish/health/observability smokes + sandbox e2e)

`preflight:staging` validates at least:

- `DATABASE_URL`
- `INTERNAL_RECONCILIATION_TOKEN`
- one render callback secret (`TEMPLATE_RENDER_CALLBACK_SECRET` or `RENDER_CALLBACK_SECRET`)
- one publish callback secret (`TIKTOK_PUBLISH_CALLBACK_SECRET` or `PUBLISH_CALLBACK_SECRET`)
- `VIDEOTIK_ALERT_WEBHOOK_URL`
- `VIDEOTIK_ALERT_EMAIL_TO`
- Docker daemon reachability (`docker info`)

`preflight:staging` also supports direct file output:

- `npm run preflight:staging -- --output <path-to-json>`

Snapshot diff script supports direct paths:

- `node .tmp-ts-scripts/scripts/preflight-snapshot-diff.js --baseline <baseline.json> --current <current.json> --output <diff.json>`
- add `--strict` to fail on drift
- add `--allow-missing-baseline` to skip diff if baseline file does not exist yet

Committed baseline source of truth:

- `infra/observability/preflight/staging-preflight.baseline.json`

CI now also runs `sandbox:observability:e2e` as a dedicated job so dashboard/alerting provisioning regressions are blocked automatically.
CI also produces preflight artifacts (`staging-preflight.json` + `staging-preflight-diff.json`) for config drift inspection.
CI runs preflight diff in strict mode against the committed baseline to block unexpected drift.
When that CI job fails, it uploads `observability-sandbox-diagnostics` artifact containing compose `ps` and service logs for triage.

Manual baseline promotion is available via workflow dispatch:

- `.github/workflows/promote-preflight-baseline.yml`
- dry-run mode (`apply_update=false`) only generates snapshot/diff artifacts
- apply mode (`apply_update=true`) promotes baseline and opens a draft PR if baseline changed

Compose file:

- `infra/observability/sandbox/docker-compose.yml`

`sandbox:observability:e2e` brings up the stack (unless already running), validates API/Prometheus/Grafana provisioning, then tears it down by default.
It also executes a Grafana receiver test and verifies webhook + email delivery through alert sink/Mailhog.
It additionally checks negative delivery behavior by asserting failed status for:

- unreachable webhook endpoint
- invalid email address

Sandbox includes:

- local webhook sink (`http://localhost:9999/events`)
- local SMTP inbox via Mailhog (`http://localhost:8025`)

## Recommended Rollout

1. Start with warning severity only for at least 3-7 days.
2. Tune thresholds based on normal backlog patterns.
3. Promote `failed_count` alerts to critical only after baseline is stable.
4. Route publish/render alerts to separate channels for faster triage.

## Threshold Source of Truth

Application-level warning thresholds are configurable via:

- `RENDER_RECONCILIATION_WARN_CONSECUTIVE_FAILURES`
- `RENDER_RECONCILIATION_WARN_FAILED_COUNT`
- `RENDER_RECONCILIATION_WARN_PENDING_COUNT`
- `RENDER_RECONCILIATION_WARN_NO_SUCCESS_MS`
- `PUBLISH_RECONCILIATION_WARN_CONSECUTIVE_FAILURES`
- `PUBLISH_RECONCILIATION_WARN_FAILED_COUNT`
- `PUBLISH_RECONCILIATION_WARN_PENDING_COUNT`
- `PUBLISH_RECONCILIATION_WARN_NO_SUCCESS_MS`

Keep external alerts aligned with these values to avoid noisy divergence.
