import { type AuditTrailService, type WorkflowJobService, createReference } from "./operational-services";
import {
  activateAsset,
  createAsset,
  deactivateAsset,
  type Asset,
  type AssetStorageProvider
} from "../domain/asset/asset";
import {
  DomainError,
  InvalidStateError,
  NotFoundError,
  ValidationError,
  type MetadataRecord
} from "../domain/common/entity";
import { normalizeVoiceoverConfig } from "../domain/common/media";
import type { PublishMode } from "../domain/common/media";
import type { ImageGenerationProvider, PublishingProvider, VoiceoverProvider } from "../domain/common/providers";
import type { ContentFormat } from "../domain/content-format/content-format";
import { createImagePromptPack, type ImagePromptPack, type SceneImagePrompt } from "../domain/image/image-prompt-pack";
import type { ContentIdea } from "../domain/idea/idea";
import { createPublicationSchedule, type PublicationSchedule } from "../domain/schedule/publication-schedule";
import type { ContentScript } from "../domain/script/script";
import { createSubtitlePack, type OverlayCue, type SubtitleCue, type SubtitlePack } from "../domain/subtitle/subtitle-pack";
import type { Topic } from "../domain/topic/topic";
import type { SceneDirection } from "../domain/video/scene";
import type { PublishAttempt } from "../domain/publish/publish-attempt";
import {
  resolveVideoSceneSubtitleConfig,
  updateVideoPublishingConfig,
  updateVideoStatus,
  updateVideoVoiceoverConfig,
  type Video
} from "../domain/video/video";
import {
  completeVoiceJob,
  createVoiceJob,
  failVoiceJob,
  startVoiceJob,
  type VoiceJob
} from "../domain/voice/voice-job";
import type { WorkflowJob } from "../domain/job/workflow-job";
import type { ImagePromptGenerationPort } from "../ports/image-prompt-generation-port";
import type { PlatformRepositories } from "../ports/repositories";
import type { SceneVoiceGenerationPort } from "../ports/scene-voice-generation-port";
import type { SubtitleCompositionPort } from "../ports/subtitle-composition-port";

export interface GenerateImagePromptPackInput {
  videoId: string;
}

export interface GenerateSubtitlePackInput {
  videoId: string;
}

export interface RegisterManualSceneImageInput {
  videoId: string;
  sceneId: string;
  assetUrl: string;
  provider?: ImageGenerationProvider;
  storageProvider?: AssetStorageProvider;
  storageKey?: string;
  mimeType?: string;
  bytes?: number;
  width?: number;
  height?: number;
  metadata?: MetadataRecord;
}

export interface SelectActiveSceneImageInput {
  videoId: string;
  sceneId: string;
  assetId: string;
}

export interface GenerateSceneVoicesInput {
  videoId: string;
  provider?: Exclude<VoiceoverProvider, "none">;
  voiceId?: string;
  styleNotes?: string[];
}

export interface ScheduleVideoInput {
  videoId: string;
  platformSlug: string;
  provider?: PublishingProvider;
  mode?: PublishMode;
  timezone: string;
  scheduledFor: Date;
  caption: string;
  hashtags: string[];
}

export interface VideoSceneDetail {
  scene: SceneDirection;
  imagePrompt?: SceneImagePrompt;
  imageAssets: Asset[];
  activeImageAsset?: Asset;
  audioAssets: Asset[];
  activeAudioAsset?: Asset;
  voiceJobs: VoiceJob[];
  subtitleCue?: SubtitleCue;
  overlayCue?: OverlayCue;
}

export interface VideoDetail {
  topic: Topic;
  idea: ContentIdea;
  script: ContentScript;
  contentFormat: ContentFormat;
  video: Video;
  imagePromptPack?: ImagePromptPack;
  subtitlePack?: SubtitlePack;
  schedule?: PublicationSchedule;
  publishAttempts: PublishAttempt[];
  renderJobs: WorkflowJob[];
  renderAssets: Asset[];
  activeRenderAsset?: Asset;
  scenes: VideoSceneDetail[];
}

const terminalOrFutureVideoStatuses = new Set<Video["status"]>([
  "failed",
  "voice_ready",
  "render_ready",
  "rendered",
  "scheduled",
  "published"
] as const);

const getTopicOrThrow = async (
  repositories: PlatformRepositories,
  topicId: string
) => {
  const topic = await repositories.topicRepository.findById(topicId);

  if (!topic) {
    throw new NotFoundError(`Topic "${topicId}" was not found.`, {
      entityType: "topic",
      entityId: topicId
    });
  }

  return topic;
};

