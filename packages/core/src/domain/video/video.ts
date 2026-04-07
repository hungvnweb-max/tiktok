import {
  DomainError,
  InvalidStateError,
  createEntityId,
  ensureNonEmptyString,
  ensurePositiveInteger,
  now,
  type AuditableEntity
} from "../common/entity";
import {
  createSubtitleConfigFromPolicy,
  normalizeImageWorkflowConfig,
  type PublishMode,
  normalizeRenderConfig,
  normalizeSubtitleConfig,
  normalizeVoiceoverConfig,
  resolveSceneSubtitleConfig,
  type ImageWorkflowConfig,
  type RenderConfig,
  type SubtitleConfig,
  type VoiceoverConfig
} from "../common/media";
import type { ContentFormat } from "../content-format/content-format";
import type { PublishingProvider } from "../common/providers";
import type { SceneDirection } from "./scene";

export type VideoStatus =
  | "idea_created"
  | "script_ready"
  | "image_ready"
  | "voice_ready"
  | "render_ready"
  | "rendered"
  | "scheduled"
  | "published"
  | "failed";

export interface PublishingConfig {
  enabled: boolean;
  channel?: string;
  provider?: PublishingProvider;
  mode?: PublishMode;
  scheduledFor?: Date;
  lastPublishAttemptId?: string;
  lastProviderStatus?: string;
  lastPublishError?: string;
  externalPublicationId?: string;
  externalUrl?: string;
  publishedAt?: Date;
}

export interface Video extends AuditableEntity {
  topicId: string;
  ideaId: string;
  scriptId: string;
  contentFormatId: string;
  title: string;
  formatSlug: string;
  status: VideoStatus;
  scenes: SceneDirection[];
  estimatedDurationSeconds: number;
  subtitleConfig: SubtitleConfig;
  imageWorkflowConfig: ImageWorkflowConfig;
  voiceoverConfig: VoiceoverConfig;
  renderConfig: RenderConfig;
  publishingConfig: PublishingConfig | null;
}

export interface CreateVideoConceptInput {
  topicId: string;
  ideaId: string;
  scriptId: string;
  contentFormatId: string;
  formatSlug: string;
  title: string;
  scenes: SceneDirection[];
  estimatedDurationSeconds?: number;
  subtitleConfig?: SubtitleConfig;
  imageWorkflowConfig?: ImageWorkflowConfig;
  voiceoverConfig?: VoiceoverConfig;
  renderConfig?: RenderConfig;
  publishingConfig?: PublishingConfig | null;
}

const sumSceneDuration = (scenes: SceneDirection[]): number => {
  return scenes.reduce((total, scene) => total + scene.estimatedDurationSeconds, 0);
};

export const createDefaultSubtitleConfig = (
  contentFormat?: ContentFormat
): SubtitleConfig => {
  if (contentFormat) {
    return createSubtitleConfigFromPolicy(contentFormat.deliveryOptions.subtitle);
  }

  return normalizeSubtitleConfig({
    enabled: true,
    mode: "phrase_highlight",
    stylePreset: "clean-bold",
    maxWordsPerLine: 5,
    position: "bottom",
    highlightKeywords: true
  });
};

export const createDefaultImageWorkflowConfig = (
  contentFormat?: ContentFormat
): ImageWorkflowConfig => {
  if (contentFormat) {
    return normalizeImageWorkflowConfig({
      mode: contentFormat.deliveryOptions.imageWorkflow.defaultMode,
      provider: contentFormat.deliveryOptions.imageWorkflow.defaultProvider,
      requiresPromptApproval: contentFormat.deliveryOptions.imageWorkflow.requiresPromptApproval
    });
  }

  return normalizeImageWorkflowConfig({
    mode: "manual_first",
    provider: "banana",
    requiresPromptApproval: true
  });
};

export const createDefaultVoiceoverConfig = (
  contentFormat?: ContentFormat
): VoiceoverConfig => {
  if (contentFormat) {
    return normalizeVoiceoverConfig({
      provider: contentFormat.deliveryOptions.voice.defaultProvider,
      generationMode: contentFormat.deliveryOptions.voice.defaultGenerationMode,
      styleNotes: []
    });
  }

  return normalizeVoiceoverConfig({
    provider: "none",
    generationMode: "scene_per_line",
    styleNotes: []
  });
};

