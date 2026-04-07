import {
  type ContentFormat,
  type ContentFormatCapabilities,
  type ContentFormatDeliveryOptions,
  isPublishMode,
  type ContentFormatStructure,
  type SubtitleMode,
  isImageWorkflowMode,
  type SceneRole,
  isSubtitleMode,
  isVoiceGenerationMode,
  type Topic
} from "@videotik/core";
import {
  Prisma,
  type ContentFormat as PrismaContentFormatRecord,
  ContentFormatStatus as PrismaContentFormatStatus,
  type Topic as PrismaTopicRecord,
  TopicStatus as PrismaTopicStatus
} from "@prisma/client";

type PrismaContentFormatRow = PrismaContentFormatRecord & {
  deliveryOptions: Prisma.JsonValue;
};

class PersistenceMappingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PersistenceMappingError";
  }
}

const isStringArray = (value: Prisma.JsonValue | undefined): value is string[] => {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
};

const readStringArray = (value: Prisma.JsonValue | undefined, fieldName: string): string[] => {
  if (!isStringArray(value)) {
    throw new PersistenceMappingError(`${fieldName} must be a JSON string array.`);
  }

  return [...value];
};

const isRecord = (value: Prisma.JsonValue | undefined): value is Record<string, Prisma.JsonValue> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const isSceneRole = (value: string): value is SceneRole => {
  return (
    value === "hook" ||
    value === "setup" ||
    value === "body" ||
    value === "proof" ||
    value === "twist" ||
    value === "payoff" ||
    value === "cta"
  );
};

const readPositiveInteger = (value: Prisma.JsonValue | undefined, fieldName: string): number => {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new PersistenceMappingError(`${fieldName} must be a positive integer.`);
  }

  return value;
};

const readIntegerRange = (
  value: Prisma.JsonValue | undefined,
  fieldName: string
): { min: number; max: number } => {
  if (!isRecord(value)) {
    throw new PersistenceMappingError(`${fieldName} must be a JSON object.`);
  }

  const min = readPositiveInteger(value.min, `${fieldName}.min`);
  const max = readPositiveInteger(value.max, `${fieldName}.max`);

  if (min > max) {
    throw new PersistenceMappingError(`${fieldName}.min must be <= ${fieldName}.max.`);
  }

  return {
    min,
    max
  };
};