const getIdeaOrThrow = async (
  repositories: PlatformRepositories,
  ideaId: string
) => {
  const idea = await repositories.ideaRepository.findById(ideaId);

  if (!idea) {
    throw new NotFoundError(`Idea "${ideaId}" was not found.`, {
      entityType: "idea",
      entityId: ideaId
    });
  }

  return idea;
};

const getScriptOrThrow = async (
  repositories: PlatformRepositories,
  scriptId: string
) => {
  const script = await repositories.scriptRepository.findById(scriptId);

  if (!script) {
    throw new NotFoundError(`Script "${scriptId}" was not found.`, {
      entityType: "script",
      entityId: scriptId
    });
  }

  return script;
};

const getVideoOrThrow = async (
  repositories: PlatformRepositories,
  videoId: string
) => {
  const video = await repositories.videoRepository.findById(videoId);

  if (!video) {
    throw new NotFoundError(`Video "${videoId}" was not found.`, {
      entityType: "video",
      entityId: videoId
    });
  }

  return video;
};

const getContentFormatOrThrow = async (
  repositories: PlatformRepositories,
  contentFormatId: string
) => {
  const contentFormat = await repositories.contentFormatRepository.findById(contentFormatId);

  if (!contentFormat) {
    throw new NotFoundError(`Content format "${contentFormatId}" was not found.`, {
      entityType: "content_format",
      entityId: contentFormatId
    });
  }

  return contentFormat;
};

const getSceneOrThrow = (video: Video, sceneId: string) => {
  const scene = video.scenes.find((item) => item.id === sceneId);

  if (!scene) {
    throw new NotFoundError(`Scene "${sceneId}" was not found on video "${video.id}".`, {
      entityType: "video",
      entityId: video.id,
      sceneId
    });
  }

  return scene;
};

const getNextSceneAssetVersion = (
  assets: Asset[],
  role: "scene_image" | "scene_voice"
): number => {
  const versions = assets
    .filter((asset) => asset.role === role)
    .map((asset) => asset.versionNumber);

  return versions.length === 0 ? 1 : Math.max(...versions) + 1;
};

const hasActiveAssetForEveryScene = (
  video: Video,
  assets: Asset[],
  role: "scene_image" | "scene_voice",
  type: "image" | "audio"
): boolean => {
  return video.scenes.every((scene) =>
    assets.some(
      (asset) =>
        asset.sceneId === scene.id &&
        asset.role === role &&
        asset.type === type &&
        asset.isActive &&
        asset.status === "ready"
    )
  );
};

const maybeMarkVideoImageReady = async (
  repositories: PlatformRepositories,
  video: Video
) => {
  const assets = await repositories.assetRepository.listByVideoId(video.id);
  const hasActiveImages = hasActiveAssetForEveryScene(video, assets, "scene_image", "image");

  if (!hasActiveImages || terminalOrFutureVideoStatuses.has(video.status) || video.status === "image_ready") {
    return video;
  }

  const updated = updateVideoStatus(video, "image_ready");
  await repositories.videoRepository.save(updated);
  return updated;
};

const maybeMarkVideoVoiceReady = async (
  repositories: PlatformRepositories,
  video: Video
) => {
  const assets = await repositories.assetRepository.listByVideoId(video.id);
  const hasActiveAudio = hasActiveAssetForEveryScene(video, assets, "scene_voice", "audio");

  if (
    !hasActiveAudio ||
    video.status === "failed" ||
    video.status === "voice_ready" ||
    video.status === "render_ready" ||
    video.status === "rendered" ||
    video.status === "scheduled" ||
    video.status === "published"
  ) {
    return video;
  }

  const updated = updateVideoStatus(video, "voice_ready");
  await repositories.videoRepository.save(updated);
  return updated;
};

export class ImagePromptGenerationService {
  constructor(
    private readonly repositories: PlatformRepositories,
    private readonly imagePromptGenerationPort: ImagePromptGenerationPort,
    private readonly workflowJobService: WorkflowJobService,
    private readonly auditTrailService: AuditTrailService
  ) {}

