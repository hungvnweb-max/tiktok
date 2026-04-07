import { type AuditTrailService, createReference } from "./operational-services";
import { InvalidStateError, NotFoundError, ValidationError } from "../domain/common/entity";
import {
  normalizeSceneSubtitleConfigOverride,
  normalizeSubtitleConfig,
  type SceneSubtitleConfigOverride,
  type SubtitleConfig
} from "../domain/common/media";
import {
  validateVideoForPublish,
  validateVideoForRender,
  type VideoValidationReport
} from "../domain/video/video-validation";
import {
  updateVideoStatus,
  type Video
} from "../domain/video/video";
import type { PlatformRepositories } from "../ports/repositories";

export class VideoWorkflowService {
  constructor(
    private readonly repositories: PlatformRepositories,
    private readonly auditTrailService: AuditTrailService
  ) {}

  async updateVideoSubtitleConfig(
    videoId: string,
    input: SubtitleConfig
  ): Promise<Video> {
    const video = await this.getVideoOrThrow(videoId);
    const contentFormat = await this.getContentFormatOrThrow(video.contentFormatId);

    if (!contentFormat.capabilities.supportsSubtitleConfig) {
      throw new InvalidStateError(`Format "${contentFormat.slug}" does not support subtitle configuration.`, {
        contentFormatId: contentFormat.id,
        contentFormatSlug: contentFormat.slug
      });
    }

    if (!contentFormat.deliveryOptions.subtitle.allowVideoOverride) {
      throw new InvalidStateError(`Format "${contentFormat.slug}" does not allow video-level subtitle overrides.`, {
        contentFormatId: contentFormat.id,
        contentFormatSlug: contentFormat.slug
      });
    }

    const nextConfig = normalizeSubtitleConfig(input);

    if (
      nextConfig.enabled &&
      !contentFormat.deliveryOptions.subtitle.supportedModes.includes(nextConfig.mode)
    ) {
      throw new ValidationError(
        `Subtitle mode "${nextConfig.mode}" is not allowed for format "${contentFormat.slug}".`,
        "subtitle_mode_invalid",
        {
          mode: nextConfig.mode,
          contentFormatSlug: contentFormat.slug,
          allowedModes: contentFormat.deliveryOptions.subtitle.supportedModes
        }
      );
    }

    const updated = {
      ...video,
      subtitleConfig: nextConfig,
      updatedAt: new Date()
    };
    await this.repositories.videoRepository.save(updated);
    await this.auditTrailService.recordActivity({
      action: "video.subtitle_config_updated",
      reference: createReference("video", updated.id),
      message: `Updated video-level subtitle config for video "${updated.id}".`
    });
    await this.auditTrailService.snapshot(
      createReference("video", updated.id),
      "video.subtitle_config_updated",
      updated
    );
    return updated;
  }

