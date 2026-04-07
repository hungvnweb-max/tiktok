import {
  DomainError,
  createEntityId,
  dedupeSlugs,
  ensureNonEmptyString,
  ensurePositiveInteger,
  now,
  normalizeSlug,
  type AuditableEntity
} from "../common/entity";
import {
  normalizeImageWorkflowMode,
  normalizePublishMode,
  normalizeSubtitleMode,
  normalizeVoiceGenerationMode,
  type ImageWorkflowPolicy,
  type PublishMode,
  type PublishingPolicy,
  type RenderPolicy,
  type SubtitlePolicy,
  type VoiceWorkflowPolicy
} from "../common/media";
import type {
  ImageGenerationProvider,
  PublishingProvider,
  RenderProvider,
  VoiceoverProvider
} from "../common/providers";
import type { SceneRole } from "../video/scene";

export type ContentFormatStatus = "active" | "deprecated";
export type ContentPacing = "fast" | "moderate" | "experimental";

export interface IntegerRange {
  min: number;
  max: number;
}

export interface ContentFormatCapabilities {
  supportsImagePrompts: boolean;
  supportsVoiceover: boolean;
  supportsSubtitleConfig: boolean;
  supportsRenderJobs: boolean;
  supportsPublishing: boolean;
  supportsScheduling: boolean;
  supportsVersioning: boolean;
  supportsCostTracking: boolean;
}

export interface ContentFormatDeliveryOptions {
  subtitle: SubtitlePolicy;
  imageWorkflow: ImageWorkflowPolicy;
  voice: VoiceWorkflowPolicy;
  render: RenderPolicy;
  publishing: PublishingPolicy;
}

export interface ContentFormatSceneRolePlan {
  firstSceneRole: SceneRole;
  middleSceneRoles: SceneRole[];
  lastSceneRole: SceneRole;
}

export interface ContentFormatSceneDeliverables {
  imagesPerScene: number;
  voiceLinesPerScene: number;
  overlayTextsPerScene: number;
}

export interface ContentFormatStructure {
  contentType: string;
  sceneCountRange: IntegerRange;
  durationSecondsRange: IntegerRange;
  voiceLineWordsRange: IntegerRange;
  hookRequired: boolean;
  ctaRequired: boolean;
  sceneRolePlan: ContentFormatSceneRolePlan;
  suggestedSceneStructure: string[];
  sceneDeliverables: ContentFormatSceneDeliverables;
  pacing: ContentPacing;
  recommendedHookSeconds: number;
}

export interface ContentFormat extends AuditableEntity {
  slug: string;
  name: string;
  description: string;
  objective: string;
  defaultDurationSeconds: number;
  defaultSceneCount: number;
  promptGuidance: string[];
  structure: ContentFormatStructure;
  deliveryOptions: ContentFormatDeliveryOptions;
  capabilities: ContentFormatCapabilities;
  status: ContentFormatStatus;
}

export interface CreateContentFormatInput {
  slug: string;
  name: string;
  description: string;
  objective: string;
  defaultDurationSeconds: number;
  defaultSceneCount: number;
  promptGuidance: string[];
  structure: ContentFormatStructure;
  deliveryOptions: ContentFormatDeliveryOptions;
  capabilities?: ContentFormatCapabilities;
  status?: ContentFormatStatus;
}