  async generateImagePromptPack(input: GenerateImagePromptPackInput) {
    const video = await getVideoOrThrow(this.repositories, input.videoId);
    const script = await getScriptOrThrow(this.repositories, video.scriptId);
    const idea = await getIdeaOrThrow(this.repositories, video.ideaId);
    const topic = await getTopicOrThrow(this.repositories, video.topicId);
    const contentFormat = await getContentFormatOrThrow(this.repositories, video.contentFormatId);

    if (!contentFormat.capabilities.supportsImagePrompts) {
      throw new InvalidStateError(`Format "${contentFormat.slug}" does not support image workflows.`, {
        contentFormatId: contentFormat.id,
        contentFormatSlug: contentFormat.slug
      });
    }

    const execution = await this.workflowJobService.runJob({
      type: "image_prompt_generation",
      reference: createReference("video", video.id),
      payload: {
        videoId: video.id,
        targetProvider: video.imageWorkflowConfig.provider
      },
      executor: async () => {
        const generatedPack = await this.imagePromptGenerationPort.generateImagePromptPack({
          topic,
          contentFormat,
          idea,
          script,
          video
        });

        if (generatedPack.prompts.length !== video.scenes.length) {
          throw new ValidationError("Image prompt generation must return exactly one prompt per scene.", "image_prompt_count_invalid", {
            expectedPromptCount: video.scenes.length,
            actualPromptCount: generatedPack.prompts.length
          });
        }

        const imagePromptPack = createImagePromptPack({
          topicId: topic.id,
          ideaId: idea.id,
          scriptId: script.id,
          videoId: video.id,
          contentFormatId: contentFormat.id,
          workflowMode: generatedPack.workflowMode ?? video.imageWorkflowConfig.mode,
          provider: generatedPack.targetProvider ?? video.imageWorkflowConfig.provider,
          prompts: generatedPack.prompts,
          metadata: {
            promptComposer: this.imagePromptGenerationPort.providerId,
            manualApprovalRequired: video.imageWorkflowConfig.requiresPromptApproval
          }
        });

        await this.repositories.imagePromptPackRepository.save(imagePromptPack);
        await this.auditTrailService.recordActivity({
          action: "image_prompt_pack.generated",
          reference: createReference("image_prompt_pack", imagePromptPack.id),
          message: `Generated ${imagePromptPack.prompts.length} scene image prompts for video "${video.id}".`
        });
        await this.auditTrailService.snapshot(
          createReference("image_prompt_pack", imagePromptPack.id),
          "image_prompt_pack.generated",
          imagePromptPack
        );
        await this.auditTrailService.recordCost({
          provider: imagePromptPack.provider,
          category: "image_generation",
          reference: createReference("image_prompt_pack", imagePromptPack.id),
          amount: 0,
          units: "scene",
          quantity: imagePromptPack.prompts.length,
          metadata: {
            promptComposer: this.imagePromptGenerationPort.providerId,
            workflowMode: imagePromptPack.workflowMode
          }
        });

        return imagePromptPack;
      }
    });

    return {
      job: execution.job,
      logs: execution.logs,
      imagePromptPack: execution.result
    };
  }
}

export class SceneAssetService {
  constructor(
    private readonly repositories: PlatformRepositories,
    private readonly auditTrailService: AuditTrailService
  ) {}

  async registerManualSceneImage(input: RegisterManualSceneImageInput) {
    const video = await getVideoOrThrow(this.repositories, input.videoId);
    const contentFormat = await getContentFormatOrThrow(this.repositories, video.contentFormatId);
    const scene = getSceneOrThrow(video, input.sceneId);

    if (!contentFormat.capabilities.supportsImagePrompts) {
      throw new InvalidStateError(`Format "${contentFormat.slug}" does not support image workflows.`, {
        contentFormatId: contentFormat.id,
        contentFormatSlug: contentFormat.slug
      });
    }

    const provider = input.provider ?? video.imageWorkflowConfig.provider;

    if (!contentFormat.deliveryOptions.imageWorkflow.providerSlugs.includes(provider)) {
      throw new ValidationError(
        `Image provider "${provider}" is not allowed for format "${contentFormat.slug}".`,
        "image_provider_invalid",
        {
          provider,
          contentFormatSlug: contentFormat.slug,
          allowedProviders: contentFormat.deliveryOptions.imageWorkflow.providerSlugs
        }
      );
    }

    const sceneAssets = await this.repositories.assetRepository.listBySceneId(scene.id);
    const hasActiveImage = sceneAssets.some(
      (asset) => asset.role === "scene_image" && asset.type === "image" && asset.isActive
    );

    const asset = createAsset({
      videoId: video.id,
      sceneId: scene.id,
      type: "image",
      role: "scene_image",
      provider,
      sourceType: "manual_upload",
      versionNumber: getNextSceneAssetVersion(sceneAssets, "scene_image"),
      isActive: !hasActiveImage,
      storage: {
        storageProvider: input.storageProvider ?? "external_url",
        url: input.assetUrl,
        ...(input.storageKey ? { storageKey: input.storageKey } : {}),
        ...(input.mimeType ? { mimeType: input.mimeType } : {}),
        ...(input.bytes === undefined ? {} : { bytes: input.bytes })
      },
      ...(input.width === undefined ? {} : { width: input.width }),
      ...(input.height === undefined ? {} : { height: input.height }),
      ...(input.metadata ? { metadata: input.metadata } : {})
    });

    await this.repositories.assetRepository.save(asset);
    const statusAwareVideo = await maybeMarkVideoImageReady(this.repositories, video);

    await this.auditTrailService.recordActivity({
      action: "scene_image_asset.registered",
      reference: createReference("asset", asset.id),
      message: `Registered manual image asset v${asset.versionNumber} for scene ${scene.order} on video "${video.id}".`
    });
    await this.auditTrailService.snapshot(
      createReference("asset", asset.id),
      "scene_image_asset.registered",
      asset
    );

    if (statusAwareVideo.updatedAt.getTime() !== video.updatedAt.getTime()) {
      await this.auditTrailService.recordActivity({
        action: "video.image_ready",
        reference: createReference("video", statusAwareVideo.id),
        message: `All scenes have active image assets for video "${statusAwareVideo.id}".`
      });
      await this.auditTrailService.snapshot(
        createReference("video", statusAwareVideo.id),
        "video.image_ready",
        statusAwareVideo
      );
    }

    return {
      asset,
      video: statusAwareVideo
    };
  }

