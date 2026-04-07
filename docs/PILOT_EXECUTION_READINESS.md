# Pilot Execution Readiness

This checklist is for staging pilot runs with real videos across `manual`, `semi_auto`, and `full_auto` publish modes.

## 1) Preflight

Run and confirm all pass:

```bash
npm run preflight:staging
npm run preflight:staging:snapshot
npm run preflight:staging:diff:strict
npm run check
npm run smoke:publish
npm run smoke:publish:modes
npm run pilot:readiness
npm run pilot:dry-run:dataset
npm run smoke:health
npm run smoke:observability
```

For hard gate behavior in CI or release checks:

```bash
npm run pilot:readiness:strict
```

Runner output artifact:

- `.artifacts/pilot/pilot-readiness.json`
- `.artifacts/pilot/pilot-dry-run-report.json`

Manual GitHub workflow for staging dataset dry-run:

- `.github/workflows/pilot-dry-run-dataset.yml`

## 2) Pilot Matrix

For each mode (`manual`, `semi_auto`, `full_auto`):

1. Create a staging video with real-format metadata.
2. Ensure pre-render and pre-publish validation pass.
3. Trigger publish flow once.
4. Verify attempt state progression and activity/cost records.
5. Verify reconcile behavior for `submitted` attempts.

Expected state outcomes:

- `manual`: attempt moves to `manual_action_required`.
- `semi_auto`: attempt reaches `submitted`, then reconcile moves to `manual_action_required`.
- `full_auto`: attempt reaches `published`; schedule and video end in `published`.

## 3) Rollback Checklist

If publish errors spike or stuck states increase:

1. Pause new publish submissions from orchestration layer.
2. Keep reconcile workers running to drain recoverable attempts.
3. Switch to `manual` mode for operational continuity.
4. Trigger protected reconcile endpoints to process backlog:
   - `POST /render/reconcile`
   - `POST /publish/reconcile`
5. Capture impacted `videoId` and `publishAttemptId` for incident review.

## 4) Oncall Checklist

1. Check `GET /health` reconciliation summaries.
2. Check dashboard panels for:
   - render/publish `consecutiveFailures`
   - render/publish `pendingCount`
   - render/publish `failedCount`
3. Check activity stream and publish attempt history for newest failures.
4. Confirm provider callback signature/timestamp headers are valid.
5. Record mitigation action and follow-up in incident log.

## 5) Exit Criteria For Pilot

Pilot can be marked stable only when:

- mode matrix passes end-to-end on staging data
- no unresolved submitted attempts older than policy window
- alerting tests pass for both positive and negative routes
- rollback drill has been executed at least once