const readContentFormatStructure = (
  value: Prisma.JsonValue | undefined
): ContentFormatStructure => {
  if (!isRecord(value)) {
    throw new PersistenceMappingError("contentFormat.structure must be a JSON object.");
  }

  const sceneCountRange = readIntegerRange(value.sceneCountRange, "contentFormat.structure.sceneCountRange");
  const durationSecondsRange = readIntegerRange(
    value.durationSecondsRange,
    "contentFormat.structure.durationSecondsRange"
  );
  const voiceLineWordsRange = readIntegerRange(
    value.voiceLineWordsRange,
    "contentFormat.structure.voiceLineWordsRange"
  );

  if (!isRecord(value.sceneRolePlan)) {
    throw new PersistenceMappingError("contentFormat.structure.sceneRolePlan must be a JSON object.");
  }

  const firstSceneRole = value.sceneRolePlan.firstSceneRole;
  const middleSceneRoles = value.sceneRolePlan.middleSceneRoles;
  const lastSceneRole = value.sceneRolePlan.lastSceneRole;

  if (typeof firstSceneRole !== "string" || !isSceneRole(firstSceneRole)) {
    throw new PersistenceMappingError(
      "contentFormat.structure.sceneRolePlan.firstSceneRole must be a valid scene role."
    );
  }

  if (
    !Array.isArray(middleSceneRoles) ||
    !middleSceneRoles.every((item) => typeof item === "string" && isSceneRole(item))
  ) {
    throw new PersistenceMappingError(
      "contentFormat.structure.sceneRolePlan.middleSceneRoles must be an array of valid scene roles."
    );
  }

  if (typeof lastSceneRole !== "string" || !isSceneRole(lastSceneRole)) {
    throw new PersistenceMappingError(
      "contentFormat.structure.sceneRolePlan.lastSceneRole must be a valid scene role."
    );
  }

  if (!isRecord(value.sceneDeliverables)) {
    throw new PersistenceMappingError("contentFormat.structure.sceneDeliverables must be a JSON object.");
  }

  const suggestedSceneStructure = readStringArray(
    value.suggestedSceneStructure,
    "contentFormat.structure.suggestedSceneStructure"
  );

  const pacingValue = value.pacing;
  const recommendedHookSeconds = readPositiveInteger(
    value.recommendedHookSeconds,
    "contentFormat.structure.recommendedHookSeconds"
  );

  if (
    pacingValue !== "fast" &&
    pacingValue !== "moderate" &&
    pacingValue !== "experimental"
  ) {
    throw new PersistenceMappingError(
      "contentFormat.structure.pacing must be fast, moderate, or experimental."
    );
  }

  return {
    contentType:
      typeof value.contentType === "string"
        ? value.contentType
        : (() => {
            throw new PersistenceMappingError(
              "contentFormat.structure.contentType must be a string."
            );
          })(),
    sceneCountRange,
    durationSecondsRange,
    voiceLineWordsRange,
    hookRequired:
      value.hookRequired === true
        ? true
        : value.hookRequired === false
          ? false
          : (() => {
              throw new PersistenceMappingError(
                "contentFormat.structure.hookRequired must be a boolean."
              );
            })(),
    ctaRequired:
      value.ctaRequired === true
        ? true
        : value.ctaRequired === false
          ? false
          : (() => {
              throw new PersistenceMappingError(
                "contentFormat.structure.ctaRequired must be a boolean."
              );
            })(),
    sceneRolePlan: {
      firstSceneRole,
      middleSceneRoles: [...middleSceneRoles],
      lastSceneRole
    },
    suggestedSceneStructure,
    sceneDeliverables: {
      imagesPerScene: readPositiveInteger(
        value.sceneDeliverables.imagesPerScene,
        "contentFormat.structure.sceneDeliverables.imagesPerScene"
      ),
      voiceLinesPerScene: readPositiveInteger(
        value.sceneDeliverables.voiceLinesPerScene,
        "contentFormat.structure.sceneDeliverables.voiceLinesPerScene"
      ),
      overlayTextsPerScene: readPositiveInteger(
        value.sceneDeliverables.overlayTextsPerScene,
        "contentFormat.structure.sceneDeliverables.overlayTextsPerScene"
      )
    },
    pacing: pacingValue,
    recommendedHookSeconds
  };
};