  async selectActiveSceneImage(input: SelectActiveSceneImageInput) {
    const video = await getVideoOrThrow(this.repositories, input.videoId);
    const scene = getSceneOrThrow(video, input.sceneId);
    const sceneAssets = await this.repositories.assetRepository.listBySceneId(scene.id);
    const targetAsset = sceneAssets.find((asset) => asset.id === input.assetId);

    if (!targetAsset) {
      throw new NotFoundError(`Asset "${input.assetId}" was not found on scene "${scene.id}".`, {
        entityType: "asset",
        entityId: input.assetId,
        sceneId: scene.id
      });
    }

    if (targetAsset.type !== "image" || targetAsset.role !== "scene_image") {
      throw new ValidationError(`Asset "${input.assetId}" is not a scene image asset.`, "asset_role_invalid", {
        assetId: input.assetId,
        expectedRole: "scene_image",
        expectedType: "image"
      });
    }

    const persistedAssets: Asset[] = [];

    for (const asset of sceneAssets) {
      if (asset.type !== "image" || asset.role !== "scene_image") {
        continue;
      }

      const nextAsset = asset.id === targetAsset.id ? activateAsset(asset) : deactivateAsset(asset);
      await this.repositories.assetRepository.save(nextAsset);
      persistedAssets.push(nextAsset);
    }

    const statusAwareVideo = await maybeMarkVideoImageReady(this.repositories, video);
    const activeImageAsset = persistedAssets.find((asset) => asset.id === targetAsset.id) ?? targetAsset;

    await this.auditTrailService.recordActivity({
      action: "scene_image_asset.activated",
      reference: createReference("asset", activeImageAsset.id),
      message: `Selected image asset "${activeImageAsset.id}" as active for scene ${scene.order}.`
    });
    await this.auditTrailService.snapshot(
      createReference("asset", activeImageAsset.id),
      "scene_image_asset.activated",
      activeImageAsset
    );

    if (statusAwareVideo.updatedAt.getTime() !== video.updatedAt.getTime()) {
      await this.auditTrailService.recordActivity({
        action: "video.image_ready",
        reference: createReference("video", statusAwareVideo.id),
        message: `All scenes have active image assets for video "${statusAwareVideo.id}".`
      });
      await this.auditTrailService.snapshot(
        createReference("video", statusAwareVideo.id),
        "video.image_ready",
        statusAwareVideo
      );
    }

    return {
      asset: activeImageAsset,
      video: statusAwareVideo
    };
  }
}

export class SceneVoiceGenerationService {
  constructor(
    private readonly repositories: PlatformRepositories,
    private readonly sceneVoiceGenerationPort: SceneVoiceGenerationPort,
    private readonly workflowJobService: WorkflowJobService,
    private readonly auditTrailService: AuditTrailService
  ) {}

