import {
  DomainError,
  createEntityId,
  ensureNonEmptyString,
  ensurePositiveInteger,
  now,
  type AuditableEntity,
  type MetadataRecord
} from "../common/entity";
import {
  normalizeImageWorkflowMode,
  type ImageWorkflowMode
} from "../common/media";
import type { ImageGenerationProvider } from "../common/providers";

export type ImagePromptPackStatus = "draft" | "ready";

export interface SceneImagePrompt extends AuditableEntity {
  sceneId: string;
  sceneOrder: number;
  prompt: string;
  negativePrompt?: string;
  aspectRatio: "9:16";
  styleSlug: string;
}

export interface ImagePromptPack extends AuditableEntity {
  topicId: string;
  ideaId: string;
  scriptId: string;
  videoId: string;
  contentFormatId: string;
  workflowMode: ImageWorkflowMode;
  provider: ImageGenerationProvider;
  status: ImagePromptPackStatus;
  prompts: SceneImagePrompt[];
  metadata?: MetadataRecord;
}

export interface CreateSceneImagePromptInput {
  sceneId: string;
  sceneOrder: number;
  prompt: string;
  negativePrompt?: string;
  aspectRatio?: "9:16";
  styleSlug: string;
}

export interface CreateImagePromptPackInput {
  topicId: string;
  ideaId: string;
  scriptId: string;
  videoId: string;
  contentFormatId: string;
  workflowMode: ImageWorkflowMode;
  provider: ImageGenerationProvider;
  prompts: CreateSceneImagePromptInput[];
  metadata?: MetadataRecord;
}

const createSceneImagePrompt = (input: CreateSceneImagePromptInput): SceneImagePrompt => {
  const timestamp = now();

  return {
    id: createEntityId("imgprompt"),
    sceneId: ensureNonEmptyString(input.sceneId, "imagePrompt.sceneId"),
    sceneOrder: ensurePositiveInteger(input.sceneOrder, "imagePrompt.sceneOrder"),
    prompt: ensureNonEmptyString(input.prompt, "imagePrompt.prompt"),
    aspectRatio: input.aspectRatio ?? "9:16",
    styleSlug: ensureNonEmptyString(input.styleSlug, "imagePrompt.styleSlug"),
    createdAt: timestamp,
    updatedAt: timestamp,
    ...(input.negativePrompt ? { negativePrompt: input.negativePrompt.trim() } : {})
  };
};

export const createImagePromptPack = (input: CreateImagePromptPackInput): ImagePromptPack => {
  const timestamp = now();
  const prompts = input.prompts.map((item) => createSceneImagePrompt(item));

  if (prompts.length === 0) {
    throw new DomainError("imagePromptPack.prompts must contain at least one prompt.");
  }

  return {
    id: createEntityId("imagepack"),
    topicId: input.topicId,
    ideaId: input.ideaId,
    scriptId: input.scriptId,
    videoId: input.videoId,
    contentFormatId: input.contentFormatId,
    workflowMode: normalizeImageWorkflowMode(
      input.workflowMode,
      "imagePromptPack.workflowMode"
    ),
    provider: input.provider,
    status: "ready",
    prompts,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...(input.metadata ? { metadata: input.metadata } : {})
  };
};