export const createDefaultRenderConfig = (contentFormat?: ContentFormat): RenderConfig => {
  if (contentFormat) {
  return normalizeRenderConfig({
    provider: contentFormat.deliveryOptions.render.defaultProvider,
    targetPlatform: contentFormat.deliveryOptions.render.defaultTargetPlatform,
    templateSlug: contentFormat.deliveryOptions.render.defaultTemplateSlug,
    aspectRatio: contentFormat.deliveryOptions.render.aspectRatio,
      resolution: contentFormat.deliveryOptions.render.resolution,
      subtitleBurnIn: contentFormat.deliveryOptions.render.subtitleBurnInByDefault
    });
  }

  return normalizeRenderConfig({
    provider: "template",
    targetPlatform: "tiktok",
    templateSlug: "clean_vertical",
    aspectRatio: "9:16",
    resolution: "1080x1920",
    subtitleBurnIn: true
  });
};

export const createVideoConcept = (input: CreateVideoConceptInput): Video => {
  const timestamp = now();

  if (input.scenes.length === 0) {
    throw new DomainError("video.scenes must contain at least one scene.");
  }

  return {
    id: createEntityId("video"),
    topicId: input.topicId,
    ideaId: input.ideaId,
    scriptId: input.scriptId,
    contentFormatId: input.contentFormatId,
    formatSlug: ensureNonEmptyString(input.formatSlug, "video.formatSlug"),
    title: ensureNonEmptyString(input.title, "video.title"),
    status: "script_ready",
    scenes: [...input.scenes],
    estimatedDurationSeconds:
      input.estimatedDurationSeconds === undefined
        ? sumSceneDuration(input.scenes)
        : ensurePositiveInteger(input.estimatedDurationSeconds, "video.estimatedDurationSeconds"),
    subtitleConfig: normalizeSubtitleConfig(
      input.subtitleConfig ?? createDefaultSubtitleConfig()
    ),
    imageWorkflowConfig: normalizeImageWorkflowConfig(
      input.imageWorkflowConfig ?? createDefaultImageWorkflowConfig()
    ),
    voiceoverConfig: normalizeVoiceoverConfig(
      input.voiceoverConfig ?? createDefaultVoiceoverConfig()
    ),
    renderConfig: normalizeRenderConfig(input.renderConfig ?? createDefaultRenderConfig()),
    publishingConfig: input.publishingConfig ?? null,
    createdAt: timestamp,
    updatedAt: timestamp
  };
};

export const updateVideoStatus = (video: Video, status: VideoStatus): Video => {
  if (video.status === "published" && status !== "published") {
    throw new InvalidStateError(`Video "${video.id}" is already published and cannot transition backward.`, {
      videoId: video.id,
      currentStatus: video.status,
      nextStatus: status
    });
  }

  if (video.status === "failed" && status === "idea_created") {
    throw new InvalidStateError(`Video "${video.id}" cannot reset from failed to idea_created.`, {
      videoId: video.id,
      currentStatus: video.status,
      nextStatus: status
    });
  }

  return {
    ...video,
    status,
    updatedAt: now()
  };
};

export const updateVideoPublishingConfig = (
  video: Video,
  publishingConfig: PublishingConfig | null
): Video => {
  return {
    ...video,
    publishingConfig,
    updatedAt: now()
  };
};

export const updateVideoVoiceoverConfig = (
  video: Video,
  voiceoverConfig: VoiceoverConfig
): Video => {
  return {
    ...video,
    voiceoverConfig: normalizeVoiceoverConfig(voiceoverConfig),
    updatedAt: now()
  };
};

export const resolveVideoSceneSubtitleConfig = (
  video: Video,
  scene: SceneDirection
): SubtitleConfig => {
  return resolveSceneSubtitleConfig(video.subtitleConfig, scene.subtitleConfig);
};
