import assert from "node:assert/strict";
import {
  createAsset,
  createContentIdea,
  createContentScript,
  createDefaultImageWorkflowConfig,
  createDefaultRenderConfig,
  createDefaultSubtitleConfig,
  createDefaultVoiceoverConfig,
  createEntityId,
  createPublicationSchedule,
  createPublishAttempt,
  createReference,
  createTopic,
  createVideoConcept,
  createWorkflowJob,
  markPublishAttemptSubmitted,
  startPublishAttempt,
  startWorkflowJob,
  updateVideoStatus,
  type PublicationSchedule,
  type PublishAttempt,
  type PublishProviderCallbackVerificationRequest,
  type PublishProviderCallbackVerificationResult,
  type PublishProviderReconcileRequest,
  type PublishProviderReconcileResult,
  type PublishProviderRequest,
  type PublishProviderResult,
  type PublishProviderValidationResult,
  type PublishingProviderPort,
  type Video
} from "@videotik/core";
import { createInMemorySprint1Repositories } from "@videotik/database";
import { TemplateImagePromptGenerationAdapter, TemplateSubtitleCompositionAdapter } from "../apps/api/src/adapters/template-media-planning-adapter";
import { TemplateRenderPipelineAdapter } from "../apps/api/src/adapters/template-render-pipeline-adapter";
import { TemplateSceneVoiceGenerationAdapter } from "../apps/api/src/adapters/template-scene-voice-generation-adapter";
import { TemplateTextGenerationAdapter } from "../apps/api/src/adapters/template-text-generation-adapter";
import {
  TikTokPublishingProvider,
  createTikTokPublishCallbackSignature
} from "../apps/api/src/adapters/tiktok-publishing-provider";
import { createSprint5Services } from "../packages/core/src/application/services";

const callbackSecret = "smoke-publish-callback-secret";

process.env.TIKTOK_PUBLISH_CALLBACK_SECRET = callbackSecret;
process.env.PUBLISH_CALLBACK_TOLERANCE_SECONDS = "300";

class SmokeTikTokPublishingProvider implements PublishingProviderPort {
  readonly providerId = "tiktok" as const;
  readonly supportedPlatforms = ["tiktok"] as const;
  readonly supportedModes = ["manual", "semi_auto", "full_auto"] as const;

  private readonly delegate = new TikTokPublishingProvider();

  async validate(
    request: PublishProviderRequest
  ): Promise<PublishProviderValidationResult> {
    return this.delegate.validate(request);
  }

  async publish(request: PublishProviderRequest): Promise<PublishProviderResult> {
    return this.delegate.publish(request);
  }

  async verifyCallback(
    request: PublishProviderCallbackVerificationRequest
  ): Promise<PublishProviderCallbackVerificationResult> {
    if (!this.delegate.verifyCallback) {
      throw new Error("TikTok smoke delegate does not implement callback verification.");
    }

    return this.delegate.verifyCallback(request);
  }

  async reconcileSubmission(
    request: PublishProviderReconcileRequest
  ): Promise<PublishProviderReconcileResult> {
    const publicationId = request.attempt.providerPublicationId ?? "";

    if (publicationId.startsWith("force_failed_provider_")) {
      return {
        state: "failed",
        providerStatus: "provider_rejected",
        ...(request.attempt.providerPublicationId
          ? { publicationId: request.attempt.providerPublicationId }
          : {}),
        failureMessage: "Simulated provider-side submission rejection for smoke coverage.",
        metadata: {
          smokeScenario: "failed_provider"
        },
        cost: {
          amount: 0,
          currency: "USD",
          units: "smoke_publish_reconcile_failed_provider",
          quantity: 1
        }
      };
    }

    if (publicationId.startsWith("force_submitted_timeout_")) {
      return {
        state: "submitted",
        providerStatus: "still_processing",
        ...(request.attempt.providerPublicationId
          ? { publicationId: request.attempt.providerPublicationId }
          : {}),
        metadata: {
          smokeScenario: "failed_timeout"
        },
        cost: {
          amount: 0,
          currency: "USD",
          units: "smoke_publish_reconcile_submitted",
          quantity: 1
        }
      };
    }

    if (!this.delegate.reconcileSubmission) {
      return {
        state: "submitted",
        providerStatus: request.attempt.providerStatus ?? "submitted"
      };
    }

    return this.delegate.reconcileSubmission(request);
  }
}

interface SmokeVideoContext {
  video: Video;
  schedule: PublicationSchedule;
}

