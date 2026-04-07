import {
  DomainError,
  ensureNonEmptyString,
  ensurePositiveInteger
} from "./entity";
import type {
  ImageGenerationProvider,
  PublishingProvider,
  RenderProvider,
  VoiceoverProvider
} from "./providers";
import { isRenderProvider, renderProviders } from "./providers";

export const subtitleModes = ["off", "sentence", "phrase_highlight", "word_karaoke"] as const;
export type SubtitleMode = (typeof subtitleModes)[number];
export const subtitlePositions = ["bottom", "center"] as const;
export type SubtitlePosition = (typeof subtitlePositions)[number];

export const voiceGenerationModes = ["scene_per_line", "merged_narration"] as const;
export type VoiceGenerationMode = (typeof voiceGenerationModes)[number];

export const imageWorkflowModes = ["manual_first", "provider_first"] as const;
export type ImageWorkflowMode = (typeof imageWorkflowModes)[number];

export const publishModes = ["manual", "semi_auto", "full_auto"] as const;
export type PublishMode = (typeof publishModes)[number];

export interface SubtitlePolicy {
  enabledByDefault: boolean;
  supportedModes: SubtitleMode[];
  defaultMode: SubtitleMode;
  allowVideoOverride: boolean;
  allowSceneOverride: boolean;
  defaultStylePreset: string;
  defaultMaxWordsPerLine: number;
  defaultPosition: SubtitlePosition;
  highlightKeywordsByDefault: boolean;
}

export interface ImageWorkflowPolicy {
  defaultMode: ImageWorkflowMode;
  defaultProvider: ImageGenerationProvider;
  providerSlugs: ImageGenerationProvider[];
  requiresPromptApproval: boolean;
}

export interface VoiceWorkflowPolicy {
  defaultProvider: VoiceoverProvider;
  providerSlugs: VoiceoverProvider[];
  defaultGenerationMode: VoiceGenerationMode;
  generationModes: VoiceGenerationMode[];
  voiceStyle: string;
}

export interface RenderPolicy {
  defaultProvider: RenderProvider;
  providerSlugs: RenderProvider[];
  defaultTargetPlatform: string;
  defaultTemplateSlug: string;
  templateSlugs: string[];
  aspectRatio: string;
  resolution: string;
  subtitleBurnInByDefault: boolean;
  visualStyle: string;
  musicStyle?: string;
  overlayStyle?: string;
  defaultTransitionStyle?: string;
  defaultCaptionStyle?: string;
}

export interface PublishingPolicy {
  platformSlugs: string[];
  providerSlugs: PublishingProvider[];
  defaultProvider: PublishingProvider;
  supportedModes: PublishMode[];
  defaultMode: PublishMode;
  defaultCtaStyle?: string;
}

export interface SubtitleConfig {
  enabled: boolean;
  mode: SubtitleMode;
  stylePreset: string;
  maxWordsPerLine: number;
  position: SubtitlePosition;
  highlightKeywords: boolean;
}

export interface SceneSubtitleConfigOverride {
  enabled: boolean;
  mode: SubtitleMode;
}

export interface ImageWorkflowConfig {
  mode: ImageWorkflowMode;
  provider: ImageGenerationProvider;
  requiresPromptApproval: boolean;
}

export interface VoiceoverConfig {
  provider: VoiceoverProvider;
  generationMode: VoiceGenerationMode;
  voiceId?: string;
  styleNotes: string[];
}

export interface RenderConfig {
  provider: RenderProvider;
  targetPlatform: string;
  templateSlug: string;
  aspectRatio: string;
  resolution: string;
  subtitleBurnIn: boolean;
}

export const isSubtitleMode = (value: string): value is SubtitleMode => {
  return (subtitleModes as readonly string[]).includes(value);
};

export const isSubtitlePosition = (value: string): value is SubtitlePosition => {
  return (subtitlePositions as readonly string[]).includes(value);
};

export const isVoiceGenerationMode = (value: string): value is VoiceGenerationMode => {
  return (voiceGenerationModes as readonly string[]).includes(value);
};

export const isImageWorkflowMode = (value: string): value is ImageWorkflowMode => {
  return (imageWorkflowModes as readonly string[]).includes(value);
};

export const isPublishMode = (value: string): value is PublishMode => {
  return (publishModes as readonly string[]).includes(value);
};

export const normalizeSubtitleMode = (value: string, fieldName: string): SubtitleMode => {
  if (!isSubtitleMode(value)) {
    throw new DomainError(
      `${fieldName} must be one of: ${subtitleModes.join(", ")}.`
    );
  }

  return value;
};

export const normalizeVoiceGenerationMode = (
  value: string,
  fieldName: string
): VoiceGenerationMode => {
  if (!isVoiceGenerationMode(value)) {
    throw new DomainError(
      `${fieldName} must be one of: ${voiceGenerationModes.join(", ")}.`
    );
  }

  return value;
};

