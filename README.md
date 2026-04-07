# Videotik MVP Backbone

Current backend foundation implements:

- topic management
- idea generation
- quick_tip script generation with 4-6 scene rules and 20-25 second targets
- caption and hashtag generation
- scene image prompt generation
- subtitle and overlay pack generation
- video CMS listing and scheduling metadata
- workflow jobs with status, logs, and retry-aware state transitions
- activity logs, version snapshots, and cost records
- extensible content format modeling with `quick_tip` seeded first
- basic video and scene domain models
- expanded Prisma schema and migrations for future persistence
- render callback verification, callback receipts, and reconciliation hardening
- Prisma-backed persistence for key operational entities when `DATABASE_URL` is configured

## Architecture

- `apps/api`: thin Fastify transport layer
- `packages/core`: typed domain models, business rules, application services, ports
- `packages/database`: Prisma schema, migrations, seeds, in-memory adapters, partial Prisma repositories

## Why This Shape

- Business rules stay in `packages/core`, not in routes.
- Repositories and generation providers are async ports, so Banana/OpenAI/ElevenLabs/render jobs/publishing can be added later without changing the use-case contracts.
- `quick_tip` is seeded as the first format, but content formats are modeled as data, not hardcoded branches.
- The app can run in `in-memory` mode with no DB, or `prisma-hybrid` mode where `topics`, `content_formats`, `ideas`, `scripts`, `videos`, `assets`, `image_prompt_packs`, `subtitle_packs`, `publication_schedules`, `publish_attempts`, `voice_jobs`, `workflow_jobs`, `workflow_job_logs`, `activity_logs`, `cost_logs`, `version_records`, and `callback_receipts` persist in Postgres while the remaining MVP entities stay in-memory.
- Async generation flows now emit workflow jobs, logs, activity entries, version snapshots, and cost records.

## Endpoints

- `GET /health`
- `GET /formats`
- `GET /topics`
- `POST /topics`
- `PATCH /topics/:topicId`
- `POST /topics/:topicId/archive`
- `POST /ideas/generate`
- `POST /scripts/generate`
- `POST /captions/generate`
- `GET /videos`
- `GET /videos/:videoId`
- `POST /videos/:videoId/image-prompts/generate`
- `POST /videos/:videoId/subtitles/generate`
- `POST /videos/:videoId/voices/generate`
- `POST /videos/:videoId/render/validate`
- `POST /videos/:videoId/render`
- `POST /videos/:videoId/render/complete`
- `POST /videos/:videoId/render/fail`
- `POST /render/reconcile`
- `POST /videos/:videoId/schedule`
- `POST /videos/:videoId/publish/validate`
- `POST /videos/:videoId/publish`
- `POST /videos/:videoId/publish/callback`
- `GET /videos/:videoId/publish-attempts`
- `POST /publish/reconcile`
- `POST /videos/:videoId/subtitle-config`
- `POST /videos/:videoId/scenes/:sceneId/subtitle-config`
- `POST /videos/:videoId/scenes/:sceneId/images/manual`
- `POST /videos/:videoId/scenes/:sceneId/images/:assetId/activate`
- `GET /schedules`
- `GET /jobs`
- `GET /jobs/:jobId/logs`
- `GET /activity`
- `GET /costs`
- `GET /versions/:entityType/:entityId`

## Run

```bash
npm install
npm run check
npm run dev:api
```

Full staging-oriented smoke sweep:

```bash
npm run preflight:staging
npm run preflight:staging:snapshot
npm run preflight:staging:baseline
npm run preflight:staging:diff
npm run preflight:staging:diff:strict
npm run smoke:publish:modes
npm run pilot:readiness
npm run pilot:dry-run:dataset
npm run smoke:staging:full
```

Targeted publish mode matrix smoke:

```bash
npm run smoke:publish:modes
```

Pilot readiness report (writes `.artifacts/pilot/pilot-readiness.json`):

```bash
npm run pilot:readiness
npm run pilot:readiness:strict
```

Pilot dry-run dataset report (writes `.artifacts/pilot/pilot-dry-run-report.json`):

```bash
npm run pilot:dry-run:dataset
npm run pilot:dry-run:dataset:strict
```

Committed drift baseline file:

- `infra/observability/preflight/staging-preflight.baseline.json`