const readContentFormatDeliveryOptions = (
  value: Prisma.JsonValue | undefined
): ContentFormatDeliveryOptions => {
  if (!isRecord(value)) {
    throw new PersistenceMappingError("contentFormat.deliveryOptions must be a JSON object.");
  }

  if (!isRecord(value.subtitle)) {
    throw new PersistenceMappingError("contentFormat.deliveryOptions.subtitle must be a JSON object.");
  }

  if (!isRecord(value.imageWorkflow)) {
    throw new PersistenceMappingError("contentFormat.deliveryOptions.imageWorkflow must be a JSON object.");
  }

  if (!isRecord(value.voice)) {
    throw new PersistenceMappingError("contentFormat.deliveryOptions.voice must be a JSON object.");
  }

  if (!isRecord(value.render)) {
    throw new PersistenceMappingError("contentFormat.deliveryOptions.render must be a JSON object.");
  }

  if (!isRecord(value.publishing)) {
    throw new PersistenceMappingError("contentFormat.deliveryOptions.publishing must be a JSON object.");
  }

  const subtitleModes = readStringArray(
    value.subtitle.supportedModes,
    "contentFormat.deliveryOptions.subtitle.supportedModes"
  );

  if (!subtitleModes.every((item) => isSubtitleMode(item))) {
    throw new PersistenceMappingError(
      "contentFormat.deliveryOptions.subtitle.supportedModes must contain valid subtitle modes."
    );
  }

  const voiceGenerationModes = readStringArray(
    value.voice.generationModes,
    "contentFormat.deliveryOptions.voice.generationModes"
  );
  const publishModes = readStringArray(
    value.publishing.supportedModes,
    "contentFormat.deliveryOptions.publishing.supportedModes"
  );

  if (!voiceGenerationModes.every((item) => isVoiceGenerationMode(item))) {
    throw new PersistenceMappingError(
      "contentFormat.deliveryOptions.voice.generationModes must contain valid voice generation modes."
    );
  }

  if (!publishModes.every((item) => isPublishMode(item))) {
    throw new PersistenceMappingError(
      "contentFormat.deliveryOptions.publishing.supportedModes must contain valid publish modes."
    );
  }

  if (
    typeof value.imageWorkflow.defaultMode !== "string" ||
    !isImageWorkflowMode(value.imageWorkflow.defaultMode)
  ) {
    throw new PersistenceMappingError(
      "contentFormat.deliveryOptions.imageWorkflow.defaultMode must be a valid image workflow mode."
    );
  }

  if (
    typeof value.subtitle.defaultMode !== "string" ||
    !isSubtitleMode(value.subtitle.defaultMode)
  ) {
    throw new PersistenceMappingError(
      "contentFormat.deliveryOptions.subtitle.defaultMode must be a valid subtitle mode."
    );
  }

  if (
    typeof value.voice.defaultGenerationMode !== "string" ||
    !isVoiceGenerationMode(value.voice.defaultGenerationMode)
  ) {
    throw new PersistenceMappingError(
      "contentFormat.deliveryOptions.voice.defaultGenerationMode must be a valid voice generation mode."
    );
  }

  return {
    subtitle: {
      enabledByDefault:
        value.subtitle.enabledByDefault === true
          ? true
          : value.subtitle.enabledByDefault === false
            ? false
            : (() => {
                throw new PersistenceMappingError(
                  "contentFormat.deliveryOptions.subtitle.enabledByDefault must be a boolean."
                );
              })(),
      supportedModes: subtitleModes as SubtitleMode[],
      defaultMode: value.subtitle.defaultMode,
      allowVideoOverride:
        value.subtitle.allowVideoOverride === true
          ? true
          : value.subtitle.allowVideoOverride === false
            ? false
            : (() => {
                throw new PersistenceMappingError(
                  "contentFormat.deliveryOptions.subtitle.allowVideoOverride must be a boolean."
                );
              })(),
      allowSceneOverride:
        value.subtitle.allowSceneOverride === true
          ? true
          : value.subtitle.allowSceneOverride === false
            ? false
            : (() => {
                throw new PersistenceMappingError(
                  "contentFormat.deliveryOptions.subtitle.allowSceneOverride must be a boolean."
                );
              })(),
      defaultStylePreset:
        typeof value.subtitle.defaultStylePreset === "string"
          ? value.subtitle.defaultStylePreset
          : (() => {
              throw new PersistenceMappingError(
                "contentFormat.deliveryOptions.subtitle.defaultStylePreset must be a string."
              );
            })(),
      defaultMaxWordsPerLine: readPositiveInteger(
        value.subtitle.defaultMaxWordsPerLine,
        "contentFormat.deliveryOptions.subtitle.defaultMaxWordsPerLine"
      ),
      defaultPosition:
        value.subtitle.defaultPosition === "bottom" || value.subtitle.defaultPosition === "center"
          ? value.subtitle.defaultPosition
          : (() => {
              throw new PersistenceMappingError(
                'contentFormat.deliveryOptions.subtitle.defaultPosition must be "bottom" or "center".'
              );
            })(),
      highlightKeywordsByDefault:
        value.subtitle.highlightKeywordsByDefault === true
          ? true
          : value.subtitle.highlightKeywordsByDefault === false
            ? false
            : (() => {
                throw new PersistenceMappingError(
                  "contentFormat.deliveryOptions.subtitle.highlightKeywordsByDefault must be a boolean."
                );
              })()
    },
    imageWorkflow: {
      defaultMode: value.imageWorkflow.defaultMode,
      defaultProvider:
        typeof value.imageWorkflow.defaultProvider === "string"
          ? (value.imageWorkflow.defaultProvider as ContentFormatDeliveryOptions["imageWorkflow"]["defaultProvider"])
          : (() => {
              throw new PersistenceMappingError(
                "contentFormat.deliveryOptions.imageWorkflow.defaultProvider must be a string."
              );
            })(),
      providerSlugs: readStringArray(
        value.imageWorkflow.providerSlugs,
        "contentFormat.deliveryOptions.imageWorkflow.providerSlugs"
      ) as ContentFormatDeliveryOptions["imageWorkflow"]["providerSlugs"],
      requiresPromptApproval:
        value.imageWorkflow.requiresPromptApproval === true
          ? true
          : value.imageWorkflow.requiresPromptApproval === false
            ? false
            : (() => {
                throw new PersistenceMappingError(
                  "contentFormat.deliveryOptions.imageWorkflow.requiresPromptApproval must be a boolean."
                );
              })()
    },
    voice: {
      defaultProvider:
        typeof value.voice.defaultProvider === "string"
          ? (value.voice.defaultProvider as ContentFormatDeliveryOptions["voice"]["defaultProvider"])
          : (() => {
              throw new PersistenceMappingError(
                "contentFormat.deliveryOptions.voice.defaultProvider must be a string."
              );
            })(),
      providerSlugs: readStringArray(
        value.voice.providerSlugs,
        "contentFormat.deliveryOptions.voice.providerSlugs"
      ) as ContentFormatDeliveryOptions["voice"]["providerSlugs"],
      defaultGenerationMode: value.voice.defaultGenerationMode,
      generationModes: voiceGenerationModes as ContentFormatDeliveryOptions["voice"]["generationModes"],
      voiceStyle:
        typeof value.voice.voiceStyle === "string"
          ? value.voice.voiceStyle
          : (() => {
              throw new PersistenceMappingError(
                "contentFormat.deliveryOptions.voice.voiceStyle must be a string."
              );
            })()
    },
    render: {
      defaultProvider:
        typeof value.render.defaultProvider === "string"
          ? (value.render.defaultProvider as ContentFormatDeliveryOptions["render"]["defaultProvider"])
          : (() => {
              throw new PersistenceMappingError(
                "contentFormat.deliveryOptions.render.defaultProvider must be a string."
              );
            })(),
      providerSlugs: readStringArray(
        value.render.providerSlugs,
        "contentFormat.deliveryOptions.render.providerSlugs"
      ) as ContentFormatDeliveryOptions["render"]["providerSlugs"],
      defaultTargetPlatform:
        typeof value.render.defaultTargetPlatform === "string"
          ? value.render.defaultTargetPlatform
          : (() => {
              throw new PersistenceMappingError(
                "contentFormat.deliveryOptions.render.defaultTargetPlatform must be a string."
              );
            })(),
      defaultTemplateSlug:
        typeof value.render.defaultTemplateSlug === "string"
          ? value.render.defaultTemplateSlug
          : (() => {
              throw new PersistenceMappingError(
                "contentFormat.deliveryOptions.render.defaultTemplateSlug must be a string."
              );
            })(),
      templateSlugs: readStringArray(
        value.render.templateSlugs,
        "contentFormat.deliveryOptions.render.templateSlugs"
      ),
      aspectRatio:
        typeof value.render.aspectRatio === "string"
          ? value.render.aspectRatio
          : (() => {
              throw new PersistenceMappingError(
                "contentFormat.deliveryOptions.render.aspectRatio must be a string."
              );
            })(),
      resolution:
        typeof value.render.resolution === "string"
          ? value.render.resolution
          : (() => {
              throw new PersistenceMappingError(
                "contentFormat.deliveryOptions.render.resolution must be a string."
              );
            })(),
      subtitleBurnInByDefault:
        value.render.subtitleBurnInByDefault === true
          ? true
          : value.render.subtitleBurnInByDefault === false
            ? false
            : (() => {
                throw new PersistenceMappingError(
                  "contentFormat.deliveryOptions.render.subtitleBurnInByDefault must be a boolean."
                );
              })(),
      visualStyle:
        typeof value.render.visualStyle === "string"
          ? value.render.visualStyle
          : (() => {
              throw new PersistenceMappingError(
                "contentFormat.deliveryOptions.render.visualStyle must be a string."
              );
            })(),
      ...(typeof value.render.musicStyle === "string"
        ? {
            musicStyle: value.render.musicStyle
          }
        : {}),
      ...(typeof value.render.overlayStyle === "string"
        ? {
            overlayStyle: value.render.overlayStyle
          }
        : {}),
      ...(typeof value.render.defaultTransitionStyle === "string"
        ? {
            defaultTransitionStyle: value.render.defaultTransitionStyle
          }
        : {}),
      ...(typeof value.render.defaultCaptionStyle === "string"
        ? {
            defaultCaptionStyle: value.render.defaultCaptionStyle
          }
        : {})
    },
    publishing: {
      platformSlugs: readStringArray(
        value.publishing.platformSlugs,
        "contentFormat.deliveryOptions.publishing.platformSlugs"
      ),
      providerSlugs: readStringArray(
        value.publishing.providerSlugs,
        "contentFormat.deliveryOptions.publishing.providerSlugs"
      ) as ContentFormatDeliveryOptions["publishing"]["providerSlugs"],
      defaultProvider:
        typeof value.publishing.defaultProvider === "string"
          ? (value.publishing.defaultProvider as ContentFormatDeliveryOptions["publishing"]["defaultProvider"])
          : (() => {
              throw new PersistenceMappingError(
                "contentFormat.deliveryOptions.publishing.defaultProvider must be a string."
              );
            })(),
      supportedModes: publishModes as ContentFormatDeliveryOptions["publishing"]["supportedModes"],
      defaultMode:
        typeof value.publishing.defaultMode === "string" && isPublishMode(value.publishing.defaultMode)
          ? value.publishing.defaultMode
          : (() => {
              throw new PersistenceMappingError(
                "contentFormat.deliveryOptions.publishing.defaultMode must be a valid publish mode."
              );
            })(),
      ...(typeof value.publishing.defaultCtaStyle === "string"
        ? {
            defaultCtaStyle: value.publishing.defaultCtaStyle
          }
        : {})
    }
  };
};

