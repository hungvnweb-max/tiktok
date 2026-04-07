import {
  DomainError,
  createEntityId,
  ensureNonEmptyString,
  ensurePositiveInteger,
  now,
  type AuditableEntity,
  type MetadataRecord
} from "../common/entity";
import type { TextGenerationProvider } from "../common/providers";
import {
  createSceneDirection,
  type CreateSceneDirectionInput,
  type SceneDirection
} from "../video/scene";

export type ScriptStatus = "draft" | "ready" | "archived";

export interface ContentScript extends AuditableEntity {
  topicId: string;
  ideaId: string;
  contentFormatId: string;
  title: string;
  summary: string;
  voiceover: string;
  scenes: SceneDirection[];
  estimatedDurationSeconds: number;
  generationProvider: TextGenerationProvider;
  sourceMetadata?: MetadataRecord;
  status: ScriptStatus;
}

export interface CreateContentScriptInput {
  topicId: string;
  ideaId: string;
  contentFormatId: string;
  title: string;
  summary: string;
  voiceover: string;
  scenes: CreateSceneDirectionInput[];
  estimatedDurationSeconds?: number;
  generationProvider: TextGenerationProvider;
  sourceMetadata?: MetadataRecord;
}

const sumSceneDuration = (scenes: SceneDirection[]): number => {
  return scenes.reduce((total, scene) => total + scene.estimatedDurationSeconds, 0);
};

export const createContentScript = (input: CreateContentScriptInput): ContentScript => {
  const timestamp = now();
  const scenes = input.scenes.map((scene) => createSceneDirection(scene));

  if (scenes.length === 0) {
    throw new DomainError("script.scenes must contain at least one scene.");
  }

  return {
    id: createEntityId("script"),
    topicId: input.topicId,
    ideaId: input.ideaId,
    contentFormatId: input.contentFormatId,
    title: ensureNonEmptyString(input.title, "script.title"),
    summary: ensureNonEmptyString(input.summary, "script.summary"),
    voiceover: ensureNonEmptyString(input.voiceover, "script.voiceover"),
    scenes,
    estimatedDurationSeconds:
      input.estimatedDurationSeconds === undefined
        ? sumSceneDuration(scenes)
        : ensurePositiveInteger(input.estimatedDurationSeconds, "script.estimatedDurationSeconds"),
    generationProvider: input.generationProvider,
    status: "ready",
    createdAt: timestamp,
    updatedAt: timestamp,
    ...(input.sourceMetadata ? { sourceMetadata: input.sourceMetadata } : {})
  };
};