  async generateSceneVoices(input: GenerateSceneVoicesInput) {
    const video = await getVideoOrThrow(this.repositories, input.videoId);
    const script = await getScriptOrThrow(this.repositories, video.scriptId);
    const contentFormat = await getContentFormatOrThrow(this.repositories, video.contentFormatId);

    if (!contentFormat.capabilities.supportsVoiceover) {
      throw new InvalidStateError(`Format "${contentFormat.slug}" does not support voice generation.`, {
        contentFormatId: contentFormat.id,
        contentFormatSlug: contentFormat.slug
      });
    }

    const provider =
      input.provider ??
      (video.voiceoverConfig.provider === "none"
        ? this.sceneVoiceGenerationPort.providerId
        : video.voiceoverConfig.provider);

    if (!contentFormat.deliveryOptions.voice.providerSlugs.includes(provider)) {
      throw new ValidationError(
        `Voice provider "${provider}" is not allowed for format "${contentFormat.slug}".`,
        "voice_provider_invalid",
        {
          provider,
          contentFormatSlug: contentFormat.slug,
          allowedProviders: contentFormat.deliveryOptions.voice.providerSlugs
        }
      );
    }

    if (provider !== this.sceneVoiceGenerationPort.providerId) {
      throw new InvalidStateError(
        `Voice provider "${provider}" is configured for the format, but this API runtime only wires "${this.sceneVoiceGenerationPort.providerId}" for Sprint 2.`,
        {
          provider,
          wiredProvider: this.sceneVoiceGenerationPort.providerId
        }
      );
    }

    const nextVoiceoverConfig = normalizeVoiceoverConfig({
      provider,
      generationMode: video.voiceoverConfig.generationMode,
      ...(input.voiceId
        ? { voiceId: input.voiceId }
        : video.voiceoverConfig.voiceId
          ? { voiceId: video.voiceoverConfig.voiceId }
          : {}),
      styleNotes: input.styleNotes ?? video.voiceoverConfig.styleNotes
    });

    if (nextVoiceoverConfig.generationMode !== "scene_per_line") {
      throw new InvalidStateError(
        "Sprint 2 voice generation currently supports scene_per_line only. merged_narration remains reserved for future expansion.",
        {
          generationMode: nextVoiceoverConfig.generationMode
        }
      );
    }

    const configuredVideo = updateVideoVoiceoverConfig(video, nextVoiceoverConfig);
    await this.repositories.videoRepository.save(configuredVideo);

    const execution = await this.workflowJobService.runJob({
      type: "voice_generation",
      reference: createReference("video", configuredVideo.id),
      payload: {
        videoId: configuredVideo.id,
        provider: nextVoiceoverConfig.provider,
        generationMode: nextVoiceoverConfig.generationMode
      },
      executor: async () => {
        const voiceJobs: VoiceJob[] = [];
        const audioAssets: Asset[] = [];

        for (const scene of configuredVideo.scenes) {
          let voiceJob = createVoiceJob({
            videoId: configuredVideo.id,
            sceneId: scene.id,
            contentFormatId: configuredVideo.contentFormatId,
            provider: this.sceneVoiceGenerationPort.providerId,
            generationMode: nextVoiceoverConfig.generationMode,
            sourceLine: scene.narration,
            ...(nextVoiceoverConfig.voiceId ? { voiceId: nextVoiceoverConfig.voiceId } : {}),
            metadata: {
              sceneOrder: scene.order
            }
          });

          await this.repositories.voiceJobRepository.save(voiceJob);
          voiceJob = startVoiceJob(voiceJob);
          await this.repositories.voiceJobRepository.save(voiceJob);

          try {
            const generatedVoice = await this.sceneVoiceGenerationPort.generateSceneVoice({
              contentFormat,
              script,
              video: configuredVideo,
              scene,
              voiceoverConfig: nextVoiceoverConfig
            });
            const sceneAssets = await this.repositories.assetRepository.listBySceneId(scene.id);
            const newVersionNumber = getNextSceneAssetVersion(sceneAssets, "scene_voice");

            for (const existingAsset of sceneAssets.filter(
              (asset) => asset.role === "scene_voice" && asset.type === "audio" && asset.isActive
            )) {
              await this.repositories.assetRepository.save(deactivateAsset(existingAsset));
            }

            const audioAsset = createAsset({
              videoId: configuredVideo.id,
              sceneId: scene.id,
              type: "audio",
              role: "scene_voice",
              provider: this.sceneVoiceGenerationPort.providerId,
              sourceType: "provider_generated",
              versionNumber: newVersionNumber,
              isActive: true,
              storage: {
                storageProvider: generatedVoice.storageProvider ?? "local",
                url: generatedVoice.assetUrl,
                ...(generatedVoice.storageKey ? { storageKey: generatedVoice.storageKey } : {}),
                ...(generatedVoice.mimeType ? { mimeType: generatedVoice.mimeType } : {})
              },
              durationSeconds: generatedVoice.durationSeconds,
              ...(generatedVoice.metadata ? { metadata: generatedVoice.metadata } : {})
            });

            await this.repositories.assetRepository.save(audioAsset);
            voiceJob = completeVoiceJob(voiceJob, {
              outputAssetId: audioAsset.id,
              durationSeconds: generatedVoice.durationSeconds
            });
            await this.repositories.voiceJobRepository.save(voiceJob);

            voiceJobs.push(voiceJob);
            audioAssets.push(audioAsset);

            await this.auditTrailService.recordActivity({
              action: "scene_voice.generated",
              reference: createReference("voice_job", voiceJob.id),
              message: `Generated scene voice for scene ${scene.order} on video "${configuredVideo.id}".`
            });
            await this.auditTrailService.snapshot(
              createReference("voice_job", voiceJob.id),
              "scene_voice.generated",
              voiceJob
            );
            await this.auditTrailService.snapshot(
              createReference("asset", audioAsset.id),
              "scene_voice_asset.generated",
              audioAsset
            );
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            voiceJob = failVoiceJob(voiceJob, errorMessage);
            await this.repositories.voiceJobRepository.save(voiceJob);
            throw error;
          }
        }

        const statusAwareVideo = await maybeMarkVideoVoiceReady(this.repositories, configuredVideo);

        if (statusAwareVideo.updatedAt.getTime() !== configuredVideo.updatedAt.getTime()) {
          await this.auditTrailService.recordActivity({
            action: "video.voice_ready",
            reference: createReference("video", statusAwareVideo.id),
            message: `All scenes have active voice assets for video "${statusAwareVideo.id}".`
          });
          await this.auditTrailService.snapshot(
            createReference("video", statusAwareVideo.id),
            "video.voice_ready",
            statusAwareVideo
          );
        }

        await this.auditTrailService.recordCost({
          provider: this.sceneVoiceGenerationPort.providerId,
          category: "voice_generation",
          reference: createReference("video", configuredVideo.id),
          amount: 0,
          units: "scene",
          quantity: configuredVideo.scenes.length,
          metadata: {
            generationMode: nextVoiceoverConfig.generationMode,
            voiceId: nextVoiceoverConfig.voiceId ?? null
          }
        });

        return {
          voiceJobs,
          audioAssets,
          video: statusAwareVideo
        };
      }
    });

    return {
      job: execution.job,
      logs: execution.logs,
      voiceJobs: execution.result.voiceJobs,
      audioAssets: execution.result.audioAssets,
      video: execution.result.video
    };
  }
}