const readContentFormatCapabilities = (
  value: Prisma.JsonValue | undefined
): ContentFormatCapabilities => {
  if (!isRecord(value)) {
    throw new PersistenceMappingError("contentFormat.capabilities must be a JSON object.");
  }

  const {
    supportsImagePrompts,
    supportsVoiceover,
    supportsSubtitleConfig,
    supportsRenderJobs,
    supportsPublishing,
    supportsScheduling,
    supportsVersioning,
    supportsCostTracking
  } = value;

  if (
    typeof supportsImagePrompts !== "boolean" ||
    typeof supportsVoiceover !== "boolean" ||
    typeof supportsSubtitleConfig !== "boolean" ||
    typeof supportsRenderJobs !== "boolean" ||
    typeof supportsPublishing !== "boolean" ||
    typeof supportsScheduling !== "boolean" ||
    typeof supportsVersioning !== "boolean" ||
    typeof supportsCostTracking !== "boolean"
  ) {
    throw new PersistenceMappingError(
      "contentFormat.capabilities must contain boolean feature flags."
    );
  }

  return {
    supportsImagePrompts,
    supportsVoiceover,
    supportsSubtitleConfig,
    supportsRenderJobs,
    supportsPublishing,
    supportsScheduling,
    supportsVersioning,
    supportsCostTracking
  };
};

