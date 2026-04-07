import Fastify from "fastify";
import { DomainError, createEntityId, createSprint5Services } from "@videotik/core";
import { createSprint1PersistenceRuntime } from "@videotik/database";
import { TemplateImagePromptGenerationAdapter, TemplateSubtitleCompositionAdapter } from "./adapters/template-media-planning-adapter";
import { TemplateSceneVoiceGenerationAdapter } from "./adapters/template-scene-voice-generation-adapter";
import { TemplateTextGenerationAdapter } from "./adapters/template-text-generation-adapter";
import { TemplateRenderPipelineAdapter } from "./adapters/template-render-pipeline-adapter";
import { TikTokPublishingProvider } from "./adapters/tiktok-publishing-provider";
import { ReconciliationHealthTracker, readPositiveIntegerEnv } from "./runtime/reconciliation-health";
import type { ApiErrorResponse, HealthResponse } from "./routes/api-contracts";
import { registerAssetRoutes } from "./routes/assets-routes";
import { registerFormatRoutes } from "./routes/format-routes";
import { registerGenerationRoutes } from "./routes/generation-routes";
import { registerPublishingRoutes } from "./routes/publishing-routes";
import { registerRenderRoutes } from "./routes/render-routes";
import { registerTopicRoutes } from "./routes/topic-routes";

interface HttpClientErrorLike {
  statusCode: number;
  message: string;
  code?: string;
}

const isHttpClientErrorLike = (error: unknown): error is HttpClientErrorLike => {
  return (
    typeof error === "object" &&
    error !== null &&
    typeof (error as { statusCode?: unknown }).statusCode === "number" &&
    typeof (error as { message?: unknown }).message === "string"
  );
};