export class SubtitlePackGenerationService {
  constructor(
    private readonly repositories: PlatformRepositories,
    private readonly subtitleCompositionPort: SubtitleCompositionPort,
    private readonly workflowJobService: WorkflowJobService,
    private readonly auditTrailService: AuditTrailService
  ) {}

  async generateSubtitlePack(input: GenerateSubtitlePackInput) {
    const video = await getVideoOrThrow(this.repositories, input.videoId);
    const script = await getScriptOrThrow(this.repositories, video.scriptId);
    const contentFormat = await getContentFormatOrThrow(this.repositories, video.contentFormatId);

    if (!contentFormat.capabilities.supportsSubtitleConfig) {
      throw new InvalidStateError(`Format "${contentFormat.slug}" does not support subtitle workflows.`, {
        contentFormatId: contentFormat.id,
        contentFormatSlug: contentFormat.slug
      });
    }

    const execution = await this.workflowJobService.runJob({
      type: "subtitle_pack_generation",
      reference: createReference("video", video.id),
      payload: {
        videoId: video.id,
        provider: this.subtitleCompositionPort.providerId
      },
      executor: async () => {
        const generatedPack = await this.subtitleCompositionPort.composeSubtitlePack({
          contentFormat,
          script,
          video
        });

        if (generatedPack.overlayCues.length !== video.scenes.length) {
          throw new ValidationError(
            "Subtitle generation must return exactly one overlay cue per scene.",
            "subtitle_overlay_count_invalid",
            {
              expectedOverlayCueCount: video.scenes.length,
              actualOverlayCueCount: generatedPack.overlayCues.length
            }
          );
        }

        if (generatedPack.subtitleCues.length > video.scenes.length) {
          throw new ValidationError(
            "Subtitle generation cannot return more subtitle cues than scenes.",
            "subtitle_cue_count_invalid",
            {
              maxSubtitleCueCount: video.scenes.length,
              actualSubtitleCueCount: generatedPack.subtitleCues.length
            }
          );
        }

        for (const scene of video.scenes) {
          const effectiveSubtitleConfig = resolveVideoSceneSubtitleConfig(video, scene);

          if (
            effectiveSubtitleConfig.enabled &&
            !generatedPack.subtitleCues.some((cue) => cue.sceneId === scene.id)
          ) {
            throw new ValidationError(
              `Subtitle generation must return a subtitle cue for enabled scene ${scene.order}.`,
              "subtitle_cue_missing_for_scene",
              {
                sceneId: scene.id,
                sceneOrder: scene.order
              }
            );
          }
        }

        const subtitlePack = createSubtitlePack({
          videoId: video.id,
          scriptId: script.id,
          contentFormatId: contentFormat.id,
          provider: this.subtitleCompositionPort.providerId,
          defaultMode: generatedPack.defaultMode,
          subtitleCues: generatedPack.subtitleCues,
          overlayCues: generatedPack.overlayCues,
          metadata: {
            provider: this.subtitleCompositionPort.providerId
          }
        });

        await this.repositories.subtitlePackRepository.save(subtitlePack);
        await this.auditTrailService.recordActivity({
          action: "subtitle_pack.generated",
          reference: createReference("subtitle_pack", subtitlePack.id),
          message: `Generated subtitle and overlay pack for video "${video.id}".`
        });
        await this.auditTrailService.snapshot(
          createReference("subtitle_pack", subtitlePack.id),
          "subtitle_pack.generated",
          subtitlePack
        );
        await this.auditTrailService.recordCost({
          provider: this.subtitleCompositionPort.providerId,
          category: "subtitle_generation",
          reference: createReference("subtitle_pack", subtitlePack.id),
          amount: 0,
          units: "scene",
          quantity: subtitlePack.overlayCues.length
        });

        return subtitlePack;
      }
    });

    return {
      job: execution.job,
      logs: execution.logs,
      subtitlePack: execution.result
    };
  }
}