  async updateSceneSubtitleConfig(
    videoId: string,
    sceneId: string,
    input: SceneSubtitleConfigOverride | null
  ): Promise<Video> {
    const video = await this.getVideoOrThrow(videoId);
    const contentFormat = await this.getContentFormatOrThrow(video.contentFormatId);

    if (!contentFormat.capabilities.supportsSubtitleConfig) {
      throw new InvalidStateError(`Format "${contentFormat.slug}" does not support subtitle configuration.`, {
        contentFormatId: contentFormat.id,
        contentFormatSlug: contentFormat.slug
      });
    }

    if (!contentFormat.deliveryOptions.subtitle.allowSceneOverride) {
      throw new InvalidStateError(`Format "${contentFormat.slug}" does not allow scene-level subtitle overrides.`, {
        contentFormatId: contentFormat.id,
        contentFormatSlug: contentFormat.slug
      });
    }

    const sceneExists = video.scenes.some((scene) => scene.id === sceneId);

    if (!sceneExists) {
      throw new NotFoundError(`Scene "${sceneId}" was not found on video "${video.id}".`, {
        entityType: "video",
        entityId: video.id,
        sceneId
      });
    }

    const normalizedOverride = input ? normalizeSceneSubtitleConfigOverride(input) : null;

    if (
      normalizedOverride?.enabled &&
      !contentFormat.deliveryOptions.subtitle.supportedModes.includes(normalizedOverride.mode)
    ) {
      throw new ValidationError(
        `Scene subtitle mode "${normalizedOverride.mode}" is not allowed for format "${contentFormat.slug}".`,
        "scene_subtitle_mode_invalid",
        {
          sceneId,
          mode: normalizedOverride.mode,
          contentFormatSlug: contentFormat.slug,
          allowedModes: contentFormat.deliveryOptions.subtitle.supportedModes
        }
      );
    }

    const updatedScenes = video.scenes.map((scene) => {
      if (scene.id !== sceneId) {
        return scene;
      }

      return {
        ...scene,
        ...(normalizedOverride ? { subtitleConfig: normalizedOverride } : { subtitleConfig: null }),
        updatedAt: new Date()
      };
    });

    const updated = {
      ...video,
      scenes: updatedScenes,
      updatedAt: new Date()
    };
    await this.repositories.videoRepository.save(updated);
    await this.auditTrailService.recordActivity({
      action: "video.scene_subtitle_config_updated",
      reference: createReference("video", updated.id),
      message: `Updated subtitle config for scene "${sceneId}" on video "${updated.id}".`
    });
    await this.auditTrailService.snapshot(
      createReference("video", updated.id),
      "video.scene_subtitle_config_updated",
      updated
    );
    return updated;
  }

  async markVoiceReady(videoId: string): Promise<Video> {
    const video = await this.getVideoOrThrow(videoId);
    const contentFormat = await this.getContentFormatOrThrow(video.contentFormatId);

    if (video.voiceoverConfig.provider === "none") {
      throw new InvalidStateError(`Video "${video.id}" has no configured voice provider to mark ready.`, {
        videoId: video.id,
        provider: video.voiceoverConfig.provider
      });
    }

    if (!contentFormat.capabilities.supportsVoiceover) {
      throw new InvalidStateError(`Format "${contentFormat.slug}" does not support voiceover.`, {
        contentFormatId: contentFormat.id,
        contentFormatSlug: contentFormat.slug
      });
    }

    const updated =
      video.status === "render_ready" ||
      video.status === "rendered" ||
      video.status === "scheduled" ||
      video.status === "published"
        ? video
        : updateVideoStatus(video, "voice_ready");
    await this.repositories.videoRepository.save(updated);
    await this.auditTrailService.recordActivity({
      action: "video.voice_ready",
      reference: createReference("video", updated.id),
      message: `Marked voice workflow ready for video "${updated.id}".`
    });
    await this.auditTrailService.snapshot(createReference("video", updated.id), "video.voice_ready", updated);
    return updated;
  }

  async validateRenderReadiness(videoId: string): Promise<{
    report: VideoValidationReport;
    video: Video;
  }> {
    const video = await this.getVideoOrThrow(videoId);
    const contentFormat = await this.getContentFormatOrThrow(video.contentFormatId);
    const imagePromptPack = await this.repositories.imagePromptPackRepository.findByVideoId(video.id);
    const subtitlePack = await this.repositories.subtitlePackRepository.findByVideoId(video.id);
    const assets = await this.repositories.assetRepository.listByVideoId(video.id);
    const report = validateVideoForRender(video, contentFormat, {
      ...(imagePromptPack ? { imagePromptPack } : {}),
      ...(subtitlePack ? { subtitlePack } : {}),
      activeImageAssets: assets.filter(
        (asset) => asset.role === "scene_image" && asset.type === "image" && asset.isActive
      ),
      activeAudioAssets: assets.filter(
        (asset) => asset.role === "scene_voice" && asset.type === "audio" && asset.isActive
      )
    });

    if (!report.isValid) {
      await this.auditTrailService.recordActivity({
        action: "video.render_validation_failed",
        reference: createReference("video", video.id),
        message: `Render validation failed for video "${video.id}".`,
        metadata: {
          issueCount: report.issues.length
        }
      });

      return {
        report,
        video
      };
    }

    const updated =
      video.status === "rendered" ||
      video.status === "scheduled" ||
      video.status === "published"
        ? video
        : updateVideoStatus(video, "render_ready");
    await this.repositories.videoRepository.save(updated);
    await this.auditTrailService.recordActivity({
      action: "video.render_validated",
      reference: createReference("video", updated.id),
      message: `Render validation passed for video "${updated.id}".`
    });
    await this.auditTrailService.snapshot(
      createReference("video", updated.id),
      "video.render_validated",
      updated
    );

    return {
      report,
      video: updated
    };
  }

