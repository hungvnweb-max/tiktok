import {
  createAsset,
  deactivateAsset,
  type Asset,
  type AssetStorageProvider
} from "../domain/asset/asset";
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
  ensurePositiveInteger,
  type MetadataRecord
} from "../domain/common/entity";
import { createReference } from "./operational-services";
import { updateVideoStatus, type Video } from "../domain/video/video";
import type { PlatformRepositories } from "../ports/repositories";
import type { RenderPipelinePort } from "../ports/render-pipeline-port";
import type { AuditTrailService, WorkflowJobService } from "./operational-services";
import type { VideoWorkflowService } from "./video-workflow-services";
import type { WorkflowJob, WorkflowJobLog } from "../domain/job/workflow-job";

export interface QueueRenderInput {
  videoId: string;
  retryOfWorkflowJobId?: string;
}

export interface CompleteRenderInput {
  videoId: string;
  workflowJobId: string;
  callbackToken: string;
  providerJobId: string;
  idempotencyKey: string;
  signature: string;
  signatureTimestamp: string;
  assetUrl: string;
  storageProvider?: AssetStorageProvider;
  storageKey?: string;
  mimeType?: string;
  bytes?: number;
  width?: number;
  height?: number;
  durationSeconds?: number;
  providerStatus?: string;
}

export interface FailRenderInput {
  videoId: string;
  workflowJobId: string;
  callbackToken: string;
  providerJobId: string;
  idempotencyKey: string;
  signature: string;
  signatureTimestamp: string;
  errorMessage: string;
  providerStatus?: string;
}

export interface ReconcileRenderJobsInput {
  ownerId: string;
  leaseMs: number;
  staleAfterMs: number;
  limit?: number;
  now?: Date;
}

export interface ReconcileRenderJobsResultItem {
  workflowJobId: string;
  videoId: string;
  status: WorkflowJob["status"];
  provider: Video["renderConfig"]["provider"];
  outcome: "pending" | "completed" | "failed_timeout" | "failed_provider";
  providerStatus?: string | undefined;
  ageMs: number;
  message?: string | undefined;
}

export interface ReconcileRenderJobsResult {
  scannedCount: number;
  completedCount: number;
  failedCount: number;
  pendingCount: number;
  items: ReconcileRenderJobsResultItem[];
}

type RenderCompletionResult = {
  job: WorkflowJob;
  logs: WorkflowJobLog[];
  asset: Asset;
  video: Video;
};

type RenderFailureResult = {
  job: WorkflowJob;
  logs: WorkflowJobLog[];
  video: Video;
};

const isActiveRenderJobStatus = (status: WorkflowJob["status"]): boolean => {
  return status === "waiting" || status === "processing" || status === "retrying";
};

const getNextRenderAssetVersion = (assets: Asset[]): number => {
  const versions = assets
    .filter((asset) => asset.role === "render_output" && asset.type === "video")
    .map((asset) => asset.versionNumber);

  return versions.length === 0 ? 1 : Math.max(...versions) + 1;
};

