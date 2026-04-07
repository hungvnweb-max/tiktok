import {
  completePublishAttempt,
  createPublishAttempt,
  failPublishAttempt,
  markPublishAttemptManualActionRequired,
  markPublishAttemptRetrying,
  markPublishAttemptSubmitted,
  startPublishAttempt,
  type PublishAttempt
} from "../domain/publish/publish-attempt";
import {
  completeCallbackReceipt,
  createCallbackReceipt,
  rejectCallbackReceipt,
  type CallbackReceipt
} from "../domain/callback/callback-receipt";
import {
  ConflictError,
  DomainError,
  InvalidStateError,
  NotFoundError,
  ValidationError,
  createEntityId,
  ensurePositiveInteger
} from "../domain/common/entity";
import { validateVideoForPublish, type VideoValidationReport } from "../domain/video/video-validation";
import { markPublicationSchedulePublished, type PublicationSchedule } from "../domain/schedule/publication-schedule";
import { updateVideoPublishingConfig, updateVideoStatus, type Video } from "../domain/video/video";
import type { Asset } from "../domain/asset/asset";
import type { ContentFormat } from "../domain/content-format/content-format";
import type { PublishMode } from "../domain/common/media";
import type { PublishingProvider } from "../domain/common/providers";
import type { WorkflowJob } from "../domain/job/workflow-job";
import type { PlatformRepositories } from "../ports/repositories";
import type {
  PublishProviderReconcileResult,
  PublishProviderRequest,
  PublishProviderValidationIssue,
  PublishProviderValidationResult,
  PublishingProviderPort
} from "../ports/publishing-provider-port";
import { AuditTrailService, WorkflowJobService, createReference } from "./operational-services";

export interface ValidatePublishReadinessInput {
  videoId: string;
  force?: boolean;
}

export interface PublishVideoInput extends ValidatePublishReadinessInput {}

export interface PublishReadinessResult {
  report: VideoValidationReport;
  video: Video;
  schedule?: PublicationSchedule;
  provider?: PublishingProvider;
  mode?: PublishMode;
  activeRenderAssetCount: number;
  activeImageAssetCount: number;
  activeAudioAssetCount: number;
}

export interface PublishVideoResult extends PublishReadinessResult {
  attempt: PublishAttempt;
}

export interface HandlePublishStatusCallbackInput {
  videoId: string;
  publishAttemptId: string;
  callbackToken: string;
  idempotencyKey: string;
  signature: string;
  signatureTimestamp: string;
  status: "submitted" | "manual_action_required" | "published" | "failed";
  providerStatus: string;
  publicationId?: string;
  externalUrl?: string;
  publishedAt?: Date;
  failureMessage?: string;
  checklist?: string[];
}

export interface HandlePublishStatusCallbackResult {
  attempt: PublishAttempt;
  video: Video;
  schedule: PublicationSchedule;
}

export interface ReconcileSubmittedPublishAttemptsInput {
  ownerId: string;
  leaseMs: number;
  staleAfterMs: number;
  limit?: number;
  now?: Date;
}

export interface ReconcileSubmittedPublishAttemptsResultItem {
  publishAttemptId: string;
  videoId: string;
  status: PublishAttempt["status"];
  provider: PublishAttempt["provider"];
  outcome:
    | "pending"
    | "manual_action_required"
    | "published"
    | "failed_timeout"
    | "failed_provider"
    | "failed_workflow";
  providerStatus?: string;
  ageMs: number;
  message?: string;
}

export interface ReconcileSubmittedPublishAttemptsResult {
  scannedCount: number;
  publishedCount: number;
  manualActionRequiredCount: number;
  failedCount: number;
  pendingCount: number;
  items: ReconcileSubmittedPublishAttemptsResultItem[];
}

const callbackDateFieldNames = new Set([
  "createdAt",
  "updatedAt",
  "startedAt",
  "finishedAt",
  "processedAt",
  "publishedAt",
  "scheduledFor",
  "completedAt"
]);

const reviveCallbackSnapshot = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) => reviveCallbackSnapshot(item));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const record = value as Record<string, unknown>;
  const revived: Record<string, unknown> = {};

  for (const [key, entry] of Object.entries(record)) {
    if (
      typeof entry === "string" &&
      callbackDateFieldNames.has(key) &&
      !Number.isNaN(Date.parse(entry))
    ) {
      revived[key] = new Date(entry);
      continue;
    }

    revived[key] = reviveCallbackSnapshot(entry);
  }

  return revived;
};

type PublishCallbackStoredOutcome<T> =
  | {
      kind: "success";
      result: T;
    }
  | {
      kind: "error";
      error: {
        message: string;
        code: string;
        statusCode: number;
        details?: Record<string, unknown>;
      };
    };

interface PublishContext {
  video: Video;
  contentFormat: ContentFormat;
  schedule?: PublicationSchedule;
  activeRenderAsset?: Asset;
  activeImageAssets: Asset[];
  activeAudioAssets: Asset[];
  publishProvider?: PublishingProviderPort;
}

class PublishProviderRegistry {
  private readonly providers = new Map<PublishingProvider, PublishingProviderPort>();

  constructor(ports: PublishingProviderPort[]) {
    for (const port of ports) {
      this.providers.set(port.providerId, port);
    }
  }

  find(providerId: PublishingProvider): PublishingProviderPort | undefined {
    return this.providers.get(providerId);
  }
}

const mapProviderIssues = (
  issues: PublishProviderValidationIssue[]
): VideoValidationReport["issues"] => {
  return issues.map((issue) => ({
    code: issue.code,
    message: issue.message,
    ...(issue.details ? { details: issue.details } : {})
  }));
};

const buildValidationFailureMessage = (report: VideoValidationReport): string => {
  return report.issues.map((issue) => `${issue.code}: ${issue.message}`).join(" | ");
};

export class PublishingWorkflowService {
  private readonly providerRegistry: PublishProviderRegistry;

  constructor(
    private readonly repositories: PlatformRepositories,
    publishingProviders: PublishingProviderPort[],
    private readonly workflowJobService: WorkflowJobService,
    private readonly auditTrailService: AuditTrailService
  ) {
    this.providerRegistry = new PublishProviderRegistry(publishingProviders);
  }

  async validatePublishReadiness(
    input: ValidatePublishReadinessInput
  ): Promise<PublishReadinessResult> {
    const context = await this.loadPublishContext(input.videoId);
    const report = await this.buildValidationReport(context, input.force === true);

    return {
      report,
      video: context.video,
      ...(context.schedule
        ? {
            schedule: context.schedule,
            provider: context.schedule.provider,
            mode: context.schedule.mode
          }
        : {}),
      activeRenderAssetCount: context.activeRenderAsset ? 1 : 0,
      activeImageAssetCount: context.activeImageAssets.length,
      activeAudioAssetCount: context.activeAudioAssets.length
    };
  }