  async markRendered(videoId: string): Promise<Video> {
    const video = await this.getVideoOrThrow(videoId);
    const schedule = await this.repositories.publicationScheduleRepository.findByVideoId(video.id);
    const hasScheduledPublishingConfig =
      video.publishingConfig?.enabled === true && video.publishingConfig.scheduledFor instanceof Date;
    const nextStatus = schedule || hasScheduledPublishingConfig ? "scheduled" : "rendered";

    if (video.status !== "render_ready" && video.status !== "scheduled") {
      throw new InvalidStateError(
        `Video "${video.id}" must pass render validation before it can be marked rendered.`
      );
    }

    const updated = updateVideoStatus(video, nextStatus);
    await this.repositories.videoRepository.save(updated);
    await this.auditTrailService.recordActivity({
      action: "video.rendered",
      reference: createReference("video", updated.id),
      message: `Marked video "${updated.id}" as ${updated.status}.`
    });
    await this.auditTrailService.snapshot(createReference("video", updated.id), "video.rendered", updated);
    return updated;
  }

  async validatePublishReadiness(videoId: string): Promise<{
    report: VideoValidationReport;
    video: Video;
  }> {
    const video = await this.getVideoOrThrow(videoId);
    const contentFormat = await this.getContentFormatOrThrow(video.contentFormatId);
    const [schedule, assets] = await Promise.all([
      this.repositories.publicationScheduleRepository.findByVideoId(video.id),
      this.repositories.assetRepository.listByVideoId(video.id)
    ]);
    const activeRenderAsset = assets.find(
      (asset) => asset.role === "render_output" && asset.type === "video" && asset.isActive
    );
    const report = validateVideoForPublish(video, contentFormat, {
      ...(schedule ? { schedule } : {}),
      ...(activeRenderAsset ? { activeRenderAsset } : {}),
      publishWindowOpen: true
    });

    await this.auditTrailService.recordActivity({
      action: report.isValid ? "video.publish_validated" : "video.publish_validation_failed",
      reference: createReference("video", video.id),
      message: report.isValid
        ? `Publish validation passed for video "${video.id}".`
        : `Publish validation failed for video "${video.id}".`,
      metadata: {
        issueCount: report.issues.length
      }
    });

    return {
      report,
      video
    };
  }

  async markPublished(videoId: string): Promise<Video> {
    const { report, video } = await this.validatePublishReadiness(videoId);

    if (!report.isValid) {
      throw new InvalidStateError(`Video "${video.id}" is not publish-ready.`, {
        videoId: video.id,
        issueCount: report.issues.length
      });
    }

    const updated = updateVideoStatus(video, "published");
    await this.repositories.videoRepository.save(updated);
    await this.auditTrailService.recordActivity({
      action: "video.published",
      reference: createReference("video", updated.id),
      message: `Marked video "${updated.id}" as published.`
    });
    await this.auditTrailService.snapshot(
      createReference("video", updated.id),
      "video.published",
      updated
    );
    return updated;
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
}