export const buildServer = () => {
  const app = Fastify({
    logger: true
  });
  const persistence = createSprint1PersistenceRuntime();
  const services = createSprint5Services({
    repositories: persistence.repositories,
    textGenerationPort: new TemplateTextGenerationAdapter(),
    imagePromptGenerationPort: new TemplateImagePromptGenerationAdapter(),
    sceneVoiceGenerationPort: new TemplateSceneVoiceGenerationAdapter(),
    subtitleCompositionPort: new TemplateSubtitleCompositionAdapter(),
    renderPipelines: [new TemplateRenderPipelineAdapter()],
    publishingProviders: [new TikTokPublishingProvider()]
  });
  const renderReconciliationEnabled =
    process.env.RENDER_RECONCILIATION_ENABLED?.trim().toLowerCase() !== "false";
  const renderReconciliationIntervalMs = Number(
    process.env.RENDER_RECONCILIATION_INTERVAL_MS ?? 60_000
  );
  const renderReconciliationStaleAfterMs = Number(
    process.env.RENDER_RECONCILIATION_STALE_AFTER_MS ?? 30 * 60 * 1000
  );
  const renderReconciliationBatchSize = Number(
    process.env.RENDER_RECONCILIATION_BATCH_SIZE ?? 25
  );
  const renderReconciliationOwnerId =
    process.env.RENDER_RECONCILIATION_OWNER_ID?.trim() || createEntityId("renderworker");
  const configuredRenderReconciliationLeaseMs = Number(
    process.env.RENDER_RECONCILIATION_LEASE_MS ??
      Math.max(renderReconciliationIntervalMs * 2, 120_000)
  );
  const renderReconciliationLeaseMs =
    Number.isFinite(configuredRenderReconciliationLeaseMs) &&
    configuredRenderReconciliationLeaseMs > 0
      ? configuredRenderReconciliationLeaseMs
      : 120_000;
  const publishReconciliationEnabled =
    process.env.PUBLISH_RECONCILIATION_ENABLED?.trim().toLowerCase() !== "false";
  const publishReconciliationIntervalMs = Number(
    process.env.PUBLISH_RECONCILIATION_INTERVAL_MS ?? 60_000
  );
  const publishReconciliationStaleAfterMs = Number(
    process.env.PUBLISH_RECONCILIATION_STALE_AFTER_MS ?? 6 * 60 * 60 * 1000
  );
  const publishReconciliationBatchSize = Number(
    process.env.PUBLISH_RECONCILIATION_BATCH_SIZE ?? 25
  );
  const publishReconciliationOwnerId =
    process.env.PUBLISH_RECONCILIATION_OWNER_ID?.trim() || createEntityId("publishworker");
  const configuredPublishReconciliationLeaseMs = Number(
    process.env.PUBLISH_RECONCILIATION_LEASE_MS ??
      Math.max(publishReconciliationIntervalMs * 2, 120_000)
  );
  const publishReconciliationLeaseMs =
    Number.isFinite(configuredPublishReconciliationLeaseMs) &&
    configuredPublishReconciliationLeaseMs > 0
      ? configuredPublishReconciliationLeaseMs
      : 120_000;
  const renderWarnConsecutiveFailures = readPositiveIntegerEnv(
    "RENDER_RECONCILIATION_WARN_CONSECUTIVE_FAILURES",
    3
  );
  const renderWarnFailedCount = readPositiveIntegerEnv(
    "RENDER_RECONCILIATION_WARN_FAILED_COUNT",
    1
  );
  const renderWarnPendingCount = readPositiveIntegerEnv(
    "RENDER_RECONCILIATION_WARN_PENDING_COUNT",
    100
  );
  const renderWarnNoSuccessMs = readPositiveIntegerEnv(
    "RENDER_RECONCILIATION_WARN_NO_SUCCESS_MS",
    Math.max(renderReconciliationIntervalMs * 10, 15 * 60 * 1000)
  );
  const publishWarnConsecutiveFailures = readPositiveIntegerEnv(
    "PUBLISH_RECONCILIATION_WARN_CONSECUTIVE_FAILURES",
    3
  );
  const publishWarnFailedCount = readPositiveIntegerEnv(
    "PUBLISH_RECONCILIATION_WARN_FAILED_COUNT",
    1
  );
  const publishWarnPendingCount = readPositiveIntegerEnv(
    "PUBLISH_RECONCILIATION_WARN_PENDING_COUNT",
    100
  );
  const publishWarnNoSuccessMs = readPositiveIntegerEnv(
    "PUBLISH_RECONCILIATION_WARN_NO_SUCCESS_MS",
    Math.max(publishReconciliationIntervalMs * 10, 15 * 60 * 1000)
  );
  const reconcileToken = process.env.INTERNAL_RECONCILIATION_TOKEN?.trim() || undefined;
  const renderReconciliationHealth = new ReconciliationHealthTracker(
    "render",
    {
      enabled: renderReconciliationEnabled,
      intervalMs: renderReconciliationIntervalMs,
      staleAfterMs: renderReconciliationStaleAfterMs,
      batchSize: renderReconciliationBatchSize,
      ownerId: renderReconciliationOwnerId,
      leaseMs: renderReconciliationLeaseMs
    },
    {
      consecutiveFailureWarnThreshold: renderWarnConsecutiveFailures,
      failedCountWarnThreshold: renderWarnFailedCount,
      pendingCountWarnThreshold: renderWarnPendingCount,
      noSuccessWarnAfterMs: renderWarnNoSuccessMs
    }
  );
  const publishReconciliationHealth = new ReconciliationHealthTracker(
    "publish",
    {
      enabled: publishReconciliationEnabled,
      intervalMs: publishReconciliationIntervalMs,
      staleAfterMs: publishReconciliationStaleAfterMs,
      batchSize: publishReconciliationBatchSize,
      ownerId: publishReconciliationOwnerId,
      leaseMs: publishReconciliationLeaseMs
    },
    {
      consecutiveFailureWarnThreshold: publishWarnConsecutiveFailures,
      failedCountWarnThreshold: publishWarnFailedCount,
      pendingCountWarnThreshold: publishWarnPendingCount,
      noSuccessWarnAfterMs: publishWarnNoSuccessMs
    }
  );
  let renderReconciliationTimer: NodeJS.Timeout | undefined;
  let renderReconciliationRunning = false;
  let publishReconciliationTimer: NodeJS.Timeout | undefined;
  let publishReconciliationRunning = false;

  const logWarnings = (
    pipeline: "render" | "publish",
    warnings: string[]
  ): void => {
    for (const warning of warnings) {
      app.log.warn(
        {
          pipeline,
          reconciliation: {
            render: renderReconciliationHealth.snapshot(),
            publish: publishReconciliationHealth.snapshot()
          }
        },
        warning
      );
    }
  };

  app.addHook("onReady", async () => {
    await persistence.onReady();

    if (
      renderReconciliationEnabled &&
      Number.isFinite(renderReconciliationIntervalMs) &&
      renderReconciliationIntervalMs > 0
    ) {
      renderReconciliationTimer = setInterval(async () => {
        if (renderReconciliationRunning) {
          return;
        }

        renderReconciliationRunning = true;
        renderReconciliationHealth.markRunStarted();

        try {
          const result = await services.renderWorkflowService.reconcileRenderJobs({
            ownerId: renderReconciliationOwnerId,
            leaseMs: renderReconciliationLeaseMs,
            staleAfterMs: renderReconciliationStaleAfterMs,
            limit: renderReconciliationBatchSize
          });
          const warnings = renderReconciliationHealth.markRunSucceeded({
            scannedCount: result.scannedCount,
            pendingCount: result.pendingCount,
            failedCount: result.failedCount,
            successCount: result.completedCount
          });

          if (result.scannedCount > 0 || result.failedCount > 0) {
            app.log.info(
              {
                pipeline: "render",
                summary: {
                  scannedCount: result.scannedCount,
                  completedCount: result.completedCount,
                  failedCount: result.failedCount,
                  pendingCount: result.pendingCount
                }
              },
              "Render reconciliation tick completed."
            );
          }

          logWarnings("render", warnings);
        } catch (error) {
          const warnings = renderReconciliationHealth.markRunFailed(error);
          app.log.error(error);
          logWarnings("render", warnings);
        } finally {
          renderReconciliationRunning = false;
        }
      }, renderReconciliationIntervalMs);
      renderReconciliationTimer.unref();
    }

    if (
      publishReconciliationEnabled &&
      Number.isFinite(publishReconciliationIntervalMs) &&
      publishReconciliationIntervalMs > 0
    ) {
      publishReconciliationTimer = setInterval(async () => {
        if (publishReconciliationRunning) {
          return;
        }

        publishReconciliationRunning = true;
        publishReconciliationHealth.markRunStarted();

        try {
          const result =
            await services.publishingWorkflowService.reconcileSubmittedPublishAttempts({
            ownerId: publishReconciliationOwnerId,
            leaseMs: publishReconciliationLeaseMs,
            staleAfterMs: publishReconciliationStaleAfterMs,
            limit: publishReconciliationBatchSize
          });
          const warnings = publishReconciliationHealth.markRunSucceeded({
            scannedCount: result.scannedCount,
            pendingCount: result.pendingCount,
            failedCount: result.failedCount,
            successCount: result.publishedCount,
            manualActionRequiredCount: result.manualActionRequiredCount
          });

          if (result.scannedCount > 0 || result.failedCount > 0) {
            app.log.info(
              {
                pipeline: "publish",
                summary: {
                  scannedCount: result.scannedCount,
                  publishedCount: result.publishedCount,
                  manualActionRequiredCount: result.manualActionRequiredCount,
                  failedCount: result.failedCount,
                  pendingCount: result.pendingCount
                }
              },
              "Publish reconciliation tick completed."
            );
          }

          logWarnings("publish", warnings);
        } catch (error) {
          const warnings = publishReconciliationHealth.markRunFailed(error);
          app.log.error(error);
          logWarnings("publish", warnings);
        } finally {
          publishReconciliationRunning = false;
        }
      }, publishReconciliationIntervalMs);
      publishReconciliationTimer.unref();
    }
  });

  app.addHook("onClose", async () => {
    if (renderReconciliationTimer) {
      clearInterval(renderReconciliationTimer);
      renderReconciliationTimer = undefined;
    }
    if (publishReconciliationTimer) {
      clearInterval(publishReconciliationTimer);
      publishReconciliationTimer = undefined;
    }

    await persistence.onClose();
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof DomainError) {
      const response: ApiErrorResponse = {
        error: {
          code: error.code,
          message: error.message,
          details: error.details ?? {}
        }
      };
      reply.code(error.statusCode).send(response);
      return;
    }

    if (isHttpClientErrorLike(error) && error.statusCode >= 400 && error.statusCode < 500) {
      const response: ApiErrorResponse = {
        error: {
          code:
            error.code === "FST_ERR_CTP_INVALID_JSON_BODY"
              ? "invalid_json_body"
              : typeof error.code === "string"
                ? error.code.toLowerCase()
                : `http_${error.statusCode}`,
          message: error.message,
          details:
            error.code === "FST_ERR_CTP_INVALID_JSON_BODY"
              ? {
                  expectedType: "json_object"
                }
              : {}
        }
      };
      reply.code(error.statusCode).send(response);
      return;
    }

    app.log.error(error);
    const response: ApiErrorResponse = {
      error: {
        code: "internal_error",
        message: "Internal server error.",
        details: {}
      }
    };
    reply.code(500).send(response);
  });

  app.setNotFoundHandler((_request, reply) => {
    const response: ApiErrorResponse = {
      error: {
        code: "not_found",
        message: "Route not found.",
        details: {}
      }
    };
    reply.code(404).send(response);
  });

  app.get("/health", async (): Promise<HealthResponse> => {
    const formats = await services.contentFormatService.listFormats();

    return {
      status: "ok",
      persistenceMode: persistence.mode,
      seededFormats: formats.map((format) => format.slug),
      reconciliation: {
        render: renderReconciliationHealth.snapshot(),
        publish: publishReconciliationHealth.snapshot()
      }
    };
  });

  registerFormatRoutes(app, services);
  registerTopicRoutes(app, services);
  registerGenerationRoutes(app, services);
  registerAssetRoutes(app, services);
  registerRenderRoutes(app, {
    ...services,
    renderReconciliationOwnerId,
    renderReconciliationLeaseMs,
    ...(reconcileToken ? { reconcileToken } : {})
  });
  registerPublishingRoutes(app, {
    ...services,
    publishReconciliationOwnerId,
    publishReconciliationLeaseMs,
    ...(reconcileToken ? { reconcileToken } : {})
  });

  return app;
};

if (require.main === module) {
  const port = Number(process.env.PORT ?? 3000);

  buildServer()
    .listen({
      port,
      host: "0.0.0.0"
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
