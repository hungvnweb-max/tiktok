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
  createTopic,
  createVideoConcept,
  updateVideoStatus,
  type PublicationSchedule,
  type PublishMode,
  type Video
} from "@videotik/core";
import { createInMemorySprint1Repositories } from "@videotik/database";
import {
  TemplateImagePromptGenerationAdapter,
  TemplateSubtitleCompositionAdapter
} from "../apps/api/src/adapters/template-media-planning-adapter";
import { TemplateRenderPipelineAdapter } from "../apps/api/src/adapters/template-render-pipeline-adapter";
import { TemplateSceneVoiceGenerationAdapter } from "../apps/api/src/adapters/template-scene-voice-generation-adapter";
import { TemplateTextGenerationAdapter } from "../apps/api/src/adapters/template-text-generation-adapter";
import { TikTokPublishingProvider } from "../apps/api/src/adapters/tiktok-publishing-provider";
import { createSprint5Services } from "../packages/core/src/application/services";

const run = async (): Promise<void> => {
  const repositories = createInMemorySprint1Repositories();
  const services = createSprint5Services({
    repositories,
    textGenerationPort: new TemplateTextGenerationAdapter(),
    imagePromptGenerationPort: new TemplateImagePromptGenerationAdapter(),
    sceneVoiceGenerationPort: new TemplateSceneVoiceGenerationAdapter(),
    subtitleCompositionPort: new TemplateSubtitleCompositionAdapter(),
    renderPipelines: [new TemplateRenderPipelineAdapter()],
    publishingProviders: [new TikTokPublishingProvider()]
  });

  const contentFormat = await repositories.contentFormatRepository.findBySlug("quick_tip");
  assert.ok(contentFormat, "Expected quick_tip content format to exist.");

  const suffix = createEntityId("mode_smoke");
  const topic = createTopic({
    name: "Publish Mode Matrix Smoke",
    slug: `publish_mode_matrix_${suffix}`,
    description: "Smoke matrix for manual, semi_auto and full_auto publish modes.",
    audience: "operators"
  });
  await repositories.topicRepository.save(topic);

  const idea = createContentIdea({
    topicId: topic.id,
    contentFormatId: contentFormat.id,
    title: "Mode matrix idea",
    hook: "Mode matrix hook",
    angle: "Mode matrix angle",
    brief: "Mode matrix brief",
    callToAction: "Follow for more",
    targetAudience: "operators",
    keywords: ["mode", "smoke"],
    formatRationale: "coverage",
    generationProvider: "template"
  });
  await repositories.ideaRepository.save(idea);

  const script = createContentScript({
    topicId: topic.id,
    ideaId: idea.id,
    contentFormatId: contentFormat.id,
    title: "Mode matrix script",
    summary: "Publish mode smoke summary",
    voiceover: "Publish mode smoke voiceover",
    generationProvider: "template",
    scenes: [
      {
        order: 1,
        role: "hook",
        narration: "Stop wasting time on repetitive tasks in your workflow.",
        visualDirection: "Visual 1",
        onScreenText: "Hook",
        estimatedDurationSeconds: 5
      },
      {
        order: 2,
        role: "body",
        narration: "Build one reusable publish flow for each operating mode.",
        visualDirection: "Visual 2",
        onScreenText: "Body 1",
        estimatedDurationSeconds: 5
      },
      {
        order: 3,
        role: "body",
        narration: "Track attempts, costs, and failures so recovery stays reliable.",
        visualDirection: "Visual 3",
        onScreenText: "Body 2",
        estimatedDurationSeconds: 5
      },
      {
        order: 4,
        role: "cta",
        narration: "Follow this checklist to ship automation safely every week.",
        visualDirection: "Visual 4",
        onScreenText: "CTA",
        estimatedDurationSeconds: 5
      }
    ]
  });
  await repositories.scriptRepository.save(script);

  const createRenderedVideoContext = async (
    mode: PublishMode
  ): Promise<{ video: Video; schedule: PublicationSchedule }> => {
    let video = createVideoConcept({
      topicId: topic.id,
      ideaId: idea.id,
      scriptId: script.id,
      contentFormatId: contentFormat.id,
      formatSlug: contentFormat.slug,
      title: `${script.title}-${mode}`,
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
        url: `https://example.com/rendered-${mode}-${video.id}.mp4`
      },
      durationSeconds: 20
    });
    await repositories.assetRepository.save(renderedAsset);

    const schedule = createPublicationSchedule({
      videoId: video.id,
      platformSlug: "tiktok",
      provider: "tiktok",
      mode,
      timezone: "Europe/Berlin",
      scheduledFor: new Date(Date.now() - 5 * 60_000),
      caption: `Mode ${mode} caption`,
      hashtags: ["#mode_smoke"]
    });
    await repositories.publicationScheduleRepository.save(schedule);

    return { video, schedule };
  };

  const modes: PublishMode[] = ["manual", "semi_auto", "full_auto"];
  const modeResults: Array<{
    mode: PublishMode;
    attemptStatus: string;
    videoStatus: string;
    scheduleStatus: string;
  }> = [];

  for (const mode of modes) {
    const context = await createRenderedVideoContext(mode);
    const readiness = await services.publishingWorkflowService.validatePublishReadiness({
      videoId: context.video.id
    });
    assert.equal(
      readiness.report.isValid,
      true,
      `Expected publish readiness to pass for mode "${mode}". Issues: ${JSON.stringify(
        readiness.report.issues
      )}`
    );

    const publishResult = await services.publishingWorkflowService.publishVideo({
      videoId: context.video.id
    });

    const attemptAfterPublish = await repositories.publishAttemptRepository.findById(
      publishResult.attempt.id
    );
    assert.ok(attemptAfterPublish, `Expected publish attempt for mode "${mode}".`);

    if (mode === "manual") {
      assert.equal(attemptAfterPublish.status, "manual_action_required");
    } else if (mode === "semi_auto") {
      assert.equal(attemptAfterPublish.status, "submitted");
      const reconcileResult =
        await services.publishingWorkflowService.reconcileSubmittedPublishAttempts({
          ownerId: "publish-mode-smoke-worker",
          leaseMs: 60_000,
          staleAfterMs: 300_000,
          limit: 50,
          now: new Date(Date.now() + 120_000)
        });
      const attemptAfterReconcile = await repositories.publishAttemptRepository.findById(
        publishResult.attempt.id
      );
      assert.ok(attemptAfterReconcile);
      assert.equal(attemptAfterReconcile.status, "manual_action_required");
      assert.equal(
        reconcileResult.items.some(
          (item) =>
            item.publishAttemptId === publishResult.attempt.id &&
            item.outcome === "manual_action_required"
        ),
        true
      );
    } else {
      assert.equal(attemptAfterPublish.status, "published");
    }

    const finalAttempt = await repositories.publishAttemptRepository.findById(
      publishResult.attempt.id
    );
    assert.ok(finalAttempt);
    const finalVideo = await repositories.videoRepository.findById(context.video.id);
    const finalSchedule = await repositories.publicationScheduleRepository.findById(
      context.schedule.id
    );
    assert.ok(finalVideo);
    assert.ok(finalSchedule);

    if (mode === "full_auto") {
      assert.equal(finalVideo.status, "published");
      assert.equal(finalSchedule.status, "published");
    } else {
      assert.ok(finalVideo.status === "rendered" || finalVideo.status === "scheduled");
      assert.ok(finalSchedule.status === "scheduled" || finalSchedule.status === "published");
    }

    modeResults.push({
      mode,
      attemptStatus: finalAttempt.status,
      videoStatus: finalVideo.status,
      scheduleStatus: finalSchedule.status
    });
  }

  const activityLogs = await services.auditTrailService.listActivity();
  const costRecords = await services.auditTrailService.listCosts();
  assert.ok(activityLogs.length > 0, "Expected publish mode smoke to emit activity logs.");
  assert.ok(costRecords.length > 0, "Expected publish mode smoke to emit cost records.");

  console.log(
    JSON.stringify(
      {
        ok: true,
        modeResults,
        activityLogCount: activityLogs.length,
        costRecordCount: costRecords.length
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