export class VideoCmsService {
  constructor(
    private readonly repositories: PlatformRepositories,
    private readonly auditTrailService: AuditTrailService
  ) {}

  async listVideos() {
    return this.repositories.videoRepository.list();
  }

  async getVideoDetail(videoId: string): Promise<VideoDetail> {
    const video = await getVideoOrThrow(this.repositories, videoId);
    const [
      topic,
      idea,
      script,
      contentFormat,
      imagePromptPack,
      subtitlePack,
      schedule,
      publishAttempts,
      assets,
      voiceJobs,
      renderJobs
    ] = await Promise.all([
      getTopicOrThrow(this.repositories, video.topicId),
      getIdeaOrThrow(this.repositories, video.ideaId),
      getScriptOrThrow(this.repositories, video.scriptId),
      getContentFormatOrThrow(this.repositories, video.contentFormatId),
      this.repositories.imagePromptPackRepository.findByVideoId(video.id),
      this.repositories.subtitlePackRepository.findByVideoId(video.id),
      this.repositories.publicationScheduleRepository.findByVideoId(video.id),
      this.repositories.publishAttemptRepository.listByVideoId(video.id),
      this.repositories.assetRepository.listByVideoId(video.id),
      this.repositories.voiceJobRepository.listByVideoId(video.id),
      this.repositories.workflowJobRepository.listByReference(createReference("video", video.id), "render")
    ]);
    const renderAssets = assets.filter(
      (asset) => asset.role === "render_output" && asset.type === "video"
    );
    const activeRenderAsset = renderAssets.find((asset) => asset.isActive);

    return {
      topic,
      idea,
      script,
      contentFormat,
      video,
      ...(imagePromptPack ? { imagePromptPack } : {}),
      ...(subtitlePack ? { subtitlePack } : {}),
      ...(schedule ? { schedule } : {}),
      publishAttempts,
      renderJobs,
      renderAssets,
      ...(activeRenderAsset ? { activeRenderAsset } : {}),
      scenes: video.scenes.map((scene) => {
        const imageAssets = assets.filter(
          (asset) => asset.sceneId === scene.id && asset.role === "scene_image" && asset.type === "image"
        );
        const audioAssets = assets.filter(
          (asset) => asset.sceneId === scene.id && asset.role === "scene_voice" && asset.type === "audio"
        );
        const imagePrompt = imagePromptPack?.prompts.find((prompt) => prompt.sceneId === scene.id);
        const activeImageAsset = imageAssets.find((asset) => asset.isActive);
        const activeAudioAsset = audioAssets.find((asset) => asset.isActive);
        const subtitleCue = subtitlePack?.subtitleCues.find((cue) => cue.sceneId === scene.id);
        const overlayCue = subtitlePack?.overlayCues.find((cue) => cue.sceneId === scene.id);

        return {
          scene,
          ...(imagePrompt ? { imagePrompt } : {}),
          imageAssets,
          ...(activeImageAsset ? { activeImageAsset } : {}),
          audioAssets,
          ...(activeAudioAsset ? { activeAudioAsset } : {}),
          voiceJobs: voiceJobs.filter((voiceJob) => voiceJob.sceneId === scene.id),
          ...(subtitleCue ? { subtitleCue } : {}),
          ...(overlayCue ? { overlayCue } : {})
        };
      })
    };
  }

