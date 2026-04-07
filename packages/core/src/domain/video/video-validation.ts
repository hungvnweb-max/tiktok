import type { Asset } from "../asset/asset";
import { DomainError, ValidationError, type ErrorDetails } from "../common/entity";
import {
  type PublishMode,
  resolveSceneSubtitleConfig,
  type SubtitleConfig
} from "../common/media";
import { type ContentFormat } from "../content-format/content-format";
import { type ImagePromptPack } from "../image/image-prompt-pack";
import { type PublicationSchedule } from "../schedule/publication-schedule";
import { validateScenesAgainstContentFormat, validateScriptDurationAgainstContentFormat } from "../script/script-validation";
import { type SubtitlePack } from "../subtitle/subtitle-pack";
import { type Video } from "./video";

export interface VideoValidationIssue {
  code: string;
  message: string;
  details?: ErrorDetails;
}

export interface VideoValidationReport {
  isValid: boolean;
  issues: VideoValidationIssue[];
}

const createIssue = (
  code: string,
  message: string,
  details?: ErrorDetails
): VideoValidationIssue => {
  return {
    code,
    message,
    ...(details ? { details } : {})
  };
};

const mapErrorToIssue = (error: unknown): VideoValidationIssue => {
  if (error instanceof DomainError) {
    return createIssue(error.code, error.message, error.details);
  }

  return createIssue("video_config_invalid", error instanceof Error ? error.message : String(error));
};

const validateSubtitleConfig = (
  contentFormat: ContentFormat,
  subtitleConfig: SubtitleConfig
): void => {
  if (
    subtitleConfig.enabled &&
    !contentFormat.deliveryOptions.subtitle.supportedModes.includes(subtitleConfig.mode)
  ) {
    throw new ValidationError(
      `Subtitle mode "${subtitleConfig.mode}" is not allowed for format "${contentFormat.slug}".`,
      "subtitle_mode_invalid",
      {
        contentFormatSlug: contentFormat.slug,
        mode: subtitleConfig.mode,
        allowedModes: contentFormat.deliveryOptions.subtitle.supportedModes
      }
    );
  }

  if (
    subtitleConfig.enabled === false &&
    !contentFormat.deliveryOptions.subtitle.supportedModes.includes("off")
  ) {
    throw new ValidationError(
      `Format "${contentFormat.slug}" does not support subtitles being disabled.`,
      "subtitle_disable_not_supported",
      {
        contentFormatSlug: contentFormat.slug
      }
    );
  }
};

const validateRenderConfig = (video: Video, contentFormat: ContentFormat): void => {
  if (!contentFormat.deliveryOptions.render.providerSlugs.includes(video.renderConfig.provider)) {
    throw new ValidationError(
      `Render provider "${video.renderConfig.provider}" is not allowed for format "${contentFormat.slug}".`,
      "render_provider_invalid",
      {
        contentFormatSlug: contentFormat.slug,
        provider: video.renderConfig.provider,
        allowedProviders: contentFormat.deliveryOptions.render.providerSlugs
      }
    );
  }

  if (!contentFormat.deliveryOptions.render.templateSlugs.includes(video.renderConfig.templateSlug)) {
    throw new ValidationError(
      `Render template "${video.renderConfig.templateSlug}" is not allowed for format "${contentFormat.slug}".`,
      "render_template_invalid",
      {
        contentFormatSlug: contentFormat.slug,
        templateSlug: video.renderConfig.templateSlug,
        allowedTemplates: contentFormat.deliveryOptions.render.templateSlugs
      }
    );
  }

  if (
    !contentFormat.deliveryOptions.publishing.platformSlugs.includes(
      video.renderConfig.targetPlatform
    )
  ) {
    throw new ValidationError(
      `Render target platform "${video.renderConfig.targetPlatform}" is not allowed for format "${contentFormat.slug}".`,
      "render_target_platform_invalid",
      {
        contentFormatSlug: contentFormat.slug,
        targetPlatform: video.renderConfig.targetPlatform,
        allowedPlatforms: contentFormat.deliveryOptions.publishing.platformSlugs
      }
    );
  }
};

const validateImageWorkflowConfig = (video: Video, contentFormat: ContentFormat): void => {
  if (
    !contentFormat.deliveryOptions.imageWorkflow.providerSlugs.includes(
      video.imageWorkflowConfig.provider
    )
  ) {
    throw new ValidationError(
      `Image provider "${video.imageWorkflowConfig.provider}" is not allowed for format "${contentFormat.slug}".`,
      "image_provider_invalid",
      {
        contentFormatSlug: contentFormat.slug,
        provider: video.imageWorkflowConfig.provider,
        allowedProviders: contentFormat.deliveryOptions.imageWorkflow.providerSlugs
      }
    );
  }
};

