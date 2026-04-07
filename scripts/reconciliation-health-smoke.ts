import assert from "node:assert/strict";
import { buildServer } from "../apps/api/src/server";

const sleep = async (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const run = async (): Promise<void> => {
  delete process.env.DATABASE_URL;
  process.env.RENDER_RECONCILIATION_ENABLED = "true";
  process.env.RENDER_RECONCILIATION_INTERVAL_MS = "50";
  process.env.RENDER_RECONCILIATION_STALE_AFTER_MS = "1000";
  process.env.RENDER_RECONCILIATION_BATCH_SIZE = "10";
  process.env.RENDER_RECONCILIATION_OWNER_ID = "health-smoke-render";
  process.env.RENDER_RECONCILIATION_LEASE_MS = "250";
  process.env.PUBLISH_RECONCILIATION_ENABLED = "true";
  process.env.PUBLISH_RECONCILIATION_INTERVAL_MS = "50";
  process.env.PUBLISH_RECONCILIATION_STALE_AFTER_MS = "1000";
  process.env.PUBLISH_RECONCILIATION_BATCH_SIZE = "10";
  process.env.PUBLISH_RECONCILIATION_OWNER_ID = "health-smoke-publish";
  process.env.PUBLISH_RECONCILIATION_LEASE_MS = "250";
  process.env.RENDER_RECONCILIATION_WARN_CONSECUTIVE_FAILURES = "3";
  process.env.PUBLISH_RECONCILIATION_WARN_CONSECUTIVE_FAILURES = "3";

  const app = buildServer();

  try {
    await app.ready();
    await sleep(300);

    const response = await app.inject({
      method: "GET",
      url: "/health"
    });
    assert.equal(response.statusCode, 200);

    const body = response.json() as {
      status: string;
      reconciliation: {
        render: {
          enabled: boolean;
          ownerId: string;
          intervalMs: number;
          leaseMs: number;
          consecutiveFailures: number;
          lastRunCompletedAt?: string;
          lastResult?: {
            scannedCount: number;
            pendingCount: number;
            failedCount: number;
            successCount: number;
          };
        };
        publish: {
          enabled: boolean;
          ownerId: string;
          intervalMs: number;
          leaseMs: number;
          consecutiveFailures: number;
          lastRunCompletedAt?: string;
          lastResult?: {
            scannedCount: number;
            pendingCount: number;
            failedCount: number;
            successCount: number;
            manualActionRequiredCount?: number;
          };
        };
      };
    };

    assert.equal(body.status, "ok");
    assert.equal(body.reconciliation.render.enabled, true);
    assert.equal(body.reconciliation.publish.enabled, true);
    assert.equal(body.reconciliation.render.ownerId, "health-smoke-render");
    assert.equal(body.reconciliation.publish.ownerId, "health-smoke-publish");
    assert.equal(body.reconciliation.render.intervalMs, 50);
    assert.equal(body.reconciliation.publish.intervalMs, 50);
    assert.equal(body.reconciliation.render.leaseMs, 250);
    assert.equal(body.reconciliation.publish.leaseMs, 250);
    assert.equal(body.reconciliation.render.consecutiveFailures, 0);
    assert.equal(body.reconciliation.publish.consecutiveFailures, 0);
    assert.ok(body.reconciliation.render.lastRunCompletedAt);
    assert.ok(body.reconciliation.publish.lastRunCompletedAt);
    assert.ok(body.reconciliation.render.lastResult);
    assert.ok(body.reconciliation.publish.lastResult);
    assert.ok(body.reconciliation.render.lastResult.scannedCount >= 0);
    assert.ok(body.reconciliation.publish.lastResult.scannedCount >= 0);
    assert.ok(body.reconciliation.render.lastResult.pendingCount >= 0);
    assert.ok(body.reconciliation.publish.lastResult.pendingCount >= 0);
    assert.ok(body.reconciliation.render.lastResult.failedCount >= 0);
    assert.ok(body.reconciliation.publish.lastResult.failedCount >= 0);
    assert.ok(body.reconciliation.render.lastResult.successCount >= 0);
    assert.ok(body.reconciliation.publish.lastResult.successCount >= 0);

    console.log(
      JSON.stringify(
        {
          ok: true,
          render: {
            ownerId: body.reconciliation.render.ownerId,
            lastRunCompletedAt: body.reconciliation.render.lastRunCompletedAt,
            lastResult: body.reconciliation.render.lastResult
          },
          publish: {
            ownerId: body.reconciliation.publish.ownerId,
            lastRunCompletedAt: body.reconciliation.publish.lastRunCompletedAt,
            lastResult: body.reconciliation.publish.lastResult
          }
        },
        null,
        2
      )
    );
  } finally {
    await app.close();
  }
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
