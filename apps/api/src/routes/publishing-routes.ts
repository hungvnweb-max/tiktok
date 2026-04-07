import { DomainError, type PublishAttempt, type PublishingWorkflowService } from "@videotik/core";
import type { FastifyInstance } from "fastify";
import type { ApiListResponse } from "./api-contracts";
import {
  ensureObject,
  readHeaderString,
  readOptionalEnumValue,
  readOptionalBoolean,
  readOptionalNumber,
  readOptionalString,
  readOptionalStringArray,
  readString
} from "./http-utils";

type ValidatePublishReadinessResponse = Awaited<
  ReturnType<PublishingWorkflowService["validatePublishReadiness"]>
>;
type PublishVideoResponse = Awaited<ReturnType<PublishingWorkflowService["publishVideo"]>>;
type PublishStatusCallbackResponse = Awaited<
  ReturnType<PublishingWorkflowService["handlePublishStatusCallback"]>
>;
type ReconcileSubmittedPublishAttemptsResponse = Awaited<
  ReturnType<PublishingWorkflowService["reconcileSubmittedPublishAttempts"]>
>;

const assertReconciliationAccess = (
  headers: Record<string, string | string[] | undefined>,
  reconcileToken?: string
): void => {
  if (!reconcileToken) {
    return;
  }

  const headerValue = headers["x-reconcile-token"];
  const providedToken = Array.isArray(headerValue) ? headerValue[0] : headerValue;

  if (typeof providedToken !== "string" || providedToken.trim().length === 0) {
    throw new DomainError("Header \"x-reconcile-token\" must be a non-empty string.", "invalid_header", {
      header: "x-reconcile-token"
    });
  }

  if (providedToken.trim() !== reconcileToken) {
    throw new DomainError("Unauthorized reconcile request.", "unauthorized", {}, 401);
  }
};

const publishCallbackStatuses = [
  "submitted",
  "manual_action_required",
  "published",
  "failed"
] as const;

export const registerPublishingRoutes = (
  app: FastifyInstance,
  services: {
    publishingWorkflowService: PublishingWorkflowService;
    publishReconciliationOwnerId: string;
    publishReconciliationLeaseMs: number;
    reconcileToken?: string;
  }
): void => {
  app.post<{ Params: { videoId: string } }>(
    "/videos/:videoId/publish/validate",
    async (request): Promise<ValidatePublishReadinessResponse> => {
      const body = request.body === undefined ? {} : ensureObject(request.body);

      return services.publishingWorkflowService.validatePublishReadiness({
        videoId: request.params.videoId,
        force: readOptionalBoolean(body, "force") ?? false
      });
    }
  );

  app.post<{ Params: { videoId: string } }>(
    "/videos/:videoId/publish",
    async (request, reply): Promise<PublishVideoResponse> => {
      const body = request.body === undefined ? {} : ensureObject(request.body);
      const result = await services.publishingWorkflowService.publishVideo({
        videoId: request.params.videoId,
        force: readOptionalBoolean(body, "force") ?? false
      });

      reply.code(201);
      return result;
    }
  );

  app.post<{ Params: { videoId: string } }>(
    "/videos/:videoId/publish/callback",
    async (request): Promise<PublishStatusCallbackResponse> => {
      const body = ensureObject(request.body);
      const publishedAtRaw = readOptionalString(body, "publishedAt");
      const publicationId = readOptionalString(body, "publicationId");
      const externalUrl = readOptionalString(body, "externalUrl");
      const failureMessage = readOptionalString(body, "failureMessage");
      const checklist = readOptionalStringArray(body, "checklist");
      const publishedAt =
        publishedAtRaw === undefined
          ? undefined
          : (() => {
              const parsed = new Date(publishedAtRaw);

              if (Number.isNaN(parsed.getTime())) {
                throw new DomainError(
                  "\"publishedAt\" must be a valid ISO date string when provided.",
                  "invalid_date",
                  {
                    field: "publishedAt"
                  }
                );
              }

              return parsed;
            })();

      return services.publishingWorkflowService.handlePublishStatusCallback({
        videoId: request.params.videoId,
        publishAttemptId: readString(body, "publishAttemptId"),
        callbackToken: readString(body, "callbackToken"),
        idempotencyKey: readHeaderString(request.headers, "x-publish-callback-id"),
        signature: readHeaderString(request.headers, "x-publish-callback-signature"),
        signatureTimestamp: readHeaderString(request.headers, "x-publish-callback-timestamp"),
        status: readOptionalEnumValue(body, "status", publishCallbackStatuses) ?? "submitted",
        providerStatus: readString(body, "providerStatus"),
        ...(publicationId ? { publicationId } : {}),
        ...(externalUrl ? { externalUrl } : {}),
        ...(publishedAt ? { publishedAt } : {}),
        ...(failureMessage ? { failureMessage } : {}),
        ...(checklist ? { checklist } : {})
      });
    }
  );

  app.get<{ Params: { videoId: string } }>(
    "/videos/:videoId/publish-attempts",
    async (request): Promise<ApiListResponse<PublishAttempt>> => {
      const items = await services.publishingWorkflowService.listPublishAttempts(request.params.videoId);

      return {
        items
      };
    }
  );

  app.post(
    "/publish/reconcile",
    async (request): Promise<ReconcileSubmittedPublishAttemptsResponse> => {
      assertReconciliationAccess(request.headers, services.reconcileToken);
      const body = request.body === undefined ? {} : ensureObject(request.body);
      const staleAfterMs = readOptionalNumber(body, "staleAfterMs");
      const limit = readOptionalNumber(body, "limit");
      const ownerId = readOptionalString(body, "ownerId");
      const leaseMs = readOptionalNumber(body, "leaseMs");

      return services.publishingWorkflowService.reconcileSubmittedPublishAttempts({
        ownerId: ownerId ?? services.publishReconciliationOwnerId,
        leaseMs: leaseMs ?? services.publishReconciliationLeaseMs,
        staleAfterMs: staleAfterMs ?? 6 * 60 * 60 * 1000,
        ...(limit === undefined ? {} : { limit })
      });
    }
  );
};
