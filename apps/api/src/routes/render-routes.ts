import type { FastifyInstance } from "fastify";
import { DomainError, type RenderWorkflowService, type VideoWorkflowService } from "@videotik/core";
import { assetStorageProviders } from "@videotik/core";
import {
  ensureObject,
  readHeaderString,
  readOptionalEnumValue,
  readOptionalNumber,
  readOptionalString,
  readString
} from "./http-utils";

type ValidateRenderReadinessResponse = Awaited<
  ReturnType<VideoWorkflowService["validateRenderReadiness"]>
>;
type EnqueueRenderResponse = Awaited<ReturnType<RenderWorkflowService["enqueueRender"]>>;
type CompleteRenderResponse = Awaited<ReturnType<RenderWorkflowService["completeRender"]>>;
type FailRenderResponse = Awaited<ReturnType<RenderWorkflowService["failRender"]>>;
type ReconcileRenderJobsResponse = Awaited<
  ReturnType<RenderWorkflowService["reconcileRenderJobs"]>
>;

const assertReconciliationAccess = (
  headers: Record<string, string | string[] | undefined>,
  reconcileToken?: string
): void => {
  if (!reconcileToken) {
    return;
  }

  const providedToken = readHeaderString(headers, "x-reconcile-token");

  if (providedToken !== reconcileToken) {
    throw new DomainError("Unauthorized reconcile request.", "unauthorized", {}, 401);
  }
};

export const registerRenderRoutes = (
  app: FastifyInstance,
  services: {
    videoWorkflowService: VideoWorkflowService;
    renderWorkflowService: RenderWorkflowService;
    renderReconciliationOwnerId: string;
    renderReconciliationLeaseMs: number;
    reconcileToken?: string;
  }
): void => {
  app.post<{ Params: { videoId: string } }>(
    "/videos/:videoId/render/validate",
    async (request): Promise<ValidateRenderReadinessResponse> => {
      return services.videoWorkflowService.validateRenderReadiness(request.params.videoId);
    }
  );

  app.post<{ Params: { videoId: string } }>(
    "/videos/:videoId/render",
    async (request, reply): Promise<EnqueueRenderResponse> => {
      const body = request.body === undefined ? {} : ensureObject(request.body);
      const retryOfWorkflowJobId = readOptionalString(body, "retryOfWorkflowJobId");
      const result = await services.renderWorkflowService.enqueueRender({
        videoId: request.params.videoId,
        ...(retryOfWorkflowJobId ? { retryOfWorkflowJobId } : {})
      });

      reply.code(202);
      return result;
    }
  );

  app.post<{ Params: { videoId: string } }>(
    "/videos/:videoId/render/complete",
    async (request): Promise<CompleteRenderResponse> => {
      const body = ensureObject(request.body);
      const storageProvider = readOptionalEnumValue(body, "storageProvider", assetStorageProviders);
      const storageKey = readOptionalString(body, "storageKey");
      const mimeType = readOptionalString(body, "mimeType");
      const bytes = readOptionalNumber(body, "bytes");
      const width = readOptionalNumber(body, "width");
      const height = readOptionalNumber(body, "height");
      const durationSeconds = readOptionalNumber(body, "durationSeconds");
      const providerStatus = readOptionalString(body, "providerStatus");

      return services.renderWorkflowService.completeRender({
        videoId: request.params.videoId,
        workflowJobId: readString(body, "workflowJobId"),
        callbackToken: readString(body, "callbackToken"),
        providerJobId: readString(body, "providerJobId"),
        idempotencyKey: readHeaderString(request.headers, "x-render-callback-id"),
        signature: readHeaderString(request.headers, "x-render-callback-signature"),
        signatureTimestamp: readHeaderString(request.headers, "x-render-callback-timestamp"),
        assetUrl: readString(body, "assetUrl"),
        ...(storageProvider ? { storageProvider } : {}),
        ...(storageKey ? { storageKey } : {}),
        ...(mimeType ? { mimeType } : {}),
        ...(bytes === undefined ? {} : { bytes }),
        ...(width === undefined ? {} : { width }),
        ...(height === undefined ? {} : { height }),
        ...(durationSeconds === undefined ? {} : { durationSeconds }),
        ...(providerStatus ? { providerStatus } : {})
      });
    }
  );

  app.post<{ Params: { videoId: string } }>(
    "/videos/:videoId/render/fail",
    async (request): Promise<FailRenderResponse> => {
      const body = ensureObject(request.body);
      const providerStatus = readOptionalString(body, "providerStatus");

      return services.renderWorkflowService.failRender({
        videoId: request.params.videoId,
        workflowJobId: readString(body, "workflowJobId"),
        callbackToken: readString(body, "callbackToken"),
        providerJobId: readString(body, "providerJobId"),
        idempotencyKey: readHeaderString(request.headers, "x-render-callback-id"),
        signature: readHeaderString(request.headers, "x-render-callback-signature"),
        signatureTimestamp: readHeaderString(request.headers, "x-render-callback-timestamp"),
        errorMessage: readString(body, "errorMessage"),
        ...(providerStatus ? { providerStatus } : {})
      });
    }
  );

  app.post(
    "/render/reconcile",
    async (request): Promise<ReconcileRenderJobsResponse> => {
      assertReconciliationAccess(request.headers, services.reconcileToken);
      const body = request.body === undefined ? {} : ensureObject(request.body);
      const staleAfterMs = readOptionalNumber(body, "staleAfterMs");
      const limit = readOptionalNumber(body, "limit");
      const ownerId = readOptionalString(body, "ownerId");
      const leaseMs = readOptionalNumber(body, "leaseMs");

      return services.renderWorkflowService.reconcileRenderJobs({
        ownerId: ownerId ?? services.renderReconciliationOwnerId,
        leaseMs: leaseMs ?? services.renderReconciliationLeaseMs,
        staleAfterMs: staleAfterMs ?? 30 * 60 * 1000,
        ...(limit === undefined ? {} : { limit })
      });
    }
  );
};