  async scheduleVideo(input: ScheduleVideoInput) {
    const video = await this.repositories.videoRepository.findById(input.videoId);

    if (!video) {
      throw new NotFoundError(`Video "${input.videoId}" was not found.`, {
        entityType: "video",
        entityId: input.videoId
      });
    }

    const contentFormat = await this.repositories.contentFormatRepository.findById(video.contentFormatId);

    if (!contentFormat) {
      throw new NotFoundError(`Content format "${video.contentFormatId}" was not found.`, {
        entityType: "content_format",
        entityId: video.contentFormatId
      });
    }

    if (!contentFormat.deliveryOptions.publishing.platformSlugs.includes(input.platformSlug)) {
      throw new ValidationError(
        `Platform "${input.platformSlug}" is not allowed for format "${contentFormat.slug}".`,
        "schedule_platform_invalid",
        {
          field: "platformSlug",
          platformSlug: input.platformSlug,
          contentFormatSlug: contentFormat.slug,
          allowedPlatforms: contentFormat.deliveryOptions.publishing.platformSlugs
        }
      );
    }

    const provider = input.provider ?? contentFormat.deliveryOptions.publishing.defaultProvider;
    const mode = input.mode ?? contentFormat.deliveryOptions.publishing.defaultMode;

    if (!contentFormat.deliveryOptions.publishing.providerSlugs.includes(provider)) {
      throw new ValidationError(
        `Provider "${provider}" is not allowed for format "${contentFormat.slug}".`,
        "schedule_provider_invalid",
        {
          field: "provider",
          provider,
          contentFormatSlug: contentFormat.slug,
          allowedProviders: contentFormat.deliveryOptions.publishing.providerSlugs
        }
      );
    }

    if (!contentFormat.deliveryOptions.publishing.supportedModes.includes(mode)) {
      throw new ValidationError(
        `Publish mode "${mode}" is not allowed for format "${contentFormat.slug}".`,
        "schedule_publish_mode_invalid",
        {
          field: "mode",
          mode,
          contentFormatSlug: contentFormat.slug,
          allowedModes: contentFormat.deliveryOptions.publishing.supportedModes
        }
      );
    }

    if (input.scheduledFor.getTime() <= Date.now()) {
      throw new ValidationError("scheduledFor must be in the future.", "schedule_time_invalid", {
        field: "scheduledFor"
      });
    }

    const schedule = createPublicationSchedule({
      videoId: video.id,
      platformSlug: input.platformSlug,
      provider,
      mode,
      timezone: input.timezone,
      scheduledFor: input.scheduledFor,
      caption: input.caption,
      hashtags: input.hashtags
    });

    await this.repositories.publicationScheduleRepository.save(schedule);

    const updatedVideo = updateVideoPublishingConfig(video, {
      enabled: true,
      channel: input.platformSlug,
      provider,
      mode,
      scheduledFor: input.scheduledFor
    });
    const statusAwareVideo =
      updatedVideo.status === "rendered"
        ? updateVideoStatus(updatedVideo, "scheduled")
        : updatedVideo;
    await this.repositories.videoRepository.save(statusAwareVideo);

    await this.auditTrailService.recordActivity({
      action: "video.scheduled",
      reference: createReference("publication_schedule", schedule.id),
      message: `Scheduled video "${video.id}" for ${input.platformSlug}.`
    });
    await this.auditTrailService.snapshot(
      createReference("publication_schedule", schedule.id),
      "video.scheduled",
      schedule
    );
    await this.auditTrailService.snapshot(
      createReference("video", statusAwareVideo.id),
      "video.schedule_metadata_updated",
      statusAwareVideo
    );

    return schedule;
  }

  async listSchedules() {
    return this.repositories.publicationScheduleRepository.list();
  }
}