const mapTopicStatusFromPrisma = (status: PrismaTopicStatus): Topic["status"] => {
  switch (status) {
    case PrismaTopicStatus.ACTIVE:
      return "active";
    case PrismaTopicStatus.ARCHIVED:
      return "archived";
  }
};

const mapTopicStatusToPrisma = (status: Topic["status"]): PrismaTopicStatus => {
  switch (status) {
    case "active":
      return PrismaTopicStatus.ACTIVE;
    case "archived":
      return PrismaTopicStatus.ARCHIVED;
  }
};

const mapContentFormatStatusFromPrisma = (
  status: PrismaContentFormatStatus
): ContentFormat["status"] => {
  switch (status) {
    case PrismaContentFormatStatus.ACTIVE:
      return "active";
    case PrismaContentFormatStatus.DEPRECATED:
      return "deprecated";
  }
};

const mapContentFormatStatusToPrisma = (
  status: ContentFormat["status"]
): PrismaContentFormatStatus => {
  switch (status) {
    case "active":
      return PrismaContentFormatStatus.ACTIVE;
    case "deprecated":
      return PrismaContentFormatStatus.DEPRECATED;
  }
};

export const mapPrismaTopicToDomain = (record: PrismaTopicRecord): Topic => {
  return {
    id: record.id,
    slug: record.slug,
    name: record.name,
    description: record.description,
    audience: record.audience,
    contentPillars: readStringArray(record.contentPillars, "topic.contentPillars"),
    keywords: readStringArray(record.keywords, "topic.keywords"),
    preferredFormatSlugs: readStringArray(
      record.preferredFormatSlugs,
      "topic.preferredFormatSlugs"
    ),
    status: mapTopicStatusFromPrisma(record.status),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
};

export const mapTopicToPrismaCreateData = (
  topic: Topic
): Prisma.TopicUncheckedCreateInput => {
  return {
    id: topic.id,
    slug: topic.slug,
    name: topic.name,
    description: topic.description,
    audience: topic.audience,
    contentPillars: topic.contentPillars,
    keywords: topic.keywords,
    preferredFormatSlugs: topic.preferredFormatSlugs,
    status: mapTopicStatusToPrisma(topic.status),
    createdAt: topic.createdAt
  };
};

export const mapTopicToPrismaUpdateData = (
  topic: Topic
): Prisma.TopicUncheckedUpdateInput => {
  return {
    slug: topic.slug,
    name: topic.name,
    description: topic.description,
    audience: topic.audience,
    contentPillars: topic.contentPillars,
    keywords: topic.keywords,
    preferredFormatSlugs: topic.preferredFormatSlugs,
    status: mapTopicStatusToPrisma(topic.status)
  };
};

export const mapPrismaContentFormatToDomain = (
  record: PrismaContentFormatRow
): ContentFormat => {
  return {
    id: record.id,
    slug: record.slug,
    name: record.name,
    description: record.description,
    objective: record.objective,
    defaultDurationSeconds: record.defaultDurationSeconds,
    defaultSceneCount: record.defaultSceneCount,
    promptGuidance: readStringArray(record.promptGuidance, "contentFormat.promptGuidance"),
    structure: readContentFormatStructure(record.structure),
    deliveryOptions: readContentFormatDeliveryOptions(record.deliveryOptions),
    capabilities: readContentFormatCapabilities(record.capabilities),
    status: mapContentFormatStatusFromPrisma(record.status),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
};

export const mapContentFormatToPrismaCreateData = (
  contentFormat: ContentFormat
): Prisma.ContentFormatUncheckedCreateInput => {
  return {
    id: contentFormat.id,
    slug: contentFormat.slug,
    name: contentFormat.name,
    description: contentFormat.description,
    objective: contentFormat.objective,
    defaultDurationSeconds: contentFormat.defaultDurationSeconds,
    defaultSceneCount: contentFormat.defaultSceneCount,
    promptGuidance: contentFormat.promptGuidance as unknown as Prisma.InputJsonValue,
    structure: contentFormat.structure as unknown as Prisma.InputJsonValue,
    deliveryOptions: contentFormat.deliveryOptions as unknown as Prisma.InputJsonValue,
    capabilities: contentFormat.capabilities as unknown as Prisma.InputJsonValue,
    status: mapContentFormatStatusToPrisma(contentFormat.status),
    createdAt: contentFormat.createdAt
  } as Prisma.ContentFormatUncheckedCreateInput;
};

export const mapContentFormatToPrismaUpdateData = (
  contentFormat: ContentFormat
): Prisma.ContentFormatUncheckedUpdateInput => {
  return {
    slug: contentFormat.slug,
    name: contentFormat.name,
    description: contentFormat.description,
    objective: contentFormat.objective,
    defaultDurationSeconds: contentFormat.defaultDurationSeconds,
    defaultSceneCount: contentFormat.defaultSceneCount,
    promptGuidance: contentFormat.promptGuidance as unknown as Prisma.InputJsonValue,
    structure: contentFormat.structure as unknown as Prisma.InputJsonValue,
    deliveryOptions: contentFormat.deliveryOptions as unknown as Prisma.InputJsonValue,
    capabilities: contentFormat.capabilities as unknown as Prisma.InputJsonValue,
    status: mapContentFormatStatusToPrisma(contentFormat.status)
  } as Prisma.ContentFormatUncheckedUpdateInput;
};