Manual controlled baseline promotion workflow:

- `.github/workflows/promote-preflight-baseline.yml` (`workflow_dispatch`)
- `.github/workflows/pilot-readiness.yml` (`workflow_dispatch`)
- `.github/workflows/pilot-dry-run-dataset.yml` (`workflow_dispatch`)

Pilot staging checklist:

- `docs/PILOT_EXECUTION_READINESS.md`

## Prisma

Use `DATABASE_URL` to enable Prisma-backed persistence:

```bash
cp .env.example .env
npm run db:validate
npm run db:migrate:deploy
```

`GET /health` reports the active `persistenceMode`.
`GET /health` also exposes runtime reconciliation health for render/publish loops:
last run timestamps, consecutive failures, and latest summary counts.

Render reconciliation can be tuned with:

- `RENDER_RECONCILIATION_ENABLED`
- `RENDER_RECONCILIATION_INTERVAL_MS`
- `RENDER_RECONCILIATION_STALE_AFTER_MS`
- `RENDER_RECONCILIATION_BATCH_SIZE`
- `RENDER_RECONCILIATION_OWNER_ID`
- `RENDER_RECONCILIATION_LEASE_MS`
- `PUBLISH_RECONCILIATION_ENABLED`
- `PUBLISH_RECONCILIATION_INTERVAL_MS`
- `PUBLISH_RECONCILIATION_STALE_AFTER_MS`
- `PUBLISH_RECONCILIATION_BATCH_SIZE`
- `PUBLISH_RECONCILIATION_OWNER_ID`
- `PUBLISH_RECONCILIATION_LEASE_MS`
- `PUBLISH_CALLBACK_SECRET` or `TIKTOK_PUBLISH_CALLBACK_SECRET`
- `PUBLISH_CALLBACK_TOLERANCE_SECONDS`
- `INTERNAL_RECONCILIATION_TOKEN` (when set, `/render/reconcile` and `/publish/reconcile` require `x-reconcile-token`)
- `RENDER_CALLBACK_SECRET` or `TEMPLATE_RENDER_CALLBACK_SECRET`
- `RENDER_RECONCILIATION_WARN_CONSECUTIVE_FAILURES`
- `RENDER_RECONCILIATION_WARN_FAILED_COUNT`
- `RENDER_RECONCILIATION_WARN_PENDING_COUNT`
- `RENDER_RECONCILIATION_WARN_NO_SUCCESS_MS`
- `PUBLISH_RECONCILIATION_WARN_CONSECUTIVE_FAILURES`
- `PUBLISH_RECONCILIATION_WARN_FAILED_COUNT`
- `PUBLISH_RECONCILIATION_WARN_PENDING_COUNT`
- `PUBLISH_RECONCILIATION_WARN_NO_SUCCESS_MS`

## Reconciliation Runbook (MVP)

When `GET /health` shows high `consecutiveFailures` or large `lastResult.pendingCount`:

1. Check logs around `Render reconciliation tick completed.` / `Publish reconciliation tick completed.` and warning entries.
2. Trigger a protected manual reconcile call (`POST /render/reconcile` or `POST /publish/reconcile` with `x-reconcile-token`) to validate live recovery.
3. Inspect `GET /jobs`, `/videos/:videoId/publish-attempts`, and `/activity` for stuck entities and workflow errors.
4. If provider callbacks are delayed, verify callback signature/timestamp settings and provider webhook delivery health.

## Alerting Templates

Sample alert templates for reconciliation monitoring live under:

- `infra/observability/prometheus/json-exporter/reconciliation-health-module.yml`
- `infra/observability/prometheus/alerts/reconciliation-alerts.rules.yml`
- `infra/observability/loki/reconciliation-alerts.yml`
- `infra/observability/grafana/reconciliation-overview.dashboard.json`
- `infra/observability/grafana/alerting/reconciliation-unified-alerting.yml`
- `infra/observability/grafana/alerting/contact-points.yml`
- `infra/observability/grafana/alerting/notification-policies.yml`
- `infra/observability/sandbox/docker-compose.yml`

One-command local sandbox:

- `npm run sandbox:observability:up`
- `npm run sandbox:observability:down`
- `npm run sandbox:observability:e2e`

These templates are intentionally environment-agnostic and should be adapted to your labels, scrape jobs, and routing policies.