export const normalizeImageWorkflowMode = (
  value: string,
  fieldName: string
): ImageWorkflowMode => {
  if (!isImageWorkflowMode(value)) {
    throw new DomainError(
      `${fieldName} must be one of: ${imageWorkflowModes.join(", ")}.`
    );
  }

  return value;
};

export const normalizePublishMode = (
  value: string,
  fieldName: string
): PublishMode => {
  if (!isPublishMode(value)) {
    throw new DomainError(
      `${fieldName} must be one of: ${publishModes.join(", ")}.`
    );
  }

  return value;
};

export const normalizeSubtitleConfig = (
  config: SubtitleConfig,
  fieldPrefix: string = "subtitleConfig"
): SubtitleConfig => {
  const mode = normalizeSubtitleMode(config.mode, `${fieldPrefix}.mode`);
  const enabled = config.enabled && mode !== "off";
  const position = isSubtitlePosition(config.position)
    ? config.position
    : (() => {
        throw new DomainError(`${fieldPrefix}.position must be one of: ${subtitlePositions.join(", ")}.`);
      })();

  return {
    enabled,
    mode: enabled ? mode : "off",
    stylePreset: ensureNonEmptyString(config.stylePreset, `${fieldPrefix}.stylePreset`),
    maxWordsPerLine: ensurePositiveInteger(
      config.maxWordsPerLine,
      `${fieldPrefix}.maxWordsPerLine`
    ),
    position,
    highlightKeywords: config.highlightKeywords
  };
};

export const createSubtitleConfigFromPolicy = (
  policy: SubtitlePolicy
): SubtitleConfig => {
  const enabled = policy.enabledByDefault && policy.defaultMode !== "off";

  return normalizeSubtitleConfig({
    enabled,
    mode: enabled ? policy.defaultMode : "off",
    stylePreset: policy.defaultStylePreset,
    maxWordsPerLine: policy.defaultMaxWordsPerLine,
    position: policy.defaultPosition,
    highlightKeywords: policy.highlightKeywordsByDefault
  });
};

export const normalizeSceneSubtitleConfigOverride = (
  override: SceneSubtitleConfigOverride,
  fieldPrefix: string = "scene.subtitleConfig"
): SceneSubtitleConfigOverride => {
  const mode = normalizeSubtitleMode(override.mode, `${fieldPrefix}.mode`);
  const enabled = override.enabled && mode !== "off";

  return {
    enabled,
    mode: enabled ? mode : "off"
  };
};

export const resolveSceneSubtitleConfig = (
  videoConfig: SubtitleConfig,
  override?: SceneSubtitleConfigOverride | null
): SubtitleConfig => {
  if (!override) {
    return normalizeSubtitleConfig(videoConfig);
  }

  return normalizeSubtitleConfig({
    ...videoConfig,
    enabled: override.enabled,
    mode: override.mode
  });
};

export const normalizeRenderConfig = (
  config: RenderConfig,
  fieldPrefix: string = "renderConfig"
): RenderConfig => {
  if (!isRenderProvider(config.provider)) {
    throw new DomainError(
      `${fieldPrefix}.provider must be one of: ${renderProviders.join(", ")}.`
    );
  }

  return {
    provider: config.provider,
    targetPlatform: ensureNonEmptyString(config.targetPlatform, `${fieldPrefix}.targetPlatform`),
    templateSlug: ensureNonEmptyString(config.templateSlug, `${fieldPrefix}.templateSlug`),
    aspectRatio: ensureNonEmptyString(config.aspectRatio, `${fieldPrefix}.aspectRatio`),
    resolution: ensureNonEmptyString(config.resolution, `${fieldPrefix}.resolution`),
    subtitleBurnIn: config.subtitleBurnIn
  };
};

export const normalizeVoiceoverConfig = (
  config: VoiceoverConfig,
  fieldPrefix: string = "voiceoverConfig"
): VoiceoverConfig => {
  return {
    provider: config.provider,
    generationMode: normalizeVoiceGenerationMode(
      config.generationMode,
      `${fieldPrefix}.generationMode`
    ),
    ...(config.voiceId
      ? {
          voiceId: ensureNonEmptyString(config.voiceId, `${fieldPrefix}.voiceId`)
        }
      : {}),
    styleNotes: config.styleNotes.map((note) =>
      ensureNonEmptyString(note, `${fieldPrefix}.styleNotes`)
    )
  };
};

export const normalizeImageWorkflowConfig = (
  config: ImageWorkflowConfig,
  fieldPrefix: string = "imageWorkflowConfig"
): ImageWorkflowConfig => {
  return {
    mode: normalizeImageWorkflowMode(config.mode, `${fieldPrefix}.mode`),
    provider: config.provider,
    requiresPromptApproval: config.requiresPromptApproval
  };
};