const run = async (): Promise<void> => {
  const repositories = createInMemorySprint1Repositories();
  const services = createSprint5Services({
    repositories,
    textGenerationPort: new TemplateTextGenerationAdapter(),
    imagePromptGenerationPort: new TemplateImagePromptGenerationAdapter(),
    sceneVoiceGenerationPort: new TemplateSceneVoiceGenerationAdapter(),
    subtitleCompositionPort: new TemplateSubtitleCompositionAdapter(),
    renderPipelines: [new TemplateRenderPipelineAdapter()],
    publishingProviders: [new SmokeTikTokPublishingProvider()]
  });

  const contentFormat = await repositories.contentFormatRepository.findBySlug("quick_tip");
  assert.ok(contentFormat, "Expected quick_tip content format to be seeded in memory.");

  const suffix = createEntityId("smoke");
  const topic = createTopic({
    name: "Publish Smoke",
    slug: `publish_smoke_topic_${suffix}`,
    description: "Smoke scenario topic",
    audience: "builders"
  });
  await repositories.topicRepository.save(topic);

  const idea = createContentIdea({
    topicId: topic.id,
    contentFormatId: contentFormat.id,
    title: "Smoke idea",
    hook: "Hook",
    angle: "Angle",
    brief: "Brief",
    callToAction: "Follow for more",
    targetAudience: "builders",
    keywords: ["smoke"],
    formatRationale: "test",
    generationProvider: "template"
  });
  await repositories.ideaRepository.save(idea);

  const script = createContentScript({
    topicId: topic.id,
    ideaId: idea.id,
    contentFormatId: contentFormat.id,
    title: "Smoke script",
    summary: "summary",
    voiceover: "voiceover",
    generationProvider: "template",
    scenes: [
      {
        order: 1,
        role: "hook",
        narration: "Hook scene",
        visualDirection: "Visual 1",
        onScreenText: "Hook",
        estimatedDurationSeconds: 5
      },
      {
        order: 2,
        role: "body",
        narration: "Body scene 1",
        visualDirection: "Visual 2",
        onScreenText: "Body",
        estimatedDurationSeconds: 5
      },
      {
        order: 3,
        role: "body",
        narration: "Body scene 2",
        visualDirection: "Visual 3",
        onScreenText: "Body",
        estimatedDurationSeconds: 5
      },
      {
        order: 4,
        role: "cta",
        narration: "CTA scene",
        visualDirection: "Visual 4",
        onScreenText: "CTA",
        estimatedDurationSeconds: 5
      }
    ]
  });
  await repositories.scriptRepository.save(script);

  let videoCounter = 0;

  const createRenderedVideoContext = async (
    label: string
  ): Promise<SmokeVideoContext> => {
    videoCounter += 1;

    let video = createVideoConcept({
      topicId: topic.id,
      ideaId: idea.id,
      scriptId: script.id,
      contentFormatId: contentFormat.id,
      formatSlug: contentFormat.slug,
      title: `${script.title}-${label}`,
      scenes: script.scenes,
      estimatedDurationSeconds: script.estimatedDurationSeconds,
      subtitleConfig: createDefaultSubtitleConfig(contentFormat),
      imageWorkflowConfig: createDefaultImageWorkflowConfig(contentFormat),
      voiceoverConfig: createDefaultVoiceoverConfig(contentFormat),
      renderConfig: createDefaultRenderConfig(contentFormat),
      publishingConfig: null
    });
    video = updateVideoStatus(video, "rendered");
    await repositories.videoRepository.save(video);

    const renderedAsset = createAsset({
      videoId: video.id,
      type: "video",
      role: "render_output",
      provider: "template",
      sourceType: "provider_generated",
      versionNumber: 1,
      isActive: true,
      storage: {
        storageProvider: "external_url",
        url: `https://example.com/rendered-${videoCounter}.mp4`
      },
      durationSeconds: 20
    });
    await repositories.assetRepository.save(renderedAsset);

    const schedule = createPublicationSchedule({
      videoId: video.id,
      platformSlug: "tiktok",
      provider: "tiktok",
      mode: "semi_auto",
      timezone: "Europe/Berlin",
      scheduledFor: new Date(Date.now() + videoCounter * 60_000),
      caption: `Smoke caption ${videoCounter}`,
      hashtags: [`#smoke${videoCounter}`]
    });
    await repositories.publicationScheduleRepository.save(schedule);

    return { video, schedule };
  };

  const createSubmittedAttempt = async (input: {
    video: Video;
    schedule: PublicationSchedule;
    sequenceNumber: number;
    publicationIdPrefix: string;
    providerStatus?: string;
  }): Promise<{
    attempt: PublishAttempt;
    callbackToken: string;
  }> => {
    let attempt = createPublishAttempt({
      videoId: input.video.id,
      publicationScheduleId: input.schedule.id,
      provider: "tiktok",
      platformSlug: "tiktok",
      mode: "semi_auto",
      sequenceNumber: input.sequenceNumber,
      maxWorkflowAttempts: 3
    });

    const callbackToken = createEntityId("publishcb");
    let workflowJob = createWorkflowJob({
      type: "publish",
      reference: createReference("publish_attempt", attempt.id),
      payload: {
        videoId: input.video.id,
        scheduleId: input.schedule.id,
        provider: "tiktok",
        mode: "semi_auto",
        callbackToken
      }
    });
    workflowJob = startWorkflowJob(workflowJob);
    await repositories.workflowJobRepository.save(workflowJob);

    attempt = startPublishAttempt(attempt, {
      workflowJobId: workflowJob.id,
      workflowAttemptCount: workflowJob.attemptCount
    });
    attempt = markPublishAttemptSubmitted(attempt, {
      providerStatus: input.providerStatus ?? "draft_prepared",
      publicationId: `${input.publicationIdPrefix}_${input.sequenceNumber}`
    });
    await repositories.publishAttemptRepository.save(attempt);

    return {
      attempt,
      callbackToken
    };
  };

  const buildSignedCallback = (input: {
    attempt: PublishAttempt;
    callbackToken: string;
    idempotencyKey: string;
    status: "published" | "submitted" | "manual_action_required" | "failed";
    providerStatus: string;
    publicationId?: string;
    publishedAt?: Date;
    failureMessage?: string;
  }) => {
    const payload: Record<string, string | number | boolean | null> = {
      status: input.status,
      providerStatus: input.providerStatus,
      ...(input.publicationId ? { publicationId: input.publicationId } : {}),
      ...(input.publishedAt ? { publishedAt: input.publishedAt.toISOString() } : {}),
      ...(input.failureMessage ? { failureMessage: input.failureMessage } : {})
    };
    const signatureTimestamp = new Date().toISOString();
    const signature = createTikTokPublishCallbackSignature(
      {
        attempt: input.attempt,
        callbackToken: input.callbackToken,
        idempotencyKey: input.idempotencyKey,
        signatureTimestamp,
        payload
      },
      callbackSecret
    );

    return {
      signature,
      signatureTimestamp
    };
  };

  const primaryContext = await createRenderedVideoContext("callback");
  const primaryAttempt = await createSubmittedAttempt({
    video: primaryContext.video,
    schedule: primaryContext.schedule,
    sequenceNumber: 1,
    publicationIdPrefix: "draft"
  });

  const firstPublishedAt = new Date(Date.now() + 5 * 60_000);
  const firstCallback = buildSignedCallback({
    attempt: primaryAttempt.attempt,
    callbackToken: primaryAttempt.callbackToken,
    idempotencyKey: "publish-callback-idem-1",
    status: "published",
    providerStatus: "published_simulated",
    publicationId: "published_1",
    publishedAt: firstPublishedAt
  });
  const firstResult = await services.publishingWorkflowService.handlePublishStatusCallback({
    videoId: primaryContext.video.id,
    publishAttemptId: primaryAttempt.attempt.id,
    callbackToken: primaryAttempt.callbackToken,
    idempotencyKey: "publish-callback-idem-1",
    signature: firstCallback.signature,
    signatureTimestamp: firstCallback.signatureTimestamp,
    status: "published",
    providerStatus: "published_simulated",
    publicationId: "published_1",
    publishedAt: firstPublishedAt
  });

  assert.equal(firstResult.attempt.status, "published");
  assert.equal(firstResult.video.status, "published");
  assert.equal(firstResult.schedule.status, "published");

  const firstResultReplay = await services.publishingWorkflowService.handlePublishStatusCallback({
    videoId: primaryContext.video.id,
    publishAttemptId: primaryAttempt.attempt.id,
    callbackToken: primaryAttempt.callbackToken,
    idempotencyKey: "publish-callback-idem-1",
    signature: firstCallback.signature,
    signatureTimestamp: firstCallback.signatureTimestamp,
    status: "published",
    providerStatus: "published_simulated",
    publicationId: "published_1",
    publishedAt: firstPublishedAt
  });

  assert.equal(firstResultReplay.attempt.id, firstResult.attempt.id);
  assert.equal(firstResultReplay.attempt.status, "published");

  const callbackReceipt = await repositories.callbackReceiptRepository.findByIdempotencyKey(
    "publish:tiktok:status_update:publish-callback-idem-1"
  );
  assert.ok(callbackReceipt);
  assert.equal(callbackReceipt.status, "completed");

  const raceContext = await createRenderedVideoContext("race");
  const raceAttempt = await createSubmittedAttempt({
    video: raceContext.video,
    schedule: raceContext.schedule,
    sequenceNumber: 1,
    publicationIdPrefix: "race"
  });
  const pendingAttempt = await createSubmittedAttempt({
    video: raceContext.video,
    schedule: raceContext.schedule,
    sequenceNumber: 2,
    publicationIdPrefix: "race_pending"
  });

  const racePublishedAt = new Date(Date.now() + 6 * 60_000);
  const raceCallback = buildSignedCallback({
    attempt: raceAttempt.attempt,
    callbackToken: raceAttempt.callbackToken,
    idempotencyKey: "publish-callback-idem-race",
    status: "published",
    providerStatus: "published_simulated",
    publicationId: "published_race",
    publishedAt: racePublishedAt
  });
  await services.publishingWorkflowService.handlePublishStatusCallback({
    videoId: raceContext.video.id,
    publishAttemptId: raceAttempt.attempt.id,
    callbackToken: raceAttempt.callbackToken,
    idempotencyKey: "publish-callback-idem-race",
    signature: raceCallback.signature,
    signatureTimestamp: raceCallback.signatureTimestamp,
    status: "published",
    providerStatus: "published_simulated",
    publicationId: "published_race",
    publishedAt: racePublishedAt
  });

  const raceReconcileResult =
    await services.publishingWorkflowService.reconcileSubmittedPublishAttempts({
      ownerId: "publish-smoke-worker-race",
      leaseMs: 60_000,
      staleAfterMs: 60_000,
      limit: 50,
      now: new Date(Date.now() + 120_000)
    });
  const raceAttemptAfter = await repositories.publishAttemptRepository.findById(raceAttempt.attempt.id);
  const pendingAttemptAfter = await repositories.publishAttemptRepository.findById(
    pendingAttempt.attempt.id
  );
  assert.ok(raceAttemptAfter);
  assert.ok(pendingAttemptAfter);
  assert.equal(raceAttemptAfter.status, "published");
  assert.equal(pendingAttemptAfter.status, "manual_action_required");
  assert.equal(
    raceReconcileResult.items.some((item) => item.publishAttemptId === raceAttempt.attempt.id),
    false
  );
  assert.equal(
    raceReconcileResult.items.some(
      (item) => item.publishAttemptId === pendingAttempt.attempt.id && item.outcome === "manual_action_required"
    ),
    true
  );

  const failedProviderContext = await createRenderedVideoContext("failed-provider");
  const failedProviderAttempt = await createSubmittedAttempt({
    video: failedProviderContext.video,
    schedule: failedProviderContext.schedule,
    sequenceNumber: 1,
    publicationIdPrefix: "force_failed_provider"
  });
  const failedProviderReconcile =
    await services.publishingWorkflowService.reconcileSubmittedPublishAttempts({
      ownerId: "publish-smoke-worker-failed-provider",
      leaseMs: 60_000,
      staleAfterMs: 300_000,
      limit: 50,
      now: new Date(Date.now() + 30_000)
    });
  const failedProviderAttemptAfter = await repositories.publishAttemptRepository.findById(
    failedProviderAttempt.attempt.id
  );
  assert.ok(failedProviderAttemptAfter);
  assert.equal(failedProviderAttemptAfter.status, "failed");
  assert.equal(failedProviderAttemptAfter.failureStage, "provider_execution");
  assert.equal(
    failedProviderReconcile.items.some(
      (item) =>
        item.publishAttemptId === failedProviderAttempt.attempt.id &&
        item.outcome === "failed_provider"
    ),
    true
  );

  const failedTimeoutContext = await createRenderedVideoContext("failed-timeout");
  const failedTimeoutAttempt = await createSubmittedAttempt({
    video: failedTimeoutContext.video,
    schedule: failedTimeoutContext.schedule,
    sequenceNumber: 1,
    publicationIdPrefix: "force_submitted_timeout"
  });
  const timeoutBase = failedTimeoutAttempt.attempt.startedAt ?? new Date();
  const failedTimeoutReconcile =
    await services.publishingWorkflowService.reconcileSubmittedPublishAttempts({
      ownerId: "publish-smoke-worker-failed-timeout",
      leaseMs: 60_000,
      staleAfterMs: 60_000,
      limit: 50,
      now: new Date(timeoutBase.getTime() + 120_000)
    });
  const failedTimeoutAttemptAfter = await repositories.publishAttemptRepository.findById(
    failedTimeoutAttempt.attempt.id
  );
  assert.ok(failedTimeoutAttemptAfter);
  assert.equal(failedTimeoutAttemptAfter.status, "failed");
  assert.equal(failedTimeoutAttemptAfter.failureStage, "workflow");
  assert.equal(
    failedTimeoutReconcile.items.some(
      (item) =>
        item.publishAttemptId === failedTimeoutAttempt.attempt.id &&
        item.outcome === "failed_timeout"
    ),
    true
  );

  const leaseContext = await createRenderedVideoContext("lease-contention");
  const leaseAttempt = await createSubmittedAttempt({
    video: leaseContext.video,
    schedule: leaseContext.schedule,
    sequenceNumber: 1,
    publicationIdPrefix: "lease_guarded"
  });
  assert.ok(leaseAttempt.attempt.workflowJobId);
  const leaseJob = await repositories.workflowJobRepository.findById(
    leaseAttempt.attempt.workflowJobId
  );
  assert.ok(leaseJob);

  const leaseNow = new Date();
  await repositories.workflowJobRepository.save({
    ...leaseJob,
    lease: {
      ownerId: "publish-smoke-worker-primary",
      token: "publish-smoke-lease-busy",
      expiresAt: new Date(leaseNow.getTime() + 120_000)
    },
    updatedAt: leaseNow
  });

  const leaseBlockedReconcile =
    await services.publishingWorkflowService.reconcileSubmittedPublishAttempts({
      ownerId: "publish-smoke-worker-secondary",
      leaseMs: 60_000,
      staleAfterMs: 300_000,
      limit: 50,
      now: new Date(leaseNow.getTime() + 30_000)
    });
  const leaseBlockedAttemptAfter = await repositories.publishAttemptRepository.findById(
    leaseAttempt.attempt.id
  );
  assert.ok(leaseBlockedAttemptAfter);
  assert.equal(leaseBlockedAttemptAfter.status, "submitted");
  assert.equal(
    leaseBlockedReconcile.items.some(
      (item) => item.publishAttemptId === leaseAttempt.attempt.id
    ),
    false
  );

  const leaseExpiredJob = await repositories.workflowJobRepository.findById(
    leaseAttempt.attempt.workflowJobId
  );
  assert.ok(leaseExpiredJob);
  await repositories.workflowJobRepository.save({
    ...leaseExpiredJob,
    lease: {
      ownerId: "publish-smoke-worker-primary",
      token: "publish-smoke-lease-expired",
      expiresAt: new Date(Date.now() - 1_000)
    },
    updatedAt: new Date(leaseNow.getTime() + 31_000)
  });

  const leaseRecoveredReconcile =
    await services.publishingWorkflowService.reconcileSubmittedPublishAttempts({
      ownerId: "publish-smoke-worker-secondary",
      leaseMs: 60_000,
      staleAfterMs: 300_000,
      limit: 50,
      now: new Date(leaseNow.getTime() + 40_000)
    });
  const leaseRecoveredAttemptAfter = await repositories.publishAttemptRepository.findById(
    leaseAttempt.attempt.id
  );
  assert.ok(leaseRecoveredAttemptAfter);
  assert.equal(leaseRecoveredAttemptAfter.status, "manual_action_required");
  assert.equal(
    leaseRecoveredReconcile.items.some(
      (item) =>
        item.publishAttemptId === leaseAttempt.attempt.id &&
        item.outcome === "manual_action_required"
    ),
    true
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        callbackIdempotency: firstResultReplay.attempt.status,
        raceAttemptStatus: raceAttemptAfter.status,
        pendingAttemptStatus: pendingAttemptAfter.status,
        failedProviderStatus: failedProviderAttemptAfter.status,
        failedTimeoutStatus: failedTimeoutAttemptAfter.status,
        leaseBlockedStatus: leaseBlockedAttemptAfter.status,
        leaseRecoveredStatus: leaseRecoveredAttemptAfter.status,
        reconcileSummary: {
          raceScannedCount: raceReconcileResult.scannedCount,
          failedProviderScannedCount: failedProviderReconcile.scannedCount,
          failedTimeoutScannedCount: failedTimeoutReconcile.scannedCount,
          leaseBlockedScannedCount: leaseBlockedReconcile.scannedCount,
          leaseRecoveredScannedCount: leaseRecoveredReconcile.scannedCount
        }
      },
      null,
      2
    )
  );
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