const callbackDateFieldNames = new Set([
  "createdAt",
  "updatedAt",
  "startedAt",
  "finishedAt",
  "processedAt",
  "publishedAt",
  "scheduledFor"
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

type RenderCallbackStoredOutcome<T> =
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

export class RenderWorkflowService {
  constructor(
    private readonly repositories: PlatformRepositories,
    private readonly renderPipelines: RenderPipelinePort[],
    private readonly videoWorkflowService: VideoWorkflowService,
    private readonly workflowJobService: WorkflowJobService,
    private readonly auditTrailService: AuditTrailService
  ) {}

  async enqueueRender(input: QueueRenderInput) {
    const validation = await this.videoWorkflowService.validateRenderReadiness(input.videoId);

    if (!validation.report.isValid) {
      throw new InvalidStateError(`Video "${input.videoId}" is not render-ready.`, {
        videoId: input.videoId,
        issueCount: validation.report.issues.length,
        issues: validation.report.issues
      });
    }

    const video = validation.video;
    const contentFormat = await this.getContentFormatOrThrow(video.contentFormatId);
    const existingRenderJobs = await this.workflowJobService.listJobsByReference(
      createReference("video", video.id),
      "render"
    );
    const activeJob = existingRenderJobs.find((job) => isActiveRenderJobStatus(job.status));

    if (activeJob) {
      throw new InvalidStateError(`Video "${video.id}" already has an active render job.`, {
        videoId: video.id,
        workflowJobId: activeJob.id,
        status: activeJob.status
      });
    }

    if (input.retryOfWorkflowJobId) {
      const retryJob = await this.getRenderJobOrThrow(input.retryOfWorkflowJobId, video.id);

      if (retryJob.status !== "failed" && retryJob.status !== "completed") {
        throw new InvalidStateError(
          `Render job "${retryJob.id}" is not in a retryable terminal state.`,
          {
            workflowJobId: retryJob.id,
            status: retryJob.status
          }
        );
      }
    }

    const callbackToken = createEntityId("rendercb");
    const renderPipeline = this.resolvePipeline(video.renderConfig.provider, video.renderConfig.templateSlug);
    const assets = await this.repositories.assetRepository.listByVideoId(video.id);
    const subtitlePack = await this.repositories.subtitlePackRepository.findByVideoId(video.id);
    const activeImageAssets = assets.filter(
      (asset) => asset.role === "scene_image" && asset.type === "image" && asset.isActive
    );
    const activeAudioAssets = assets.filter(
      (asset) => asset.role === "scene_voice" && asset.type === "audio" && asset.isActive
    );
    const logs = [];
    let job = (
      await this.workflowJobService.createJob({
        type: "render",
        reference: createReference("video", video.id),
        maxAttempts: 3,
        payload: {
          videoId: video.id,
          provider: renderPipeline.providerId,
          templateSlug: video.renderConfig.templateSlug,
          targetPlatform: video.renderConfig.targetPlatform,
          callbackToken,
          ...(input.retryOfWorkflowJobId ? { retryOfWorkflowJobId: input.retryOfWorkflowJobId } : {})
        }
      })
    );
    logs.push(job.log);
    let currentJob = job.job;

    while (true) {
      const started = await this.workflowJobService.startJob(currentJob);
      currentJob = started.job;
      logs.push(started.log);

      try {
        const submission = await renderPipeline.enqueue({
          workflowJob: currentJob,
          video,
          contentFormat,
          ...(subtitlePack ? { subtitlePack } : {}),
          activeImageAssets,
          activeAudioAssets
        });

        currentJob = await this.workflowJobService.setResultMetadata(currentJob, {
          providerJobId: submission.providerJobId,
          providerStatus: submission.providerStatus,
          templateSlug: video.renderConfig.templateSlug,
          provider: renderPipeline.providerId
        });
        logs.push(
          await this.workflowJobService.logJob(
            currentJob,
            "info",
            `Submitted render workflow to provider "${renderPipeline.providerId}".`,
            {
              providerJobId: submission.providerJobId,
              providerStatus: submission.providerStatus
            }
          )
        );

        await this.auditTrailService.recordActivity({
          action: "video.render_enqueued",
          reference: createReference("workflow_job", currentJob.id),
          message: `Queued render job "${currentJob.id}" for video "${video.id}".`,
          metadata: {
            provider: renderPipeline.providerId,
            templateSlug: video.renderConfig.templateSlug
          }
        });
        await this.auditTrailService.snapshot(
          createReference("workflow_job", currentJob.id),
          "video.render_enqueued",
          currentJob
        );

        if (submission.cost) {
          await this.auditTrailService.recordCost({
            provider: renderPipeline.providerId,
            category: "render",
            reference: createReference("workflow_job", currentJob.id),
            amount: submission.cost.amount,
            currency: submission.cost.currency ?? "USD",
            units: submission.cost.units,
            quantity: submission.cost.quantity,
            ...(submission.cost.metadata ? { metadata: submission.cost.metadata } : {})
          });
        }

        return {
          job: currentJob,
          logs,
          video,
          submission
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        if (!(error instanceof InvalidStateError) && !(error instanceof ValidationError) && currentJob.attemptCount < currentJob.maxAttempts) {
          const retrying = await this.workflowJobService.markJobRetrying(currentJob, message);
          currentJob = retrying.job;
          logs.push(retrying.log);
          continue;
        }

        const failed = await this.workflowJobService.failJob(currentJob, message);
        currentJob = failed.job;
        logs.push(failed.log);

        await this.auditTrailService.recordActivity({
          action: "video.render_submission_failed",
          reference: createReference("workflow_job", currentJob.id),
          message: `Render submission failed for video "${video.id}".`,
          metadata: {
            provider: renderPipeline.providerId
          }
        });

        throw error;
      }
    }
  }

  async completeRender(input: CompleteRenderInput) {
    const video = await this.getVideoOrThrow(input.videoId);
    const job = await this.getRenderJobOrThrow(input.workflowJobId, video.id);
    this.assertRenderCallbackAccess(job, input.callbackToken, input.providerJobId);
    const renderPipeline = this.resolvePipeline(
      this.getQueuedRenderProvider(job, video),
      this.getQueuedTemplateSlug(job, video)
    );
    const completePayload = this.buildCompleteCallbackPayload(input);
    const verification = await renderPipeline.verifyCallback({
      action: "complete",
      workflowJob: job,
      callbackToken: input.callbackToken,
      providerJobId: input.providerJobId,
      idempotencyKey: input.idempotencyKey,
      signature: input.signature,
      signatureTimestamp: input.signatureTimestamp,
      payload: completePayload
    });
    const reservation = await this.reserveRenderCallback<RenderCompletionResult>({
      action: "complete",
      provider: renderPipeline.providerId,
      videoId: video.id,
      workflowJobId: job.id,
      requestIdempotencyKey: input.idempotencyKey,
      requestMetadata: {
        requestIdempotencyKey: input.idempotencyKey,
        providerJobId: input.providerJobId,
        signatureTimestamp: input.signatureTimestamp,
        verificationScheme: verification.scheme,
        verifiedAt: verification.verifiedAt
      }
    });
    if ("replayedResult" in reservation) {
      return reservation.replayedResult;
    }
    const callbackReceipt = reservation.callbackReceipt;

    try {
      if (job.status === "completed") {
        const existingAsset = await this.getCompletedRenderAssetOrThrow(video.id, job);
        const result = {
          job,
          logs: [],
          asset: existingAsset,
          video
        };
        await this.completeReservedCallback(callbackReceipt, result);

        return result;
      }

      if (job.status !== "processing") {
        throw new InvalidStateError(`Render job "${job.id}" cannot complete from status "${job.status}".`, {
          workflowJobId: job.id,
          status: job.status
        });
      }
      const result = await this.applyRenderCompletion(video, job, {
        providerJobId: input.providerJobId,
        assetUrl: input.assetUrl,
        ...(input.storageProvider ? { storageProvider: input.storageProvider } : {}),
        ...(input.storageKey ? { storageKey: input.storageKey } : {}),
        ...(input.mimeType ? { mimeType: input.mimeType } : {}),
        ...(input.bytes === undefined ? {} : { bytes: input.bytes }),
        ...(input.width === undefined ? {} : { width: input.width }),
        ...(input.height === undefined ? {} : { height: input.height }),
        ...(input.durationSeconds === undefined ? {} : { durationSeconds: input.durationSeconds }),
        ...(input.providerStatus ? { providerStatus: input.providerStatus } : {})
      });
      await this.completeReservedCallback(callbackReceipt, result);

      return result;
    } catch (error) {
      await this.rejectReservedCallback(callbackReceipt, error);
      throw error;
    }
  }

  async failRender(input: FailRenderInput) {
    const video = await this.getVideoOrThrow(input.videoId);
    const job = await this.getRenderJobOrThrow(input.workflowJobId, video.id);
    this.assertRenderCallbackAccess(job, input.callbackToken, input.providerJobId);
    const renderPipeline = this.resolvePipeline(
      this.getQueuedRenderProvider(job, video),
      this.getQueuedTemplateSlug(job, video)
    );
    const failPayload = this.buildFailCallbackPayload(input);
    const verification = await renderPipeline.verifyCallback({
      action: "fail",
      workflowJob: job,
      callbackToken: input.callbackToken,
      providerJobId: input.providerJobId,
      idempotencyKey: input.idempotencyKey,
      signature: input.signature,
      signatureTimestamp: input.signatureTimestamp,
      payload: failPayload
    });
    const reservation = await this.reserveRenderCallback<RenderFailureResult>({
      action: "fail",
      provider: renderPipeline.providerId,
      videoId: video.id,
      workflowJobId: job.id,
      requestIdempotencyKey: input.idempotencyKey,
      requestMetadata: {
        requestIdempotencyKey: input.idempotencyKey,
        providerJobId: input.providerJobId,
        signatureTimestamp: input.signatureTimestamp,
        verificationScheme: verification.scheme,
        verifiedAt: verification.verifiedAt
      }
    });
    if ("replayedResult" in reservation) {
      return reservation.replayedResult;
    }
    const callbackReceipt = reservation.callbackReceipt;

    try {
      if (job.status === "failed") {
        const result = {
          job,
          logs: [],
          video
        };
        await this.completeReservedCallback(callbackReceipt, result);

        return result;
      }

      if (job.status !== "processing" && job.status !== "retrying") {
        throw new InvalidStateError(`Render job "${job.id}" cannot fail from status "${job.status}".`, {
          workflowJobId: job.id,
          status: job.status
        });
      }
      const result = await this.applyRenderFailure(video, job, {
        errorMessage: input.errorMessage,
        ...(input.providerStatus ? { providerStatus: input.providerStatus } : {})
      });
      await this.completeReservedCallback(callbackReceipt, result);

      return result;
    } catch (error) {
      await this.rejectReservedCallback(callbackReceipt, error);
      throw error;
    }
  }

  async reconcileRenderJobs(input: ReconcileRenderJobsInput): Promise<ReconcileRenderJobsResult> {
    const now = input.now ?? new Date();
    const staleAfterMs = ensurePositiveInteger(
      input.staleAfterMs,
      "renderReconciliation.staleAfterMs"
    );
    const limit =
      input.limit === undefined
        ? 25
        : ensurePositiveInteger(input.limit, "renderReconciliation.limit");
    const allJobs = await this.workflowJobService.listJobs();
    const candidateJobs = allJobs
      .filter(
        (job) =>
          job.type === "render" && (job.status === "processing" || job.status === "retrying")
      )
      .sort((left, right) => left.updatedAt.getTime() - right.updatedAt.getTime())
      .slice(0, limit);
    const items: ReconcileRenderJobsResultItem[] = [];

    for (const job of candidateJobs) {
      if (job.reference.entityType !== "video") {
        continue;
      }

      const leasedJob = await this.workflowJobService.tryAcquireLease(job.id, {
        ownerId: input.ownerId,
        leaseMs: input.leaseMs,
        expectedStatuses: ["processing", "retrying"]
      });

      if (!leasedJob) {
        continue;
      }

      const video = await this.getVideoOrThrow(leasedJob.reference.entityId);
      const provider = this.getQueuedRenderProvider(leasedJob, video);
      const renderPipeline = this.resolvePipeline(
        provider,
        this.getQueuedTemplateSlug(leasedJob, video)
      );
      const contentFormat = await this.getContentFormatOrThrow(video.contentFormatId);
      const ageMs = now.getTime() - (leasedJob.startedAt ?? leasedJob.updatedAt).getTime();
      let currentJob = leasedJob;

      try {
        if (renderPipeline.reconcileSubmission) {
          const reconciliation = await renderPipeline.reconcileSubmission({
            workflowJob: currentJob,
            video,
            contentFormat
          });

          if (reconciliation.providerStatus !== currentJob.resultMetadata?.providerStatus) {
            currentJob = await this.workflowJobService.setResultMetadata(currentJob, {
              ...(currentJob.resultMetadata ?? {}),
              providerStatus: reconciliation.providerStatus
            });
          }

          if (reconciliation.state === "completed" && reconciliation.completion) {
            const refreshedJob = await this.refreshOwnedReconciliationJob(currentJob);

            if (!refreshedJob) {
              continue;
            }

            currentJob = refreshedJob;
            const completion = await this.applyRenderCompletion(video, currentJob, {
              providerJobId:
                typeof currentJob.resultMetadata?.providerJobId === "string"
                  ? currentJob.resultMetadata.providerJobId
                  : `reconciled-${currentJob.id}`,
              assetUrl: reconciliation.completion.assetUrl,
              ...(reconciliation.completion.storageProvider
                ? { storageProvider: reconciliation.completion.storageProvider }
                : {}),
              ...(reconciliation.completion.storageKey
                ? { storageKey: reconciliation.completion.storageKey }
                : {}),
              ...(reconciliation.completion.mimeType
                ? { mimeType: reconciliation.completion.mimeType }
                : {}),
              ...(reconciliation.completion.bytes === undefined
                ? {}
                : { bytes: reconciliation.completion.bytes }),
              ...(reconciliation.completion.width === undefined
                ? {}
                : { width: reconciliation.completion.width }),
              ...(reconciliation.completion.height === undefined
                ? {}
                : { height: reconciliation.completion.height }),
              ...(reconciliation.completion.durationSeconds === undefined
                ? {}
                : { durationSeconds: reconciliation.completion.durationSeconds }),
              providerStatus: reconciliation.providerStatus
            });
            currentJob = completion.job;
            items.push({
              workflowJobId: completion.job.id,
              videoId: video.id,
              status: completion.job.status,
              provider,
              outcome: "completed",
              providerStatus: reconciliation.providerStatus,
              ageMs
            });
            continue;
          }

          if (reconciliation.state === "failed") {
            const refreshedJob = await this.refreshOwnedReconciliationJob(currentJob);

            if (!refreshedJob) {
              continue;
            }

            currentJob = refreshedJob;
            const failure = await this.applyRenderFailure(video, currentJob, {
              errorMessage:
                reconciliation.failureMessage ??
                "Render provider reported a failed submission.",
              providerStatus: reconciliation.providerStatus
            });
            currentJob = failure.job;
            items.push({
              workflowJobId: failure.job.id,
              videoId: video.id,
              status: failure.job.status,
              provider,
              outcome: "failed_provider",
              providerStatus:
                typeof failure.job.resultMetadata?.providerStatus === "string"
                  ? failure.job.resultMetadata.providerStatus
                  : reconciliation.providerStatus,
              ageMs,
              message: reconciliation.failureMessage ?? "Render provider reported failure."
            });
            continue;
          }

          if (ageMs < staleAfterMs) {
            const refreshedJob = await this.refreshOwnedReconciliationJob(currentJob);

            if (!refreshedJob) {
              continue;
            }

            currentJob = refreshedJob;
            items.push({
              workflowJobId: currentJob.id,
              videoId: video.id,
              status: currentJob.status,
              provider,
              outcome: "pending",
              providerStatus: reconciliation.providerStatus,
              ageMs
            });
            continue;
          }
        } else if (ageMs < staleAfterMs) {
          const refreshedJob = await this.refreshOwnedReconciliationJob(currentJob);

          if (!refreshedJob) {
            continue;
          }

          currentJob = refreshedJob;
          items.push({
            workflowJobId: currentJob.id,
            videoId: video.id,
            status: currentJob.status,
            provider,
            outcome: "pending",
            providerStatus:
              typeof currentJob.resultMetadata?.providerStatus === "string"
                ? currentJob.resultMetadata.providerStatus
                : undefined,
            ageMs
          });
          continue;
        }

        const refreshedJob = await this.refreshOwnedReconciliationJob(currentJob);

        if (!refreshedJob) {
          continue;
        }

        currentJob = refreshedJob;
        const timeoutMessage = `Render job "${currentJob.id}" exceeded the reconciliation timeout window without a provider callback.`;
        const failure = await this.applyRenderFailure(video, currentJob, {
          errorMessage: timeoutMessage,
          providerStatus:
            typeof currentJob.resultMetadata?.providerStatus === "string"
              ? currentJob.resultMetadata.providerStatus
              : "timed_out"
        });
        currentJob = failure.job;
        items.push({
          workflowJobId: failure.job.id,
          videoId: video.id,
          status: failure.job.status,
          provider,
          outcome: "failed_timeout",
          providerStatus:
            typeof failure.job.resultMetadata?.providerStatus === "string"
              ? failure.job.resultMetadata.providerStatus
              : "timed_out",
          ageMs,
          message: timeoutMessage
        });
      } finally {
        if (currentJob.status === "processing" || currentJob.status === "retrying") {
          await this.workflowJobService.releaseLease(currentJob);
        }
      }
    }

    return {
      scannedCount: candidateJobs.length,
      completedCount: items.filter((item) => item.outcome === "completed").length,
      failedCount: items.filter((item) => item.outcome === "failed_provider" || item.outcome === "failed_timeout").length,
      pendingCount: items.filter((item) => item.outcome === "pending").length,
      items
    };
  }

  private async applyRenderCompletion(
    video: Video,
    job: WorkflowJob,
    input: {
      providerJobId: string;
      assetUrl: string;
      storageProvider?: AssetStorageProvider;
      storageKey?: string;
      mimeType?: string;
      bytes?: number;
      width?: number;
      height?: number;
      durationSeconds?: number;
      providerStatus?: string;
    }
  ): Promise<RenderCompletionResult> {
    const existingAssets = await this.repositories.assetRepository.listByVideoId(video.id);

    for (const asset of existingAssets.filter(
      (item) => item.role === "render_output" && item.type === "video" && item.isActive
    )) {
      await this.repositories.assetRepository.save(deactivateAsset(asset));
    }

    const outputAsset = createAsset({
      videoId: video.id,
      type: "video",
      role: "render_output",
      provider: video.renderConfig.provider,
      sourceType: "provider_generated",
      versionNumber: getNextRenderAssetVersion(existingAssets),
      isActive: true,
      storage: {
        storageProvider: input.storageProvider ?? "local",
        url: input.assetUrl,
        ...(input.storageKey ? { storageKey: input.storageKey } : {}),
        ...(input.mimeType ? { mimeType: input.mimeType } : {}),
        ...(input.bytes === undefined ? {} : { bytes: input.bytes })
      },
      ...(input.width === undefined ? {} : { width: input.width }),
      ...(input.height === undefined ? {} : { height: input.height }),
      ...(input.durationSeconds === undefined ? {} : { durationSeconds: input.durationSeconds }),
      metadata: {
        workflowJobId: job.id,
        providerJobId: input.providerJobId,
        ...(input.providerStatus ? { providerStatus: input.providerStatus } : {})
      }
    });
    await this.repositories.assetRepository.save(outputAsset);

    const completed = await this.workflowJobService.completeJob(job, {
      outputAssetId: outputAsset.id,
      provider: video.renderConfig.provider,
      ...(input.providerStatus ? { providerStatus: input.providerStatus } : {})
    });
    const renderedVideo = await this.videoWorkflowService.markRendered(video.id);

    await this.auditTrailService.recordActivity({
      action: "video.render_completed",
      reference: createReference("workflow_job", completed.job.id),
      message: `Completed render job "${completed.job.id}" for video "${video.id}".`,
      metadata: {
        outputAssetId: outputAsset.id
      }
    });
    await this.auditTrailService.snapshot(
      createReference("asset", outputAsset.id),
      "video.render_completed",
      outputAsset
    );
    await this.auditTrailService.snapshot(
      createReference("workflow_job", completed.job.id),
      "video.render_completed",
      completed.job
    );

    return {
      job: completed.job,
      logs: [completed.log],
      asset: outputAsset,
      video: renderedVideo
    };
  }

  private async applyRenderFailure(
    video: Video,
    job: WorkflowJob,
    input: {
      errorMessage: string;
      providerStatus?: string;
    }
  ): Promise<RenderFailureResult> {
    const jobWithMetadata =
      input.providerStatus && input.providerStatus !== job.resultMetadata?.providerStatus
        ? await this.workflowJobService.setResultMetadata(job, {
            ...(job.resultMetadata ?? {}),
            providerStatus: input.providerStatus
          })
        : job;
    const failed = await this.workflowJobService.failJob(jobWithMetadata, input.errorMessage, {
      ...(input.providerStatus ? { providerStatus: input.providerStatus } : {})
    });
    const failedVideo =
      video.status === "published" ? video : updateVideoStatus(video, "failed");
    await this.repositories.videoRepository.save(failedVideo);

    await this.auditTrailService.recordActivity({
      action: "video.render_failed",
      reference: createReference("workflow_job", failed.job.id),
      message: `Render job "${failed.job.id}" failed for video "${video.id}".`,
      metadata: {
        ...(input.providerStatus ? { providerStatus: input.providerStatus } : {})
      }
    });
    await this.auditTrailService.snapshot(
      createReference("workflow_job", failed.job.id),
      "video.render_failed",
      failed.job
    );
    await this.auditTrailService.snapshot(
      createReference("video", failedVideo.id),
      "video.render_failed",
      failedVideo
    );

    return {
      job: failed.job,
      logs: [failed.log],
      video: failedVideo
    };
  }

  private resolvePipeline(providerId: Video["renderConfig"]["provider"], templateSlug: string) {
    const renderPipeline = this.renderPipelines.find((pipeline) => pipeline.providerId === providerId);

    if (!renderPipeline) {
      throw new InvalidStateError(
        `Render provider "${providerId}" is configured for the video but not wired in this runtime.`,
        {
          provider: providerId
        }
      );
    }

    if (!renderPipeline.supportedTemplateSlugs.includes(templateSlug)) {
      throw new InvalidStateError(
        `Render template "${templateSlug}" is not supported by provider "${providerId}" in this runtime.`,
        {
          provider: providerId,
          templateSlug
        }
      );
    }

    return renderPipeline;
  }

  private getQueuedRenderProvider(job: WorkflowJob, video: Video): Video["renderConfig"]["provider"] {
    return typeof job.payload?.provider === "string"
      ? (job.payload.provider as Video["renderConfig"]["provider"])
      : video.renderConfig.provider;
  }

  private getQueuedTemplateSlug(job: WorkflowJob, video: Video): string {
    return typeof job.payload?.templateSlug === "string"
      ? job.payload.templateSlug
      : video.renderConfig.templateSlug;
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

  private async getRenderJobOrThrow(workflowJobId: string, videoId: string) {
    const job = await this.workflowJobService.getJob(workflowJobId);

    if (!job || job.type !== "render" || job.reference.entityType !== "video" || job.reference.entityId !== videoId) {
      throw new NotFoundError(`Render job "${workflowJobId}" was not found for video "${videoId}".`, {
        entityType: "workflow_job",
        entityId: workflowJobId,
        videoId
      });
    }

    return job;
  }

  private assertRenderCallbackAccess(
    job: WorkflowJob,
    callbackToken: string,
    providerJobId: string
  ): void {
    const expectedCallbackToken = job.payload?.callbackToken;
    const expectedProviderJobId = job.resultMetadata?.providerJobId;

    if (typeof expectedCallbackToken !== "string" || expectedCallbackToken !== callbackToken) {
      throw new ValidationError("Render callback token is invalid.", "render_callback_token_invalid", {
        workflowJobId: job.id
      });
    }

    if (typeof expectedProviderJobId !== "string" || expectedProviderJobId !== providerJobId) {
      throw new ValidationError(
        "Render provider job id does not match the queued render submission.",
        "render_provider_job_mismatch",
        {
          workflowJobId: job.id,
          providerJobId
        }
      );
    }
  }

  private buildCompleteCallbackPayload(input: CompleteRenderInput): MetadataRecord {
    return {
      assetUrl: input.assetUrl,
      ...(input.storageProvider ? { storageProvider: input.storageProvider } : {}),
      ...(input.storageKey ? { storageKey: input.storageKey } : {}),
      ...(input.mimeType ? { mimeType: input.mimeType } : {}),
      ...(input.bytes === undefined ? {} : { bytes: input.bytes }),
      ...(input.width === undefined ? {} : { width: input.width }),
      ...(input.height === undefined ? {} : { height: input.height }),
      ...(input.durationSeconds === undefined ? {} : { durationSeconds: input.durationSeconds }),
      ...(input.providerStatus ? { providerStatus: input.providerStatus } : {})
    };
  }

  private buildFailCallbackPayload(input: FailRenderInput): MetadataRecord {
    return {
      errorMessage: input.errorMessage,
      ...(input.providerStatus ? { providerStatus: input.providerStatus } : {})
    };
  }

  private buildRenderCallbackReceiptKey(
    provider: string,
    action: "complete" | "fail",
    requestIdempotencyKey: string
  ): string {
    return `render:${provider}:${action}:${requestIdempotencyKey}`;
  }

  private async reserveRenderCallback<TResult>(input: {
    action: "complete" | "fail";
    provider: string;
    videoId: string;
    workflowJobId: string;
    requestIdempotencyKey: string;
    requestMetadata: MetadataRecord;
  }): Promise<
    | {
        callbackReceipt: CallbackReceipt;
      }
    | {
        replayedResult: TResult;
      }
  > {
    const callbackReceipt = createCallbackReceipt({
      channel: "render",
      operation: `render_${input.action}`,
      provider: input.provider,
      idempotencyKey: this.buildRenderCallbackReceiptKey(
        input.provider,
        input.action,
        input.requestIdempotencyKey
      ),
      reference: createReference("video", input.videoId),
      workflowJobId: input.workflowJobId,
      requestMetadata: input.requestMetadata
    });
    const reservation = await this.repositories.callbackReceiptRepository.reserve(callbackReceipt);

    if (reservation.created) {
      return {
        callbackReceipt: reservation.callbackReceipt
      };
    }

    this.assertCallbackReceiptOwnership(
      reservation.callbackReceipt,
      input.provider,
      `render_${input.action}`,
      input.videoId,
      input.workflowJobId
    );

    return {
      replayedResult: this.replayReservedCallback<TResult>(reservation.callbackReceipt)
    };
  }

  private assertCallbackReceiptOwnership(
    callbackReceipt: CallbackReceipt,
    provider: string,
    operation: string,
    videoId: string,
    workflowJobId: string
  ): void {
    if (
      callbackReceipt.channel !== "render" ||
      callbackReceipt.provider !== provider ||
      callbackReceipt.operation !== operation ||
      callbackReceipt.reference.entityType !== "video" ||
      callbackReceipt.reference.entityId !== videoId ||
      callbackReceipt.workflowJobId !== workflowJobId
    ) {
      throw new ValidationError(
        "Render callback idempotency key is already bound to a different callback context.",
        "render_callback_idempotency_conflict",
        {
          provider,
          operation,
          videoId,
          workflowJobId
        }
      );
    }
  }

  private async completeReservedCallback<T>(callbackReceipt: CallbackReceipt, result: T): Promise<void> {
    await this.repositories.callbackReceiptRepository.save(
      completeCallbackReceipt(
        callbackReceipt,
        JSON.stringify({
          kind: "success",
          result
        } satisfies RenderCallbackStoredOutcome<T>)
      )
    );
  }

  private async rejectReservedCallback(callbackReceipt: CallbackReceipt, error: unknown): Promise<void> {
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
        } satisfies RenderCallbackStoredOutcome<never>)
      )
    );
  }

  private replayReservedCallback<T>(callbackReceipt: CallbackReceipt): T {
    if (callbackReceipt.status === "processing") {
      throw new ConflictError("Render callback is already being processed for this idempotency key.", {
        callbackReceiptId: callbackReceipt.id
      });
    }

    if (!callbackReceipt.responsePayload) {
      throw new InvalidStateError(
        `Callback receipt "${callbackReceipt.id}" has no stored response payload to replay.`,
        {
          callbackReceiptId: callbackReceipt.id
        }
      );
    }

    const outcome = JSON.parse(callbackReceipt.responsePayload) as RenderCallbackStoredOutcome<T>;

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

  private async getCompletedRenderAssetOrThrow(videoId: string, job: WorkflowJob) {
    const outputAssetId = job.resultMetadata?.outputAssetId;

    if (typeof outputAssetId === "string") {
      const asset = await this.repositories.assetRepository.findById(outputAssetId);

      if (asset) {
        return asset;
      }
    }

    const assets = await this.repositories.assetRepository.listByVideoId(videoId);
    const asset = assets.find(
      (item) =>
        item.role === "render_output" &&
        item.type === "video" &&
        item.metadata?.workflowJobId === job.id
    );

    if (!asset) {
      throw new InvalidStateError(`Render job "${job.id}" is completed but has no output asset recorded.`, {
        workflowJobId: job.id,
        videoId
      });
    }

    return asset;
  }

  private async refreshOwnedReconciliationJob(job: WorkflowJob) {
    if (!job.lease) {
      return undefined;
    }

    const latestJob = await this.workflowJobService.getJob(job.id);

    if (
      !latestJob?.lease ||
      latestJob.lease.token !== job.lease.token ||
      latestJob.lease.ownerId !== job.lease.ownerId ||
      (latestJob.status !== "processing" && latestJob.status !== "retrying")
    ) {
      return undefined;
    }

    return latestJob;
  }
}