const validateVoiceoverConfig = (video: Video, contentFormat: ContentFormat): void => {
  if (!contentFormat.deliveryOptions.voice.providerSlugs.includes(video.voiceoverConfig.provider)) {
    throw new ValidationError(
      `Voice provider "${video.voiceoverConfig.provider}" is not allowed for format "${contentFormat.slug}".`,
      "voice_provider_invalid",
      {
        contentFormatSlug: contentFormat.slug,
        provider: video.voiceoverConfig.provider,
        allowedProviders: contentFormat.deliveryOptions.voice.providerSlugs
      }
    );
  }

  if (
    !contentFormat.deliveryOptions.voice.generationModes.includes(
      video.voiceoverConfig.generationMode
    )
  ) {
    throw new ValidationError(
      `Voice generation mode "${video.voiceoverConfig.generationMode}" is not allowed for format "${contentFormat.slug}".`,
      "voice_generation_mode_invalid",
      {
        contentFormatSlug: contentFormat.slug,
        generationMode: video.voiceoverConfig.generationMode,
        allowedGenerationModes: contentFormat.deliveryOptions.voice.generationModes
      }
    );
  }
};

export const validateVideoConfigurationAgainstContentFormat = (
  video: Video,
  contentFormat: ContentFormat
): void => {
  validateScenesAgainstContentFormat(video.scenes, contentFormat);
  validateScriptDurationAgainstContentFormat(video.estimatedDurationSeconds, contentFormat);
  validateSubtitleConfig(contentFormat, video.subtitleConfig);
  validateImageWorkflowConfig(video, contentFormat);
  validateVoiceoverConfig(video, contentFormat);
  validateRenderConfig(video, contentFormat);

  for (const scene of video.scenes) {
    const effectiveSubtitleConfig = resolveSceneSubtitleConfig(
      video.subtitleConfig,
      scene.subtitleConfig
    );

    if (
      effectiveSubtitleConfig.enabled &&
      !contentFormat.deliveryOptions.subtitle.supportedModes.includes(effectiveSubtitleConfig.mode)
    ) {
      throw new ValidationError(
        `Scene ${scene.order} subtitle mode "${effectiveSubtitleConfig.mode}" is not allowed for format "${contentFormat.slug}".`,
        "scene_subtitle_mode_invalid",
        {
          sceneId: scene.id,
          sceneOrder: scene.order,
          contentFormatSlug: contentFormat.slug,
          mode: effectiveSubtitleConfig.mode,
          allowedModes: contentFormat.deliveryOptions.subtitle.supportedModes
        }
      );
    }
  }
};

export const validateVideoForRender = (
  video: Video,
  contentFormat: ContentFormat,
  options: {
    imagePromptPack?: ImagePromptPack;
    subtitlePack?: SubtitlePack;
    activeImageAssets?: Asset[];
    activeAudioAssets?: Asset[];
  } = {}
): VideoValidationReport => {
  const issues: VideoValidationIssue[] = [];
  const imagePromptPack = options.imagePromptPack;
  const subtitlePack = options.subtitlePack;

  try {
    validateVideoConfigurationAgainstContentFormat(video, contentFormat);
  } catch (error) {
    issues.push(mapErrorToIssue(error));
  }

  if (!contentFormat.capabilities.supportsRenderJobs) {
    issues.push(
      createIssue("render_not_supported", `Format "${contentFormat.slug}" does not support render jobs.`, {
        contentFormatSlug: contentFormat.slug
      })
    );
  }

  if (!imagePromptPack) {
    issues.push(
      createIssue("image_workflow_missing", "Image workflow deliverables must exist before render validation.", {
        videoId: video.id
      })
    );
  }

  const activeImageAssets = options.activeImageAssets ?? [];

  for (const scene of video.scenes) {
    if (!activeImageAssets.some((asset) => asset.sceneId === scene.id)) {
      issues.push(
        createIssue(
          "scene_image_asset_missing",
          `Scene ${scene.order} must have an active image asset before render.`,
          {
            videoId: video.id,
            sceneId: scene.id,
            sceneOrder: scene.order
          }
        )
      );
    }
  }

  const hasAnySceneSubtitles = video.scenes.some((scene) => {
    return resolveSceneSubtitleConfig(video.subtitleConfig, scene.subtitleConfig).enabled;
  });

  if (video.renderConfig.subtitleBurnIn && hasAnySceneSubtitles && !subtitlePack) {
    issues.push(
      createIssue("subtitle_pack_missing", "Subtitle pack must exist before render when subtitle burn-in is enabled.", {
        videoId: video.id
      })
    );
  }

  if (video.voiceoverConfig.provider !== "none") {
    const activeAudioAssets = options.activeAudioAssets ?? [];

    for (const scene of video.scenes) {
      if (!activeAudioAssets.some((asset) => asset.sceneId === scene.id)) {
        issues.push(
          createIssue(
            "scene_audio_asset_missing",
            `Scene ${scene.order} must have an active audio asset before render.`,
            {
              videoId: video.id,
              sceneId: scene.id,
              sceneOrder: scene.order,
              provider: video.voiceoverConfig.provider
            }
          )
        );
      }
    }
  }

  if (video.status === "published") {
    issues.push(
      createIssue("video_state_invalid", `Video "${video.id}" cannot be rendered from status "${video.status}".`, {
        videoId: video.id,
        currentStatus: video.status
      })
    );
  }

  return {
    isValid: issues.length === 0,
    issues
  };
};