export const createContentFormat = (input: CreateContentFormatInput): ContentFormat => {
  const timestamp = now();
  const middleSceneRoles = [...input.structure.sceneRolePlan.middleSceneRoles];
  const defaultSceneCount = ensurePositiveInteger(
    input.defaultSceneCount,
    "contentFormat.defaultSceneCount"
  );
  const defaultDurationSeconds = ensurePositiveInteger(
    input.defaultDurationSeconds,
    "contentFormat.defaultDurationSeconds"
  );
  const sceneCountRange = {
    min: ensurePositiveInteger(input.structure.sceneCountRange.min, "contentFormat.structure.sceneCountRange.min"),
    max: ensurePositiveInteger(input.structure.sceneCountRange.max, "contentFormat.structure.sceneCountRange.max")
  };
  const durationSecondsRange = {
    min: ensurePositiveInteger(
      input.structure.durationSecondsRange.min,
      "contentFormat.structure.durationSecondsRange.min"
    ),
    max: ensurePositiveInteger(
      input.structure.durationSecondsRange.max,
      "contentFormat.structure.durationSecondsRange.max"
    )
  };
  const voiceLineWordsRange = {
    min: ensurePositiveInteger(
      input.structure.voiceLineWordsRange.min,
      "contentFormat.structure.voiceLineWordsRange.min"
    ),
    max: ensurePositiveInteger(
      input.structure.voiceLineWordsRange.max,
      "contentFormat.structure.voiceLineWordsRange.max"
    )
  };

  if (sceneCountRange.min > sceneCountRange.max) {
    throw new DomainError("contentFormat.structure.sceneCountRange.min must be <= max.");
  }

  if (durationSecondsRange.min > durationSecondsRange.max) {
    throw new DomainError("contentFormat.structure.durationSecondsRange.min must be <= max.");
  }

  if (voiceLineWordsRange.min > voiceLineWordsRange.max) {
    throw new DomainError("contentFormat.structure.voiceLineWordsRange.min must be <= max.");
  }

  if (defaultSceneCount < sceneCountRange.min || defaultSceneCount > sceneCountRange.max) {
    throw new DomainError("contentFormat.defaultSceneCount must be within structure.sceneCountRange.");
  }

  if (defaultDurationSeconds < durationSecondsRange.min || defaultDurationSeconds > durationSecondsRange.max) {
    throw new DomainError(
      "contentFormat.defaultDurationSeconds must be within structure.durationSecondsRange."
    );
  }

  if (defaultSceneCount < 2) {
    throw new DomainError("contentFormat.defaultSceneCount must be at least 2.");
  }

  if (middleSceneRoles.length === 0) {
    throw new DomainError("contentFormat.structure.sceneRolePlan.middleSceneRoles must have at least one item.");
  }

  const suggestedSceneStructure = input.structure.suggestedSceneStructure.map((item) =>
    ensureNonEmptyString(item, "contentFormat.structure.suggestedSceneStructure")
  );

  if (suggestedSceneStructure.length === 0) {
    throw new DomainError("contentFormat.structure.suggestedSceneStructure must have at least one item.");
  }

  const supportedSubtitleModes = [...new Set(
    input.deliveryOptions.subtitle.supportedModes.map((value) =>
      normalizeSubtitleMode(value, "contentFormat.deliveryOptions.subtitle.supportedModes")
    )
  )];
  const imageProviderSlugs = dedupeSlugs(
    input.deliveryOptions.imageWorkflow.providerSlugs as unknown as string[]
  ) as ImageGenerationProvider[];
  const voiceProviderSlugs = dedupeSlugs(
    input.deliveryOptions.voice.providerSlugs as unknown as string[]
  ) as VoiceoverProvider[];
  const renderProviderSlugs = dedupeSlugs(
    input.deliveryOptions.render.providerSlugs as unknown as string[]
  ) as RenderProvider[];
  const voiceGenerationModes = [...new Set(
    input.deliveryOptions.voice.generationModes.map((value) =>
      normalizeVoiceGenerationMode(value, "contentFormat.deliveryOptions.voice.generationModes")
    )
  )];
  const templateSlugs = dedupeSlugs(input.deliveryOptions.render.templateSlugs);
  const publishingPlatformSlugs = dedupeSlugs(input.deliveryOptions.publishing.platformSlugs);
  const publishingProviderSlugs = dedupeSlugs(
    input.deliveryOptions.publishing.providerSlugs as unknown as string[]
  ) as PublishingProvider[];
  const publishingModes = [...new Set(
    input.deliveryOptions.publishing.supportedModes.map((value) =>
      normalizePublishMode(value, "contentFormat.deliveryOptions.publishing.supportedModes")
    )
  )] as PublishMode[];

  if (
    supportedSubtitleModes.length === 0 ||
    imageProviderSlugs.length === 0 ||
    voiceProviderSlugs.length === 0 ||
    renderProviderSlugs.length === 0 ||
    voiceGenerationModes.length === 0 ||
    templateSlugs.length === 0 ||
    publishingPlatformSlugs.length === 0 ||
    publishingProviderSlugs.length === 0 ||
    publishingModes.length === 0
  ) {
    throw new DomainError("contentFormat.deliveryOptions must define at least one option for each delivery channel.");
  }

  const defaultSubtitleMode = normalizeSubtitleMode(
    input.deliveryOptions.subtitle.defaultMode,
    "contentFormat.deliveryOptions.subtitle.defaultMode"
  );

  if (!supportedSubtitleModes.includes(defaultSubtitleMode)) {
    throw new DomainError("contentFormat.deliveryOptions.subtitle.defaultMode must be in supportedModes.");
  }

  if (
    input.deliveryOptions.subtitle.enabledByDefault &&
    defaultSubtitleMode === "off"
  ) {
    throw new DomainError(
      "contentFormat.deliveryOptions.subtitle.defaultMode cannot be off when subtitles are enabled by default."
    );
  }

  if (!supportedSubtitleModes.includes("off")) {
    throw new DomainError(
      'contentFormat.deliveryOptions.subtitle.supportedModes must include "off" for disable support.'
    );
  }

  const defaultImageWorkflowMode = normalizeImageWorkflowMode(
    input.deliveryOptions.imageWorkflow.defaultMode,
    "contentFormat.deliveryOptions.imageWorkflow.defaultMode"
  );
  const defaultVoiceGenerationMode = normalizeVoiceGenerationMode(
    input.deliveryOptions.voice.defaultGenerationMode,
    "contentFormat.deliveryOptions.voice.defaultGenerationMode"
  );

  if (!imageProviderSlugs.includes(input.deliveryOptions.imageWorkflow.defaultProvider)) {
    throw new DomainError(
      "contentFormat.deliveryOptions.imageWorkflow.defaultProvider must be in providerSlugs."
    );
  }

  if (!voiceProviderSlugs.includes(input.deliveryOptions.voice.defaultProvider)) {
    throw new DomainError(
      "contentFormat.deliveryOptions.voice.defaultProvider must be in providerSlugs."
    );
  }

  if (!renderProviderSlugs.includes(input.deliveryOptions.render.defaultProvider)) {
    throw new DomainError(
      "contentFormat.deliveryOptions.render.defaultProvider must be in providerSlugs."
    );
  }

  if (!voiceGenerationModes.includes(defaultVoiceGenerationMode)) {
    throw new DomainError(
      "contentFormat.deliveryOptions.voice.defaultGenerationMode must be in generationModes."
    );
  }

  const defaultRenderTargetPlatform = normalizeSlug(
    input.deliveryOptions.render.defaultTargetPlatform,
    "contentFormat.deliveryOptions.render.defaultTargetPlatform"
  );
  const defaultTemplateSlug = normalizeSlug(
    input.deliveryOptions.render.defaultTemplateSlug,
    "contentFormat.deliveryOptions.render.defaultTemplateSlug"
  );

  if (!templateSlugs.includes(defaultTemplateSlug)) {
    throw new DomainError(
      "contentFormat.deliveryOptions.render.defaultTemplateSlug must be in templateSlugs."
    );
  }

  if (!publishingPlatformSlugs.includes(defaultRenderTargetPlatform)) {
    throw new DomainError(
      "contentFormat.deliveryOptions.render.defaultTargetPlatform must be in publishing.platformSlugs."
    );
  }

  const defaultPublishingMode = normalizePublishMode(
    input.deliveryOptions.publishing.defaultMode,
    "contentFormat.deliveryOptions.publishing.defaultMode"
  );

  if (!publishingModes.includes(defaultPublishingMode)) {
    throw new DomainError(
      "contentFormat.deliveryOptions.publishing.defaultMode must be in supportedModes."
    );
  }

  if (!publishingProviderSlugs.includes(input.deliveryOptions.publishing.defaultProvider)) {
    throw new DomainError(
      "contentFormat.deliveryOptions.publishing.defaultProvider must be in providerSlugs."
    );
  }

  return {
    id: createEntityId("format"),
    slug: normalizeSlug(input.slug, "contentFormat.slug"),
    name: ensureNonEmptyString(input.name, "contentFormat.name"),
    description: ensureNonEmptyString(input.description, "contentFormat.description"),
    objective: ensureNonEmptyString(input.objective, "contentFormat.objective"),
    defaultDurationSeconds,
    defaultSceneCount,
    promptGuidance: input.promptGuidance.map((item) =>
      ensureNonEmptyString(item, "contentFormat.promptGuidance")
    ),
    structure: {
      contentType: ensureNonEmptyString(
        input.structure.contentType,
        "contentFormat.structure.contentType"
      ),
      sceneCountRange,
      durationSecondsRange,
      voiceLineWordsRange,
      hookRequired: input.structure.hookRequired,
      ctaRequired: input.structure.ctaRequired,
      sceneRolePlan: {
        firstSceneRole: input.structure.sceneRolePlan.firstSceneRole,
        middleSceneRoles,
        lastSceneRole: input.structure.sceneRolePlan.lastSceneRole
      },
      suggestedSceneStructure,
      sceneDeliverables: {
        imagesPerScene: ensurePositiveInteger(
          input.structure.sceneDeliverables.imagesPerScene,
          "contentFormat.structure.sceneDeliverables.imagesPerScene"
        ),
        voiceLinesPerScene: ensurePositiveInteger(
          input.structure.sceneDeliverables.voiceLinesPerScene,
          "contentFormat.structure.sceneDeliverables.voiceLinesPerScene"
        ),
        overlayTextsPerScene: ensurePositiveInteger(
          input.structure.sceneDeliverables.overlayTextsPerScene,
          "contentFormat.structure.sceneDeliverables.overlayTextsPerScene"
        )
      },
      pacing: input.structure.pacing,
      recommendedHookSeconds: ensurePositiveInteger(
        input.structure.recommendedHookSeconds,
        "contentFormat.structure.recommendedHookSeconds"
      )
    },
    deliveryOptions: {
      subtitle: {
        enabledByDefault: input.deliveryOptions.subtitle.enabledByDefault,
        supportedModes: supportedSubtitleModes,
        defaultMode: defaultSubtitleMode,
        allowVideoOverride: input.deliveryOptions.subtitle.allowVideoOverride,
        allowSceneOverride: input.deliveryOptions.subtitle.allowSceneOverride,
        defaultStylePreset: ensureNonEmptyString(
          input.deliveryOptions.subtitle.defaultStylePreset,
          "contentFormat.deliveryOptions.subtitle.defaultStylePreset"
        ),
        defaultMaxWordsPerLine: ensurePositiveInteger(
          input.deliveryOptions.subtitle.defaultMaxWordsPerLine,
          "contentFormat.deliveryOptions.subtitle.defaultMaxWordsPerLine"
        ),
        defaultPosition: input.deliveryOptions.subtitle.defaultPosition,
        highlightKeywordsByDefault: input.deliveryOptions.subtitle.highlightKeywordsByDefault
      },
      imageWorkflow: {
        defaultMode: defaultImageWorkflowMode,
        defaultProvider: input.deliveryOptions.imageWorkflow.defaultProvider,
        providerSlugs: imageProviderSlugs.map((value) =>
          normalizeSlug(value, "contentFormat.deliveryOptions.imageWorkflow.providerSlugs")
        ) as ImageGenerationProvider[],
        requiresPromptApproval: input.deliveryOptions.imageWorkflow.requiresPromptApproval
      },
      voice: {
        defaultProvider: input.deliveryOptions.voice.defaultProvider,
        providerSlugs: voiceProviderSlugs.map((value) =>
          normalizeSlug(value, "contentFormat.deliveryOptions.voice.providerSlugs")
        ) as VoiceoverProvider[],
        defaultGenerationMode: defaultVoiceGenerationMode,
        generationModes: voiceGenerationModes,
        voiceStyle: ensureNonEmptyString(
          input.deliveryOptions.voice.voiceStyle,
          "contentFormat.deliveryOptions.voice.voiceStyle"
        )
      },
      render: {
        defaultProvider: input.deliveryOptions.render.defaultProvider,
        providerSlugs: renderProviderSlugs.map((value) =>
          normalizeSlug(value, "contentFormat.deliveryOptions.render.providerSlugs")
        ) as RenderProvider[],
        defaultTargetPlatform: defaultRenderTargetPlatform,
        defaultTemplateSlug,
        templateSlugs: templateSlugs.map((value) =>
          normalizeSlug(value, "contentFormat.deliveryOptions.render.templateSlugs")
        ),
        aspectRatio: ensureNonEmptyString(
          input.deliveryOptions.render.aspectRatio,
          "contentFormat.deliveryOptions.render.aspectRatio"
        ),
        resolution: ensureNonEmptyString(
          input.deliveryOptions.render.resolution,
          "contentFormat.deliveryOptions.render.resolution"
        ),
        subtitleBurnInByDefault: input.deliveryOptions.render.subtitleBurnInByDefault,
        visualStyle: ensureNonEmptyString(
          input.deliveryOptions.render.visualStyle,
          "contentFormat.deliveryOptions.render.visualStyle"
        ),
        ...(input.deliveryOptions.render.musicStyle
          ? {
              musicStyle: ensureNonEmptyString(
                input.deliveryOptions.render.musicStyle,
                "contentFormat.deliveryOptions.render.musicStyle"
              )
            }
          : {}),
        ...(input.deliveryOptions.render.overlayStyle
          ? {
              overlayStyle: ensureNonEmptyString(
                input.deliveryOptions.render.overlayStyle,
                "contentFormat.deliveryOptions.render.overlayStyle"
              )
            }
          : {}),
        ...(input.deliveryOptions.render.defaultTransitionStyle
          ? {
              defaultTransitionStyle: ensureNonEmptyString(
                input.deliveryOptions.render.defaultTransitionStyle,
                "contentFormat.deliveryOptions.render.defaultTransitionStyle"
              )
            }
          : {}),
        ...(input.deliveryOptions.render.defaultCaptionStyle
          ? {
              defaultCaptionStyle: ensureNonEmptyString(
                input.deliveryOptions.render.defaultCaptionStyle,
                "contentFormat.deliveryOptions.render.defaultCaptionStyle"
              )
            }
          : {})
      },
      publishing: {
        platformSlugs: publishingPlatformSlugs.map((value) =>
          normalizeSlug(value, "contentFormat.deliveryOptions.publishing.platformSlugs")
        ),
        providerSlugs: publishingProviderSlugs.map((value) =>
          normalizeSlug(value, "contentFormat.deliveryOptions.publishing.providerSlugs")
        ) as PublishingProvider[],
        defaultProvider: input.deliveryOptions.publishing.defaultProvider,
        supportedModes: publishingModes,
        defaultMode: defaultPublishingMode,
        ...(input.deliveryOptions.publishing.defaultCtaStyle
          ? {
              defaultCtaStyle: ensureNonEmptyString(
                input.deliveryOptions.publishing.defaultCtaStyle,
                "contentFormat.deliveryOptions.publishing.defaultCtaStyle"
              )
            }
          : {})
      }
    },
    capabilities: input.capabilities ?? {
      supportsImagePrompts: true,
      supportsVoiceover: true,
      supportsSubtitleConfig: true,
      supportsRenderJobs: true,
      supportsPublishing: true,
      supportsScheduling: true,
      supportsVersioning: true,
      supportsCostTracking: true
    },
    status: input.status ?? "active",
    createdAt: timestamp,
    updatedAt: timestamp
  };
};

export const isContentFormatActive = (contentFormat: ContentFormat): boolean => {
  return contentFormat.status === "active";
};

export const buildSceneRolesForCount = (
  contentFormat: ContentFormat,
  sceneCount: number = contentFormat.defaultSceneCount
): SceneRole[] => {
  if (sceneCount < 2) {
    throw new DomainError("sceneCount must be at least 2.");
  }

  if (
    sceneCount < contentFormat.structure.sceneCountRange.min ||
    sceneCount > contentFormat.structure.sceneCountRange.max
  ) {
    throw new DomainError("sceneCount is outside the content format sceneCountRange.");
  }

  const middleSceneCount = sceneCount - 2;
  const middleSceneRoles = Array.from({ length: middleSceneCount }, (_, index) => {
    return contentFormat.structure.sceneRolePlan.middleSceneRoles[
      index % contentFormat.structure.sceneRolePlan.middleSceneRoles.length
    ]!;
  });

  return [
    contentFormat.structure.sceneRolePlan.firstSceneRole,
    ...middleSceneRoles,
    contentFormat.structure.sceneRolePlan.lastSceneRole
  ];
};