  async publishVideo(input: PublishVideoInput) {
    const context = await this.loadPublishContext(input.videoId);

    if (!context.schedule) {
      throw new InvalidStateError(`Video "${input.videoId}" does not have a publication schedule.`, {
        videoId: input.videoId
      });
    }

    const publishAttempt = createPublishAttempt({
      videoId: context.video.id,
      publicationScheduleId: context.schedule.id,
      provider: context.schedule.provider,
      platformSlug: context.schedule.platformSlug,
      mode: context.schedule.mode,
      sequenceNumber: (await this.repositories.publishAttemptRepository.listByVideoId(context.video.id)).length + 1,
      maxWorkflowAttempts: context.schedule.mode === "full_auto" ? 3 : 1,
      metadata: {
        platformSlug: context.schedule.platformSlug,
        scheduleId: context.schedule.id
      }
    });
    const callbackToken = createEntityId("publishcb");
    await this.repositories.publishAttemptRepository.save(publishAttempt);
    await this.auditTrailService.recordActivity({
      action: "publish.attempt_created",
      reference: createReference("publish_attempt", publishAttempt.id),
      message: `Created publish attempt ${publishAttempt.sequenceNumber} for video "${context.video.id}".`
    });
    await this.auditTrailService.snapshot(
      createReference("publish_attempt", publishAttempt.id),
      "publish.attempt_created",
      publishAttempt
    );

    const validationReport = await this.buildValidationReport(context, input.force === true);

    const execution = await this.workflowJobService.runJob({
      type: "publish",
      reference: createReference("publish_attempt", publishAttempt.id),
      payload: {
        videoId: context.video.id,
        scheduleId: context.schedule.id,
        provider: context.schedule.provider,
        mode: context.schedule.mode,
        force: input.force === true,
        callbackToken
      },
      maxAttempts: publishAttempt.maxWorkflowAttempts,
      executor: async (job) => {
        let currentAttempt = await this.getPublishAttemptOrThrow(publishAttempt.id);
        currentAttempt = startPublishAttempt(currentAttempt, {
          workflowJobId: job.id,
          workflowAttemptCount: job.attemptCount
        });
        await this.repositories.publishAttemptRepository.save(currentAttempt);
        await this.auditTrailService.recordActivity({
          action: "publish.attempt_started",
          reference: createReference("publish_attempt", currentAttempt.id),
          message: `Started publish attempt ${currentAttempt.sequenceNumber} for video "${context.video.id}".`,
          metadata: {
            workflowJobId: job.id,
            workflowAttemptCount: job.attemptCount
          }
        });
        await this.auditTrailService.snapshot(
          createReference("publish_attempt", currentAttempt.id),
          "publish.attempt_started",
          currentAttempt
        );
        await this.auditTrailService.recordCost({
          provider: currentAttempt.provider,
          category: "publishing",
          reference: createReference("publish_attempt", currentAttempt.id),
          amount: 0,
          units: "publish_preflight",
          quantity: 1,
          metadata: {
            step: "pre_publish_validation",
            workflowAttemptCount: job.attemptCount
          }
        });

        if (!validationReport.isValid) {
          currentAttempt = failPublishAttempt(currentAttempt, {
            errorMessage: "Pre-publish validation failed.",
            failureStage: "validation",
            validationIssues: validationReport.issues.map((issue) => `${issue.code}: ${issue.message}`)
          });
          await this.repositories.publishAttemptRepository.save(currentAttempt);
          await this.auditTrailService.recordActivity({
            action: "publish.validation_failed",
            reference: createReference("publish_attempt", currentAttempt.id),
            message: `Pre-publish validation failed for video "${context.video.id}".`,
            metadata: {
              issueCount: validationReport.issues.length
            }
          });
          await this.auditTrailService.snapshot(
            createReference("publish_attempt", currentAttempt.id),
            "publish.validation_failed",
            currentAttempt
          );
          throw new DomainError(
            buildValidationFailureMessage(validationReport),
            "publish_validation_failed",
            {
              issueCount: validationReport.issues.length,
              issues: validationReport.issues.map((issue) => ({
                code: issue.code,
                message: issue.message,
                ...(issue.details ? { details: issue.details } : {})
              }))
            },
            409
          );
        }

        try {
          const provider = context.publishProvider;

          if (!provider || !context.schedule) {
            throw new InvalidStateError(
              `Publish provider "${context.schedule?.provider ?? "unknown"}" is not available in this runtime.`,
              {
                provider: context.schedule?.provider ?? "unknown",
                videoId: context.video.id
              }
            );
          }

          const providerRequest: PublishProviderRequest = {
            video: context.video,
            contentFormat: context.contentFormat,
            schedule: context.schedule,
            publishMode: context.schedule.mode,
            callbackToken,
            ...(context.activeRenderAsset ? { activeRenderAsset: context.activeRenderAsset } : {}),
            activeImageAssets: context.activeImageAssets,
            activeAudioAssets: context.activeAudioAssets
          };
          const providerResult = await provider.publish(providerRequest);

          await this.auditTrailService.recordCost({
            provider: provider.providerId,
            category: "publishing",
            reference: createReference("publish_attempt", currentAttempt.id),
            amount: providerResult.cost?.amount ?? 0,
            currency: providerResult.cost?.currency ?? "USD",
            units: providerResult.cost?.units ?? "publish_execution",
            quantity: providerResult.cost?.quantity ?? 1,
            ...(providerResult.cost?.metadata ? { metadata: providerResult.cost.metadata } : {})
          });

          if (providerResult.status === "manual_action_required") {
            currentAttempt = markPublishAttemptManualActionRequired(currentAttempt, {
              providerStatus: providerResult.providerStatus,
              ...(providerResult.publicationId ? { publicationId: providerResult.publicationId } : {}),
              ...(providerResult.externalUrl ? { externalUrl: providerResult.externalUrl } : {}),
              ...(providerResult.checklist ? { checklist: providerResult.checklist } : {}),
              ...(providerResult.metadata ? { metadata: providerResult.metadata } : {})
            });
            await this.repositories.publishAttemptRepository.save(currentAttempt);

            const updatedVideo = await this.saveVideoPublishState(context.video, currentAttempt, {
              lastProviderStatus: providerResult.providerStatus,
              scheduledFor: context.schedule.scheduledFor,
              clearLastPublishError: true,
              ...(currentAttempt.providerPublicationId
                ? { externalPublicationId: currentAttempt.providerPublicationId }
                : {}),
              ...(providerResult.externalUrl ? { externalUrl: providerResult.externalUrl } : {})
            });

            await this.auditTrailService.recordActivity({
              action: "publish.manual_action_required",
              reference: createReference("publish_attempt", currentAttempt.id),
              message: `Publish attempt ${currentAttempt.sequenceNumber} requires manual completion for video "${context.video.id}".`
            });
            await this.auditTrailService.snapshot(
              createReference("publish_attempt", currentAttempt.id),
              "publish.manual_action_required",
              currentAttempt
            );

            return {
              attempt: currentAttempt,
              video: updatedVideo,
              schedule: context.schedule
            };
          }

          if (providerResult.status === "submitted") {
            currentAttempt = markPublishAttemptSubmitted(currentAttempt, {
              providerStatus: providerResult.providerStatus,
              ...(providerResult.publicationId ? { publicationId: providerResult.publicationId } : {}),
              ...(providerResult.externalUrl ? { externalUrl: providerResult.externalUrl } : {}),
              ...(providerResult.checklist ? { checklist: providerResult.checklist } : {}),
              ...(providerResult.metadata ? { metadata: providerResult.metadata } : {})
            });
            await this.repositories.publishAttemptRepository.save(currentAttempt);

            const updatedVideo = await this.saveVideoPublishState(context.video, currentAttempt, {
              lastProviderStatus: providerResult.providerStatus,
              scheduledFor: context.schedule.scheduledFor,
              clearLastPublishError: true,
              ...(currentAttempt.providerPublicationId
                ? { externalPublicationId: currentAttempt.providerPublicationId }
                : {}),
              ...(providerResult.externalUrl ? { externalUrl: providerResult.externalUrl } : {})
            });

            await this.auditTrailService.recordActivity({
              action: "publish.submitted",
              reference: createReference("publish_attempt", currentAttempt.id),
              message: `Provider accepted publish attempt ${currentAttempt.sequenceNumber} for video "${context.video.id}".`
            });
            await this.auditTrailService.snapshot(
              createReference("publish_attempt", currentAttempt.id),
              "publish.submitted",
              currentAttempt
            );

            return {
              attempt: currentAttempt,
              video: updatedVideo,
              schedule: context.schedule
            };
          }

          currentAttempt = completePublishAttempt(currentAttempt, {
            providerStatus: providerResult.providerStatus,
            ...(providerResult.publicationId ? { publicationId: providerResult.publicationId } : {}),
            ...(providerResult.externalUrl ? { externalUrl: providerResult.externalUrl } : {}),
            ...(providerResult.publishedAt ? { publishedAt: providerResult.publishedAt } : {}),
            ...(providerResult.checklist ? { checklist: providerResult.checklist } : {}),
            ...(providerResult.metadata ? { metadata: providerResult.metadata } : {})
          });
          await this.repositories.publishAttemptRepository.save(currentAttempt);

          const publishedSchedule = markPublicationSchedulePublished(context.schedule, {
            publishedAt: currentAttempt.publishedAt ?? new Date(),
            ...(currentAttempt.providerPublicationId
              ? { externalPublicationId: currentAttempt.providerPublicationId }
              : {})
          });
          await this.repositories.publicationScheduleRepository.save(publishedSchedule);

          const updatedVideo = updateVideoStatus(
            await this.saveVideoPublishState(context.video, currentAttempt, {
              lastProviderStatus: providerResult.providerStatus,
              scheduledFor: context.schedule.scheduledFor,
              clearLastPublishError: true,
              ...(currentAttempt.providerPublicationId
                ? { externalPublicationId: currentAttempt.providerPublicationId }
                : {}),
              ...(currentAttempt.externalUrl ? { externalUrl: currentAttempt.externalUrl } : {}),
              ...(currentAttempt.publishedAt ? { publishedAt: currentAttempt.publishedAt } : {})
            }),
            "published"
          );
          await this.repositories.videoRepository.save(updatedVideo);

          await this.auditTrailService.recordActivity({
            action: "video.published",
            reference: createReference("video", updatedVideo.id),
            message: `Published video "${updatedVideo.id}" via ${provider.providerId}.`
          });
          await this.auditTrailService.snapshot(
            createReference("publish_attempt", currentAttempt.id),
            "publish.completed",
            currentAttempt
          );
          await this.auditTrailService.snapshot(
            createReference("publication_schedule", publishedSchedule.id),
            "publish.completed",
            publishedSchedule
          );
          await this.auditTrailService.snapshot(
            createReference("video", updatedVideo.id),
            "video.published",
            updatedVideo
          );

          return {
            attempt: currentAttempt,
            video: updatedVideo,
            schedule: publishedSchedule
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const willRetry = !(error instanceof DomainError) && job.attemptCount < job.maxAttempts;
          currentAttempt = willRetry
            ? markPublishAttemptRetrying(currentAttempt, message)
            : failPublishAttempt(currentAttempt, {
                errorMessage: message,
                failureStage: error instanceof DomainError ? "validation" : "provider_execution"
              });
          await this.repositories.publishAttemptRepository.save(currentAttempt);

          await this.saveVideoPublishState(context.video, currentAttempt, {
            lastProviderStatus: "failed",
            clearLastPublishError: false,
            ...(context.schedule?.scheduledFor
              ? { scheduledFor: context.schedule.scheduledFor }
              : {}),
            ...(currentAttempt.lastError
              ? { lastPublishError: currentAttempt.lastError }
              : {})
          });
          await this.auditTrailService.recordActivity({
            action: willRetry ? "publish.retry_scheduled" : "publish.failed",
            reference: createReference("publish_attempt", currentAttempt.id),
            message: willRetry
              ? `Publish attempt ${currentAttempt.sequenceNumber} will retry after failure.`
              : `Publish attempt ${currentAttempt.sequenceNumber} failed.`,
            metadata: {
              workflowAttemptCount: job.attemptCount
            }
          });
          await this.auditTrailService.snapshot(
            createReference("publish_attempt", currentAttempt.id),
            willRetry ? "publish.retry_scheduled" : "publish.failed",
            currentAttempt
          );
          await this.auditTrailService.recordCost({
            provider: currentAttempt.provider,
            category: "publishing",
            reference: createReference("publish_attempt", currentAttempt.id),
            amount: 0,
            units: "publish_failure",
            quantity: 1,
            metadata: {
              workflowAttemptCount: job.attemptCount,
              willRetry
            }
          });
          throw error;
        }
      }
    });

    return {
      report: validationReport,
      video: execution.result.video,
      schedule: execution.result.schedule,
      provider: context.schedule.provider,
      mode: context.schedule.mode,
      activeRenderAssetCount: context.activeRenderAsset ? 1 : 0,
      activeImageAssetCount: context.activeImageAssets.length,
      activeAudioAssetCount: context.activeAudioAssets.length,
      attempt: execution.result.attempt,
      job: execution.job,
      logs: execution.logs
    };
  }

  async handlePublishStatusCallback(
    input: HandlePublishStatusCallbackInput
  ): Promise<HandlePublishStatusCallbackResult> {
    const publishAttempt = await this.getPublishAttemptOrThrow(input.publishAttemptId);

    if (publishAttempt.videoId !== input.videoId) {
      throw new NotFoundError(
        `Publish attempt "${input.publishAttemptId}" was not found for video "${input.videoId}".`,
        {
          entityType: "publish_attempt",
          entityId: input.publishAttemptId,
          videoId: input.videoId
        }
      );
    }

    const workflowJob = await this.getPublishWorkflowJobOrThrow(publishAttempt);
    this.assertPublishCallbackAccess(workflowJob, publishAttempt, input.callbackToken);

    const provider = this.providerRegistry.find(publishAttempt.provider);

    if (!provider) {
      throw new InvalidStateError(
        `Publish provider "${publishAttempt.provider}" is not available in this runtime.`,
        {
          provider: publishAttempt.provider,
          publishAttemptId: publishAttempt.id
        }
      );
    }

    if (!provider.verifyCallback) {
      throw new InvalidStateError(
        `Publish provider "${publishAttempt.provider}" does not support callback verification.`,
        {
          provider: publishAttempt.provider,
          publishAttemptId: publishAttempt.id
        }
      );
    }

    const callbackPayload = this.buildPublishCallbackPayload(input);
    const verification = await provider.verifyCallback({
      attempt: publishAttempt,
      callbackToken: input.callbackToken,
      idempotencyKey: input.idempotencyKey,
      signature: input.signature,
      signatureTimestamp: input.signatureTimestamp,
      payload: callbackPayload
    });
    const reservation = await this.reservePublishCallback<HandlePublishStatusCallbackResult>({
      provider: provider.providerId,
      publishAttempt,
      workflowJob,
      requestIdempotencyKey: input.idempotencyKey,
      requestMetadata: {
        requestIdempotencyKey: input.idempotencyKey,
        signatureTimestamp: input.signatureTimestamp,
        verificationScheme: verification.scheme,
        verifiedAt: verification.verifiedAt,
        callbackStatus: input.status,
        providerStatus: input.providerStatus
      }
    });

    if ("replayedResult" in reservation) {
      return reservation.replayedResult;
    }

    const callbackReceipt = reservation.callbackReceipt;

    try {
      let currentAttempt = await this.getPublishAttemptOrThrow(publishAttempt.id);
      const currentVideo = await this.getVideoOrThrow(currentAttempt.videoId);
      const currentSchedule = await this.getPublicationScheduleOrThrow(
        currentAttempt.publicationScheduleId
      );

      let result: HandlePublishStatusCallbackResult;

      if (input.status === "published") {
        if (currentAttempt.status !== "published") {
          currentAttempt = completePublishAttempt(currentAttempt, {
            providerStatus: input.providerStatus,
            ...(input.publicationId ? { publicationId: input.publicationId } : {}),
            ...(input.externalUrl ? { externalUrl: input.externalUrl } : {}),
            ...(input.publishedAt ? { publishedAt: input.publishedAt } : {}),
            ...(input.checklist ? { checklist: input.checklist } : {})
          });
          await this.repositories.publishAttemptRepository.save(currentAttempt);
        }

        const publishedSchedule =
          currentSchedule.status === "published"
            ? currentSchedule
            : markPublicationSchedulePublished(currentSchedule, {
                publishedAt: currentAttempt.publishedAt ?? input.publishedAt ?? new Date(),
                ...(currentAttempt.providerPublicationId
                  ? { externalPublicationId: currentAttempt.providerPublicationId }
                  : {})
              });
        if (publishedSchedule.id !== currentSchedule.id || currentSchedule.status !== "published") {
          await this.repositories.publicationScheduleRepository.save(publishedSchedule);
        }

        const publishedVideo =
          currentVideo.status === "published"
            ? currentVideo
            : updateVideoStatus(
                await this.saveVideoPublishState(currentVideo, currentAttempt, {
                  lastProviderStatus: input.providerStatus,
                  scheduledFor: currentSchedule.scheduledFor,
                  clearLastPublishError: true,
                  ...(currentAttempt.providerPublicationId
                    ? { externalPublicationId: currentAttempt.providerPublicationId }
                    : {}),
                  ...(currentAttempt.externalUrl
                    ? { externalUrl: currentAttempt.externalUrl }
                    : {}),
                  ...(currentAttempt.publishedAt ? { publishedAt: currentAttempt.publishedAt } : {})
                }),
                "published"
              );
        if (publishedVideo.id !== currentVideo.id || currentVideo.status !== "published") {
          await this.repositories.videoRepository.save(publishedVideo);
        }

        await this.auditTrailService.recordActivity({
          action: "publish.callback_published",
          reference: createReference("publish_attempt", currentAttempt.id),
          message: `Publish callback marked attempt ${currentAttempt.sequenceNumber} as published.`
        });
        await this.auditTrailService.snapshot(
          createReference("publish_attempt", currentAttempt.id),
          "publish.callback_published",
          currentAttempt
        );
        await this.auditTrailService.snapshot(
          createReference("publication_schedule", publishedSchedule.id),
          "publish.callback_published",
          publishedSchedule
        );
        await this.auditTrailService.snapshot(
          createReference("video", publishedVideo.id),
          "publish.callback_published",
          publishedVideo
        );

        result = {
          attempt: currentAttempt,
          video: publishedVideo,
          schedule: publishedSchedule
        };
      } else if (input.status === "manual_action_required") {
        if (currentAttempt.status !== "manual_action_required") {
          currentAttempt = markPublishAttemptManualActionRequired(currentAttempt, {
            providerStatus: input.providerStatus,
            ...(input.publicationId ? { publicationId: input.publicationId } : {}),
            ...(input.externalUrl ? { externalUrl: input.externalUrl } : {}),
            ...(input.checklist ? { checklist: input.checklist } : {})
          });
          await this.repositories.publishAttemptRepository.save(currentAttempt);
        }

        const updatedVideo = await this.saveVideoPublishState(currentVideo, currentAttempt, {
          lastProviderStatus: input.providerStatus,
          scheduledFor: currentSchedule.scheduledFor,
          clearLastPublishError: true,
          ...(currentAttempt.providerPublicationId
            ? { externalPublicationId: currentAttempt.providerPublicationId }
            : {}),
          ...(currentAttempt.externalUrl ? { externalUrl: currentAttempt.externalUrl } : {})
        });

        await this.auditTrailService.recordActivity({
          action: "publish.callback_manual_action_required",
          reference: createReference("publish_attempt", currentAttempt.id),
          message: `Publish callback marked attempt ${currentAttempt.sequenceNumber} as manual action required.`
        });
        await this.auditTrailService.snapshot(
          createReference("publish_attempt", currentAttempt.id),
          "publish.callback_manual_action_required",
          currentAttempt
        );
        await this.auditTrailService.snapshot(
          createReference("video", updatedVideo.id),
          "publish.callback_manual_action_required",
          updatedVideo
        );

        result = {
          attempt: currentAttempt,
          video: updatedVideo,
          schedule: currentSchedule
        };
      } else if (input.status === "failed") {
        if (currentAttempt.status !== "failed") {
          currentAttempt = failPublishAttempt(currentAttempt, {
            errorMessage:
              input.failureMessage ??
              `Provider "${publishAttempt.provider}" reported publish failure.`,
            failureStage: "provider_execution"
          });
          await this.repositories.publishAttemptRepository.save(currentAttempt);
        }

        const updatedVideo = await this.saveVideoPublishState(currentVideo, currentAttempt, {
          lastProviderStatus: "failed",
          scheduledFor: currentSchedule.scheduledFor,
          clearLastPublishError: false,
          ...(currentAttempt.lastError ? { lastPublishError: currentAttempt.lastError } : {})
        });

        await this.auditTrailService.recordActivity({
          action: "publish.callback_failed",
          reference: createReference("publish_attempt", currentAttempt.id),
          message: `Publish callback marked attempt ${currentAttempt.sequenceNumber} as failed.`
        });
        await this.auditTrailService.snapshot(
          createReference("publish_attempt", currentAttempt.id),
          "publish.callback_failed",
          currentAttempt
        );
        await this.auditTrailService.snapshot(
          createReference("video", updatedVideo.id),
          "publish.callback_failed",
          updatedVideo
        );

        result = {
          attempt: currentAttempt,
          video: updatedVideo,
          schedule: currentSchedule
        };
      } else {
        if (currentAttempt.status === "processing") {
          currentAttempt = markPublishAttemptSubmitted(currentAttempt, {
            providerStatus: input.providerStatus,
            ...(input.publicationId ? { publicationId: input.publicationId } : {}),
            ...(input.externalUrl ? { externalUrl: input.externalUrl } : {}),
            ...(input.checklist ? { checklist: input.checklist } : {})
          });
          await this.repositories.publishAttemptRepository.save(currentAttempt);
        }

        const updatedVideo = await this.saveVideoPublishState(currentVideo, currentAttempt, {
          lastProviderStatus: input.providerStatus,
          scheduledFor: currentSchedule.scheduledFor,
          clearLastPublishError: true,
          ...(currentAttempt.providerPublicationId
            ? { externalPublicationId: currentAttempt.providerPublicationId }
            : {}),
          ...(currentAttempt.externalUrl ? { externalUrl: currentAttempt.externalUrl } : {})
        });

        await this.auditTrailService.recordActivity({
          action: "publish.callback_submitted",
          reference: createReference("publish_attempt", currentAttempt.id),
          message: `Publish callback updated submission status for attempt ${currentAttempt.sequenceNumber}.`
        });
        await this.auditTrailService.snapshot(
          createReference("publish_attempt", currentAttempt.id),
          "publish.callback_submitted",
          currentAttempt
        );
        await this.auditTrailService.snapshot(
          createReference("video", updatedVideo.id),
          "publish.callback_submitted",
          updatedVideo
        );

        result = {
          attempt: currentAttempt,
          video: updatedVideo,
          schedule: currentSchedule
        };
      }

      await this.auditTrailService.recordCost({
        provider: provider.providerId,
        category: "publishing",
        reference: createReference("publish_attempt", result.attempt.id),
        amount: 0,
        units: "publish_callback",
        quantity: 1,
        metadata: {
          callbackStatus: input.status,
          providerStatus: input.providerStatus
        }
      });
      await this.completeReservedPublishCallback(callbackReceipt, result);

      return result;
    } catch (error) {
      await this.rejectReservedPublishCallback(callbackReceipt, error);
      throw error;
    }
  }

  async listPublishAttempts(videoId: string) {
    return this.repositories.publishAttemptRepository.listByVideoId(videoId);
  }

  async reconcileSubmittedPublishAttempts(
    input: ReconcileSubmittedPublishAttemptsInput
  ): Promise<ReconcileSubmittedPublishAttemptsResult> {
    const now = input.now ?? new Date();
    const staleAfterMs = ensurePositiveInteger(
      input.staleAfterMs,
      "publishReconciliation.staleAfterMs"
    );
    const limit =
      input.limit === undefined
        ? 25
        : ensurePositiveInteger(input.limit, "publishReconciliation.limit");
    const attempts = await this.repositories.publishAttemptRepository.list();
    const candidateAttempts = attempts
      .filter((attempt) => attempt.status === "submitted")
      .sort(
        (left, right) =>
          (left.completedAt ?? left.updatedAt).getTime() -
          (right.completedAt ?? right.updatedAt).getTime()
      )
      .slice(0, limit);
    const items: ReconcileSubmittedPublishAttemptsResultItem[] = [];

    for (const candidateAttempt of candidateAttempts) {
      const ageMs =
        now.getTime() - (candidateAttempt.completedAt ?? candidateAttempt.updatedAt).getTime();

      if (!candidateAttempt.workflowJobId) {
        if (ageMs < staleAfterMs) {
          items.push({
            publishAttemptId: candidateAttempt.id,
            videoId: candidateAttempt.videoId,
            status: candidateAttempt.status,
            provider: candidateAttempt.provider,
            outcome: "pending",
            ...(candidateAttempt.providerStatus
              ? { providerStatus: candidateAttempt.providerStatus }
              : {}),
            ageMs,
            message:
              "Publish attempt has no workflow job binding for lease-based reconciliation yet."
          });
          continue;
        }

        const workflowFailureMessage = `Publish attempt "${candidateAttempt.id}" exceeded reconciliation timeout without a workflow job binding.`;
        const failedAttempt = failPublishAttempt(candidateAttempt, {
          errorMessage: workflowFailureMessage,
          failureStage: "workflow"
        });
        await this.repositories.publishAttemptRepository.save(failedAttempt);
        const failedVideo = await this.getVideoOrThrow(failedAttempt.videoId);
        const schedule = await this.repositories.publicationScheduleRepository.findById(
          failedAttempt.publicationScheduleId
        );
        await this.saveVideoPublishState(failedVideo, failedAttempt, {
          lastProviderStatus: "failed",
          clearLastPublishError: false,
          ...(schedule ? { scheduledFor: schedule.scheduledFor } : {}),
          ...(failedAttempt.lastError ? { lastPublishError: failedAttempt.lastError } : {})
        });
        await this.auditTrailService.recordActivity({
          action: "publish.reconcile_failed_workflow",
          reference: createReference("publish_attempt", failedAttempt.id),
          message: workflowFailureMessage
        });
        await this.auditTrailService.snapshot(
          createReference("publish_attempt", failedAttempt.id),
          "publish.reconcile_failed_workflow",
          failedAttempt
        );
        items.push({
          publishAttemptId: failedAttempt.id,
          videoId: failedAttempt.videoId,
          status: failedAttempt.status,
          provider: failedAttempt.provider,
          outcome: "failed_workflow",
          ...(failedAttempt.providerStatus ? { providerStatus: failedAttempt.providerStatus } : {}),
          ageMs,
          message: workflowFailureMessage
        });
        continue;
      }

      const leasedJob = await this.workflowJobService.tryAcquireLease(
        candidateAttempt.workflowJobId,
        {
          ownerId: input.ownerId,
          leaseMs: input.leaseMs
        }
      );

      if (!leasedJob) {
        const workflowJob = await this.workflowJobService.getJob(candidateAttempt.workflowJobId);

        if (!workflowJob && ageMs >= staleAfterMs) {
          const workflowFailureMessage = `Workflow job "${candidateAttempt.workflowJobId}" was not found for submitted publish attempt "${candidateAttempt.id}".`;
          const failedAttempt = failPublishAttempt(candidateAttempt, {
            errorMessage: workflowFailureMessage,
            failureStage: "workflow"
          });
          await this.repositories.publishAttemptRepository.save(failedAttempt);
          const failedVideo = await this.getVideoOrThrow(failedAttempt.videoId);
          const schedule = await this.repositories.publicationScheduleRepository.findById(
            failedAttempt.publicationScheduleId
          );
          await this.saveVideoPublishState(failedVideo, failedAttempt, {
            lastProviderStatus: "failed",
            clearLastPublishError: false,
            ...(schedule ? { scheduledFor: schedule.scheduledFor } : {}),
            ...(failedAttempt.lastError ? { lastPublishError: failedAttempt.lastError } : {})
          });
          await this.auditTrailService.recordActivity({
            action: "publish.reconcile_failed_workflow",
            reference: createReference("publish_attempt", failedAttempt.id),
            message: workflowFailureMessage
          });
          await this.auditTrailService.snapshot(
            createReference("publish_attempt", failedAttempt.id),
            "publish.reconcile_failed_workflow",
            failedAttempt
          );

          items.push({
            publishAttemptId: failedAttempt.id,
            videoId: failedAttempt.videoId,
            status: failedAttempt.status,
            provider: failedAttempt.provider,
            outcome: "failed_workflow",
            ...(failedAttempt.providerStatus
              ? { providerStatus: failedAttempt.providerStatus }
              : {}),
            ageMs,
            message: workflowFailureMessage
          });
        }

        continue;
      }

      try {
        let currentAttempt = await this.getPublishAttemptOrThrow(candidateAttempt.id);

        if (currentAttempt.status !== "submitted") {
          continue;
        }

        const context = await this.loadPublishContext(currentAttempt.videoId);
        const schedule =
          context.schedule?.id === currentAttempt.publicationScheduleId
            ? context.schedule
            : await this.repositories.publicationScheduleRepository.findById(
                currentAttempt.publicationScheduleId
              );

        if (!schedule) {
          const refreshedAttempt = await this.refreshSubmittedPublishAttempt(currentAttempt.id);

          if (!refreshedAttempt) {
            continue;
          }

          currentAttempt = refreshedAttempt;
          const workflowFailureMessage = `Publication schedule "${currentAttempt.publicationScheduleId}" was not found for publish attempt "${currentAttempt.id}".`;
          currentAttempt = failPublishAttempt(currentAttempt, {
            errorMessage: workflowFailureMessage,
            failureStage: "workflow"
          });
          await this.repositories.publishAttemptRepository.save(currentAttempt);
          await this.saveVideoPublishState(context.video, currentAttempt, {
            lastProviderStatus: "failed",
            clearLastPublishError: false,
            ...(currentAttempt.lastError ? { lastPublishError: currentAttempt.lastError } : {})
          });
          await this.auditTrailService.recordActivity({
            action: "publish.reconcile_failed_workflow",
            reference: createReference("publish_attempt", currentAttempt.id),
            message: workflowFailureMessage
          });
          await this.auditTrailService.snapshot(
            createReference("publish_attempt", currentAttempt.id),
            "publish.reconcile_failed_workflow",
            currentAttempt
          );
          items.push({
            publishAttemptId: currentAttempt.id,
            videoId: currentAttempt.videoId,
            status: currentAttempt.status,
            provider: currentAttempt.provider,
            outcome: "failed_workflow",
            ...(currentAttempt.providerStatus ? { providerStatus: currentAttempt.providerStatus } : {}),
            ageMs,
            message: workflowFailureMessage
          });
          continue;
        }

        const provider = this.providerRegistry.find(currentAttempt.provider);

        if (!provider || !provider.reconcileSubmission) {
          if (ageMs < staleAfterMs) {
            items.push({
              publishAttemptId: currentAttempt.id,
              videoId: currentAttempt.videoId,
              status: currentAttempt.status,
              provider: currentAttempt.provider,
              outcome: "pending",
              ...(currentAttempt.providerStatus
                ? { providerStatus: currentAttempt.providerStatus }
                : {}),
              ageMs,
              message: provider
                ? "Provider has no reconcile implementation for submitted attempts."
                : `Provider "${currentAttempt.provider}" is not available in this runtime.`
            });
            continue;
          }

          const refreshedAttempt = await this.refreshSubmittedPublishAttempt(currentAttempt.id);

          if (!refreshedAttempt) {
            continue;
          }

          currentAttempt = refreshedAttempt;
          const timeoutMessage = provider
            ? `Publish attempt "${currentAttempt.id}" exceeded timeout while waiting for provider reconciliation support.`
            : `Publish attempt "${currentAttempt.id}" exceeded timeout and provider "${currentAttempt.provider}" is unavailable.`;
          currentAttempt = failPublishAttempt(currentAttempt, {
            errorMessage: timeoutMessage,
            failureStage: "workflow"
          });
          await this.repositories.publishAttemptRepository.save(currentAttempt);
          await this.saveVideoPublishState(context.video, currentAttempt, {
            lastProviderStatus: "failed",
            clearLastPublishError: false,
            scheduledFor: schedule.scheduledFor,
            ...(currentAttempt.lastError ? { lastPublishError: currentAttempt.lastError } : {})
          });
          await this.auditTrailService.recordActivity({
            action: "publish.reconcile_timeout",
            reference: createReference("publish_attempt", currentAttempt.id),
            message: timeoutMessage
          });
          await this.auditTrailService.snapshot(
            createReference("publish_attempt", currentAttempt.id),
            "publish.reconcile_timeout",
            currentAttempt
          );
          items.push({
            publishAttemptId: currentAttempt.id,
            videoId: currentAttempt.videoId,
            status: currentAttempt.status,
            provider: currentAttempt.provider,
            outcome: "failed_timeout",
            ...(currentAttempt.providerStatus ? { providerStatus: currentAttempt.providerStatus } : {}),
            ageMs,
            message: timeoutMessage
          });
          continue;
        }

        const reconciliation = await provider.reconcileSubmission({
          attempt: currentAttempt,
          video: context.video,
          contentFormat: context.contentFormat,
          schedule,
          publishMode: currentAttempt.mode,
          ...(context.activeRenderAsset ? { activeRenderAsset: context.activeRenderAsset } : {}),
          activeImageAssets: context.activeImageAssets,
          activeAudioAssets: context.activeAudioAssets
        });
        await this.recordPublishReconcileCost(
          currentAttempt,
          provider.providerId,
          reconciliation,
          ageMs
        );
        const refreshedAttempt = await this.refreshSubmittedPublishAttempt(currentAttempt.id);

        if (!refreshedAttempt) {
          continue;
        }

        currentAttempt = refreshedAttempt;

        if (reconciliation.state === "published") {
          currentAttempt = completePublishAttempt(currentAttempt, {
            providerStatus: reconciliation.providerStatus,
            ...(reconciliation.publicationId ? { publicationId: reconciliation.publicationId } : {}),
            ...(reconciliation.externalUrl ? { externalUrl: reconciliation.externalUrl } : {}),
            ...(reconciliation.publishedAt ? { publishedAt: reconciliation.publishedAt } : {}),
            ...(reconciliation.checklist ? { checklist: reconciliation.checklist } : {}),
            ...(reconciliation.metadata ? { metadata: reconciliation.metadata } : {})
          });
          await this.repositories.publishAttemptRepository.save(currentAttempt);

          const publishedSchedule = markPublicationSchedulePublished(schedule, {
            publishedAt: currentAttempt.publishedAt ?? new Date(),
            ...(currentAttempt.providerPublicationId
              ? { externalPublicationId: currentAttempt.providerPublicationId }
              : {})
          });
          await this.repositories.publicationScheduleRepository.save(publishedSchedule);

          const updatedVideo = updateVideoStatus(
            await this.saveVideoPublishState(context.video, currentAttempt, {
              lastProviderStatus: reconciliation.providerStatus,
              scheduledFor: schedule.scheduledFor,
              clearLastPublishError: true,
              ...(currentAttempt.providerPublicationId
                ? { externalPublicationId: currentAttempt.providerPublicationId }
                : {}),
              ...(currentAttempt.externalUrl ? { externalUrl: currentAttempt.externalUrl } : {}),
              ...(currentAttempt.publishedAt ? { publishedAt: currentAttempt.publishedAt } : {})
            }),
            "published"
          );
          await this.repositories.videoRepository.save(updatedVideo);

          await this.auditTrailService.recordActivity({
            action: "publish.reconciled_published",
            reference: createReference("publish_attempt", currentAttempt.id),
            message: `Reconciled submitted publish attempt ${currentAttempt.sequenceNumber} to published state.`
          });
          await this.auditTrailService.recordActivity({
            action: "video.published",
            reference: createReference("video", updatedVideo.id),
            message: `Published video "${updatedVideo.id}" via ${provider.providerId} reconciliation.`
          });
          await this.auditTrailService.snapshot(
            createReference("publish_attempt", currentAttempt.id),
            "publish.reconciled_published",
            currentAttempt
          );
          await this.auditTrailService.snapshot(
            createReference("publication_schedule", publishedSchedule.id),
            "publish.reconciled_published",
            publishedSchedule
          );
          await this.auditTrailService.snapshot(
            createReference("video", updatedVideo.id),
            "video.published",
            updatedVideo
          );

          items.push({
            publishAttemptId: currentAttempt.id,
            videoId: currentAttempt.videoId,
            status: currentAttempt.status,
            provider: currentAttempt.provider,
            outcome: "published",
            providerStatus: reconciliation.providerStatus,
            ageMs
          });
          continue;
        }

        if (reconciliation.state === "manual_action_required") {
          currentAttempt = markPublishAttemptManualActionRequired(currentAttempt, {
            providerStatus: reconciliation.providerStatus,
            ...(reconciliation.publicationId ? { publicationId: reconciliation.publicationId } : {}),
            ...(reconciliation.externalUrl ? { externalUrl: reconciliation.externalUrl } : {}),
            ...(reconciliation.checklist ? { checklist: reconciliation.checklist } : {}),
            ...(reconciliation.metadata ? { metadata: reconciliation.metadata } : {})
          });
          await this.repositories.publishAttemptRepository.save(currentAttempt);
          const updatedVideo = await this.saveVideoPublishState(context.video, currentAttempt, {
            lastProviderStatus: reconciliation.providerStatus,
            scheduledFor: schedule.scheduledFor,
            clearLastPublishError: true,
            ...(currentAttempt.providerPublicationId
              ? { externalPublicationId: currentAttempt.providerPublicationId }
              : {}),
            ...(currentAttempt.externalUrl ? { externalUrl: currentAttempt.externalUrl } : {})
          });
          await this.auditTrailService.recordActivity({
            action: "publish.reconciled_manual_action_required",
            reference: createReference("publish_attempt", currentAttempt.id),
            message: `Reconciled submitted publish attempt ${currentAttempt.sequenceNumber} to manual action required state.`
          });
          await this.auditTrailService.snapshot(
            createReference("publish_attempt", currentAttempt.id),
            "publish.reconciled_manual_action_required",
            currentAttempt
          );
          await this.auditTrailService.snapshot(
            createReference("video", updatedVideo.id),
            "publish.reconciled_manual_action_required",
            updatedVideo
          );

          items.push({
            publishAttemptId: currentAttempt.id,
            videoId: currentAttempt.videoId,
            status: currentAttempt.status,
            provider: currentAttempt.provider,
            outcome: "manual_action_required",
            providerStatus: reconciliation.providerStatus,
            ageMs
          });
          continue;
        }

        if (reconciliation.state === "failed") {
          currentAttempt = failPublishAttempt(currentAttempt, {
            errorMessage:
              reconciliation.failureMessage ??
              "Publish provider reported a failed submission during reconciliation.",
            failureStage: "provider_execution"
          });
          await this.repositories.publishAttemptRepository.save(currentAttempt);
          await this.saveVideoPublishState(context.video, currentAttempt, {
            lastProviderStatus: "failed",
            clearLastPublishError: false,
            scheduledFor: schedule.scheduledFor,
            ...(currentAttempt.lastError ? { lastPublishError: currentAttempt.lastError } : {})
          });
          await this.auditTrailService.recordActivity({
            action: "publish.reconciled_failed",
            reference: createReference("publish_attempt", currentAttempt.id),
            message: `Reconciled submitted publish attempt ${currentAttempt.sequenceNumber} to failed state.`,
            metadata: {
              providerStatus: reconciliation.providerStatus
            }
          });
          await this.auditTrailService.snapshot(
            createReference("publish_attempt", currentAttempt.id),
            "publish.reconciled_failed",
            currentAttempt
          );

          items.push({
            publishAttemptId: currentAttempt.id,
            videoId: currentAttempt.videoId,
            status: currentAttempt.status,
            provider: currentAttempt.provider,
            outcome: "failed_provider",
            providerStatus: reconciliation.providerStatus,
            ageMs,
            message:
              reconciliation.failureMessage ??
              "Publish provider reported a failed submission during reconciliation."
          });
          continue;
        }

        if (ageMs < staleAfterMs) {
          items.push({
            publishAttemptId: currentAttempt.id,
            videoId: currentAttempt.videoId,
            status: currentAttempt.status,
            provider: currentAttempt.provider,
            outcome: "pending",
            providerStatus: reconciliation.providerStatus,
            ageMs
          });
          continue;
        }

        const timeoutMessage = `Publish attempt "${currentAttempt.id}" exceeded reconciliation timeout window while still submitted.`;
        currentAttempt = failPublishAttempt(currentAttempt, {
          errorMessage: timeoutMessage,
          failureStage: "workflow"
        });
        await this.repositories.publishAttemptRepository.save(currentAttempt);
        await this.saveVideoPublishState(context.video, currentAttempt, {
          lastProviderStatus: "failed",
          clearLastPublishError: false,
          scheduledFor: schedule.scheduledFor,
          ...(currentAttempt.lastError ? { lastPublishError: currentAttempt.lastError } : {})
        });
        await this.auditTrailService.recordActivity({
          action: "publish.reconcile_timeout",
          reference: createReference("publish_attempt", currentAttempt.id),
          message: timeoutMessage
        });
        await this.auditTrailService.snapshot(
          createReference("publish_attempt", currentAttempt.id),
          "publish.reconcile_timeout",
          currentAttempt
        );

        items.push({
          publishAttemptId: currentAttempt.id,
          videoId: currentAttempt.videoId,
          status: currentAttempt.status,
          provider: currentAttempt.provider,
          outcome: "failed_timeout",
          providerStatus: reconciliation.providerStatus,
          ageMs,
          message: timeoutMessage
        });
      } finally {
        await this.workflowJobService.releaseLease(leasedJob);
      }
    }

    return {
      scannedCount: candidateAttempts.length,
      publishedCount: items.filter((item) => item.outcome === "published").length,
      manualActionRequiredCount: items.filter((item) => item.outcome === "manual_action_required").length,
      failedCount: items.filter((item) => item.outcome.startsWith("failed_")).length,
      pendingCount: items.filter((item) => item.outcome === "pending").length,
      items
    };
  }

  private async loadPublishContext(videoId: string): Promise<PublishContext> {
    const video = await this.getVideoOrThrow(videoId);
    const contentFormat = await this.getContentFormatOrThrow(video.contentFormatId);
    const [schedule, assets] = await Promise.all([
      this.repositories.publicationScheduleRepository.findByVideoId(video.id),
      this.repositories.assetRepository.listByVideoId(video.id)
    ]);

    const activeImageAssets = assets.filter(
      (asset) => asset.role === "scene_image" && asset.type === "image" && asset.isActive
    );
    const activeAudioAssets = assets.filter(
      (asset) => asset.role === "scene_voice" && asset.type === "audio" && asset.isActive
    );
    const activeRenderAsset = assets.find(
      (asset) => asset.role === "render_output" && asset.type === "video" && asset.isActive
    );
    const publishProvider = schedule
      ? this.providerRegistry.find(schedule.provider)
      : undefined;

    return {
      video,
      contentFormat,
      ...(schedule ? { schedule } : {}),
      ...(activeRenderAsset ? { activeRenderAsset } : {}),
      activeImageAssets,
      activeAudioAssets,
      ...(publishProvider
        ? {
            publishProvider
          }
        : {})
    };
  }

  private async buildValidationReport(
    context: PublishContext,
    force: boolean
  ): Promise<VideoValidationReport> {
    const baseReport = validateVideoForPublish(context.video, context.contentFormat, {
      ...(context.schedule ? { schedule: context.schedule } : {}),
      ...(context.schedule ? { publishMode: context.schedule.mode } : {}),
      ...(context.activeRenderAsset ? { activeRenderAsset: context.activeRenderAsset } : {}),
      publishWindowOpen:
        force ||
        !context.schedule ||
        context.schedule.mode === "manual" ||
        context.schedule.scheduledFor.getTime() <= Date.now()
    });

    const issues = [...baseReport.issues];

    if (context.schedule && !context.publishProvider) {
      issues.push({
        code: "publish_provider_unavailable",
        message: `Provider "${context.schedule.provider}" is not wired in this runtime.`
      });
    }

    if (context.schedule && context.publishProvider) {
      const providerValidation = await context.publishProvider.validate({
        video: context.video,
        contentFormat: context.contentFormat,
        schedule: context.schedule,
        publishMode: context.schedule.mode,
        ...(context.activeRenderAsset ? { activeRenderAsset: context.activeRenderAsset } : {}),
        activeImageAssets: context.activeImageAssets,
        activeAudioAssets: context.activeAudioAssets
      });

      if (!providerValidation.isValid) {
        issues.push(...mapProviderIssues(providerValidation.issues));
      }
    }

    return {
      isValid: issues.length === 0,
      issues
    };
  }

  private async saveVideoPublishState(
    video: Video,
    publishAttempt: PublishAttempt,
    input: {
      lastProviderStatus: string;
      externalPublicationId?: string;
      externalUrl?: string;
      publishedAt?: Date;
      scheduledFor?: Date;
      lastPublishError?: string;
      clearLastPublishError: boolean;
    }
  ): Promise<Video> {
    const updatedVideo = updateVideoPublishingConfig(video, {
      enabled: true,
      channel: publishAttempt.platformSlug,
      provider: publishAttempt.provider,
      mode: publishAttempt.mode,
      ...(input.scheduledFor
        ? { scheduledFor: input.scheduledFor }
        : video.publishingConfig?.scheduledFor
          ? { scheduledFor: video.publishingConfig.scheduledFor }
        : {}),
      lastPublishAttemptId: publishAttempt.id,
      lastProviderStatus: input.lastProviderStatus,
      ...(input.clearLastPublishError
        ? {}
        : input.lastPublishError
          ? { lastPublishError: input.lastPublishError }
          : {}),
      ...(input.externalPublicationId ? { externalPublicationId: input.externalPublicationId } : {}),
      ...(input.externalUrl ? { externalUrl: input.externalUrl } : {}),
      ...(input.publishedAt ? { publishedAt: input.publishedAt } : {})
    });
    await this.repositories.videoRepository.save(updatedVideo);
    await this.auditTrailService.snapshot(
      createReference("video", updatedVideo.id),
      "video.publish_state_updated",
      updatedVideo
    );
    return updatedVideo;
  }

  private async recordPublishReconcileCost(
    publishAttempt: PublishAttempt,
    provider: string,
    reconciliation: PublishProviderReconcileResult,
    ageMs: number
  ): Promise<void> {
    await this.auditTrailService.recordCost({
      provider,
      category: "publishing",
      reference: createReference("publish_attempt", publishAttempt.id),
      amount: reconciliation.cost?.amount ?? 0,
      currency: reconciliation.cost?.currency ?? "USD",
      units: reconciliation.cost?.units ?? "publish_reconcile",
      quantity: reconciliation.cost?.quantity ?? 1,
      metadata: {
        state: reconciliation.state,
        providerStatus: reconciliation.providerStatus,
        ageMs,
        ...(reconciliation.cost?.metadata ? reconciliation.cost.metadata : {})
      }
    });
  }

  private buildPublishCallbackPayload(
    input: HandlePublishStatusCallbackInput
  ): Record<string, string | number | boolean | null> {
    return {
      status: input.status,
      providerStatus: input.providerStatus,
      ...(input.publicationId ? { publicationId: input.publicationId } : {}),
      ...(input.externalUrl ? { externalUrl: input.externalUrl } : {}),
      ...(input.publishedAt ? { publishedAt: input.publishedAt.toISOString() } : {}),
      ...(input.failureMessage ? { failureMessage: input.failureMessage } : {}),
      ...(input.checklist ? { checklist: input.checklist.join(" | ") } : {})
    };
  }

  private buildPublishCallbackReceiptKey(
    provider: string,
    action: "status_update",
    requestIdempotencyKey: string
  ): string {
    return `publish:${provider}:${action}:${requestIdempotencyKey}`;
  }

  private async reservePublishCallback<TResult>(input: {
    provider: string;
    publishAttempt: PublishAttempt;
    workflowJob: WorkflowJob;
    requestIdempotencyKey: string;
    requestMetadata: Record<string, string | number | boolean | null>;
  }): Promise<
    | {
        callbackReceipt: CallbackReceipt;
      }
    | {
        replayedResult: TResult;
      }
  > {
    const callbackReceipt = createCallbackReceipt({
      channel: "publish",
      operation: "publish_status_update",
      provider: input.provider,
      idempotencyKey: this.buildPublishCallbackReceiptKey(
        input.provider,
        "status_update",
        input.requestIdempotencyKey
      ),
      reference: createReference("publish_attempt", input.publishAttempt.id),
      workflowJobId: input.workflowJob.id,
      requestMetadata: input.requestMetadata
    });
    const reservation = await this.repositories.callbackReceiptRepository.reserve(callbackReceipt);

    if (reservation.created) {
      return {
        callbackReceipt: reservation.callbackReceipt
      };
    }

    this.assertPublishCallbackReceiptOwnership(
      reservation.callbackReceipt,
      input.provider,
      input.publishAttempt.id,
      input.workflowJob.id
    );

    return {
      replayedResult: this.replayReservedPublishCallback<TResult>(reservation.callbackReceipt)
    };
  }

  private assertPublishCallbackReceiptOwnership(
    callbackReceipt: CallbackReceipt,
    provider: string,
    publishAttemptId: string,
    workflowJobId: string
  ): void {
    if (
      callbackReceipt.channel !== "publish" ||
      callbackReceipt.operation !== "publish_status_update" ||
      callbackReceipt.provider !== provider ||
      callbackReceipt.reference.entityType !== "publish_attempt" ||
      callbackReceipt.reference.entityId !== publishAttemptId ||
      callbackReceipt.workflowJobId !== workflowJobId
    ) {
      throw new ValidationError(
        "Publish callback idempotency key is already bound to a different callback context.",
        "publish_callback_idempotency_conflict",
        {
          provider,
          publishAttemptId,
          workflowJobId
        }
      );
    }
  }

  private async completeReservedPublishCallback<T>(
    callbackReceipt: CallbackReceipt,
    result: T
  ): Promise<void> {
    await this.repositories.callbackReceiptRepository.save(
      completeCallbackReceipt(
        callbackReceipt,
        JSON.stringify({
          kind: "success",
          result
        } satisfies PublishCallbackStoredOutcome<T>)
      )
    );
  }

  private async rejectReservedPublishCallback(
    callbackReceipt: CallbackReceipt,
    error: unknown
  ): Promise<void> {
    if (callbackReceipt.status !== "processing") {
      return;
    }

    const normalizedError =
      error instanceof DomainError
        ? error
        : new DomainError(error instanceof Error ? error.message : String(error), "internal_error", {}, 500);

    await this.repositories.callbackReceiptRepository.save(
      rejectCallbackReceipt(
        callbackReceipt,
        JSON.stringify({
          kind: "error",
          error: {
            message: normalizedError.message,
            code: normalizedError.code,
            statusCode: normalizedError.statusCode,
            ...(normalizedError.details ? { details: normalizedError.details } : {})
          }
        } satisfies PublishCallbackStoredOutcome<never>)
      )
    );
  }

  private replayReservedPublishCallback<T>(callbackReceipt: CallbackReceipt): T {
    if (callbackReceipt.status === "processing") {
      throw new ConflictError(
        "Publish callback is already being processed for this idempotency key.",
        {
          callbackReceiptId: callbackReceipt.id
        }
      );
    }

    if (!callbackReceipt.responsePayload) {
      throw new InvalidStateError(
        `Callback receipt "${callbackReceipt.id}" has no stored response payload to replay.`,
        {
          callbackReceiptId: callbackReceipt.id
        }
      );
    }

    const outcome = JSON.parse(callbackReceipt.responsePayload) as PublishCallbackStoredOutcome<T>;

    if (outcome.kind === "error") {
      throw new DomainError(
        outcome.error.message,
        outcome.error.code,
        outcome.error.details,
        outcome.error.statusCode
      );
    }

    return reviveCallbackSnapshot(outcome.result) as T;
  }

  private async getPublishWorkflowJobOrThrow(publishAttempt: PublishAttempt): Promise<WorkflowJob> {
    if (!publishAttempt.workflowJobId) {
      throw new InvalidStateError(
        `Publish attempt "${publishAttempt.id}" has no workflow job binding.`,
        {
          publishAttemptId: publishAttempt.id
        }
      );
    }

    const workflowJob = await this.workflowJobService.getJob(publishAttempt.workflowJobId);

    if (
      !workflowJob ||
      workflowJob.type !== "publish" ||
      workflowJob.reference.entityType !== "publish_attempt" ||
      workflowJob.reference.entityId !== publishAttempt.id
    ) {
      throw new NotFoundError(
        `Publish workflow job "${publishAttempt.workflowJobId}" was not found for attempt "${publishAttempt.id}".`,
        {
          entityType: "workflow_job",
          entityId: publishAttempt.workflowJobId,
          publishAttemptId: publishAttempt.id
        }
      );
    }

    return workflowJob;
  }

  private assertPublishCallbackAccess(
    workflowJob: WorkflowJob,
    publishAttempt: PublishAttempt,
    callbackToken: string
  ): void {
    const expectedCallbackToken = workflowJob.payload?.callbackToken;

    if (typeof expectedCallbackToken !== "string" || expectedCallbackToken !== callbackToken) {
      throw new ValidationError(
        "Publish callback token is invalid.",
        "publish_callback_token_invalid",
        {
          publishAttemptId: publishAttempt.id,
          workflowJobId: workflowJob.id
        }
      );
    }
  }

  private async getPublicationScheduleOrThrow(scheduleId: string): Promise<PublicationSchedule> {
    const schedule = await this.repositories.publicationScheduleRepository.findById(scheduleId);

    if (!schedule) {
      throw new NotFoundError(`Publication schedule "${scheduleId}" was not found.`, {
        entityType: "publication_schedule",
        entityId: scheduleId
      });
    }

    return schedule;
  }

  private async getVideoOrThrow(videoId: string) {
    const video = await this.repositories.videoRepository.findById(videoId);

    if (!video) {
      throw new NotFoundError(`Video "${videoId}" was not found.`, {
        entityType: "video",
        entityId: videoId
      });
    }

    return video;
  }

  private async getContentFormatOrThrow(contentFormatId: string) {
    const contentFormat = await this.repositories.contentFormatRepository.findById(contentFormatId);

    if (!contentFormat) {
      throw new NotFoundError(`Content format "${contentFormatId}" was not found.`, {
        entityType: "content_format",
        entityId: contentFormatId
      });
    }

    return contentFormat;
  }

  private async getPublishAttemptOrThrow(publishAttemptId: string) {
    const publishAttempt = await this.repositories.publishAttemptRepository.findById(publishAttemptId);

    if (!publishAttempt) {
      throw new NotFoundError(`Publish attempt "${publishAttemptId}" was not found.`, {
        entityType: "publish_attempt",
        entityId: publishAttemptId
      });
    }

    return publishAttempt;
  }

  private async refreshSubmittedPublishAttempt(publishAttemptId: string) {
    const publishAttempt =
      await this.repositories.publishAttemptRepository.findById(publishAttemptId);

    if (!publishAttempt || publishAttempt.status !== "submitted") {
      return undefined;
    }

    return publishAttempt;
  }
}