export const validateVideoForPublish = (
  video: Video,
  contentFormat: ContentFormat,
  options: {
    schedule?: PublicationSchedule;
    publishMode?: PublishMode;
    publishWindowOpen?: boolean;
    activeRenderAsset?: Asset;
  }
): VideoValidationReport => {
  const issues: VideoValidationIssue[] = [];

  try {
    validateVideoConfigurationAgainstContentFormat(video, contentFormat);
  } catch (error) {
    issues.push(mapErrorToIssue(error));
  }

  if (!contentFormat.capabilities.supportsPublishing) {
    issues.push(
      createIssue("publishing_not_supported", `Format "${contentFormat.slug}" does not support publishing.`, {
        contentFormatSlug: contentFormat.slug
      })
    );
  }

  if (!options.schedule) {
    issues.push(
      createIssue("schedule_missing", "Video must have schedule-ready metadata before publish validation.", {
        videoId: video.id
      })
    );
  }

  if (options.schedule) {
    if (!contentFormat.deliveryOptions.publishing.platformSlugs.includes(options.schedule.platformSlug)) {
      issues.push(
        createIssue(
          "schedule_platform_invalid",
          `Platform "${options.schedule.platformSlug}" is not allowed for format "${contentFormat.slug}".`,
          {
            platformSlug: options.schedule.platformSlug,
            contentFormatSlug: contentFormat.slug,
            allowedPlatforms: contentFormat.deliveryOptions.publishing.platformSlugs
          }
        )
      );
    }

    if (!contentFormat.deliveryOptions.publishing.providerSlugs.includes(options.schedule.provider)) {
      issues.push(
        createIssue(
          "publish_provider_invalid",
          `Provider "${options.schedule.provider}" is not allowed for format "${contentFormat.slug}".`,
          {
            provider: options.schedule.provider,
            contentFormatSlug: contentFormat.slug,
            allowedProviders: contentFormat.deliveryOptions.publishing.providerSlugs
          }
        )
      );
    }

    if (!contentFormat.deliveryOptions.publishing.supportedModes.includes(options.schedule.mode)) {
      issues.push(
        createIssue(
          "publish_mode_invalid",
          `Publish mode "${options.schedule.mode}" is not allowed for format "${contentFormat.slug}".`,
          {
            mode: options.schedule.mode,
            contentFormatSlug: contentFormat.slug,
            allowedModes: contentFormat.deliveryOptions.publishing.supportedModes
          }
        )
      );
    }

    if (video.renderConfig.targetPlatform !== options.schedule.platformSlug) {
      issues.push(
        createIssue(
          "render_target_mismatch",
          `Render target "${video.renderConfig.targetPlatform}" must match scheduled platform "${options.schedule.platformSlug}".`,
          {
            renderTargetPlatform: video.renderConfig.targetPlatform,
            scheduledPlatform: options.schedule.platformSlug
          }
        )
      );
    }
  }

  if (options.publishMode && !contentFormat.deliveryOptions.publishing.supportedModes.includes(options.publishMode)) {
    issues.push(
      createIssue(
        "publish_mode_override_invalid",
        `Publish mode "${options.publishMode}" is not allowed for format "${contentFormat.slug}".`,
        {
          mode: options.publishMode,
          contentFormatSlug: contentFormat.slug,
          allowedModes: contentFormat.deliveryOptions.publishing.supportedModes
        }
      )
    );
  }

  if (options.publishWindowOpen === false) {
    issues.push(createIssue("publish_window_not_open", "Scheduled publish time has not been reached yet."));
  }

  if (!options.activeRenderAsset) {
    issues.push(
      createIssue("render_output_missing", "Rendered video output asset must exist before publish validation.", {
        videoId: video.id
      })
    );
  }

  if (video.status !== "rendered" && video.status !== "scheduled") {
    issues.push(
      createIssue("video_not_rendered", `Video "${video.id}" must be rendered before publish validation.`, {
        videoId: video.id,
        currentStatus: video.status
      })
    );
  }

  return {
    isValid: issues.length === 0,
    issues
  };
};
