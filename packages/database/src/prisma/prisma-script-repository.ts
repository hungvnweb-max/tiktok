import type { ContentScript, ScriptRepository, SceneDirection } from "@videotik/core";
import { ScriptStatus as PrismaScriptStatus, type PrismaClient } from "@prisma/client";
import {
  isJsonArray,
  isJsonObject,
  readMetadataRecord,
  readDateValue,
  toInputJsonValue,
  toNullableJsonValue
} from "./shared-operational-mappers";

const mapScriptStatusToPrisma = (status: ContentScript["status"]): PrismaScriptStatus => {
  switch (status) {
    case "draft":
      return PrismaScriptStatus.DRAFT;
    case "ready":
      return PrismaScriptStatus.READY;
    case "archived":
      return PrismaScriptStatus.ARCHIVED;
  }
};

const mapScriptStatusFromPrisma = (status: PrismaScriptStatus): ContentScript["status"] => {
  switch (status) {
    case PrismaScriptStatus.DRAFT:
      return "draft";
    case PrismaScriptStatus.READY:
      return "ready";
    case PrismaScriptStatus.ARCHIVED:
      return "archived";
  }
};

const mapSceneDirectionToJson = (scene: SceneDirection) => {
  return {
    id: scene.id,
    order: scene.order,
    role: scene.role,
    narration: scene.narration,
    visualDirection: scene.visualDirection,
    onScreenText: scene.onScreenText,
    estimatedDurationSeconds: scene.estimatedDurationSeconds,
    ...(scene.subtitleConfig ? { subtitleConfig: scene.subtitleConfig } : {}),
    createdAt: scene.createdAt.toISOString(),
    updatedAt: scene.updatedAt.toISOString()
  };
};

const mapSceneDirectionFromJson = (value: unknown): SceneDirection | undefined => {
  if (!isJsonObject(value as never)) {
    return undefined;
  }

  const record = value as Record<string, unknown>;

  if (
    typeof record.id !== "string" ||
    typeof record.order !== "number" ||
    typeof record.role !== "string" ||
    typeof record.narration !== "string" ||
    typeof record.visualDirection !== "string" ||
    typeof record.onScreenText !== "string" ||
    typeof record.estimatedDurationSeconds !== "number"
  ) {
    return undefined;
  }

  const scene: SceneDirection = {
    id: record.id,
    order: record.order,
    role: record.role as SceneDirection["role"],
    narration: record.narration,
    visualDirection: record.visualDirection,
    onScreenText: record.onScreenText,
    estimatedDurationSeconds: record.estimatedDurationSeconds,
    createdAt: readDateValue(record.createdAt as never) ?? new Date(),
    updatedAt: readDateValue(record.updatedAt as never) ?? new Date()
  };

  if (
    record.subtitleConfig &&
    typeof record.subtitleConfig === "object" &&
    !Array.isArray(record.subtitleConfig)
  ) {
    scene.subtitleConfig = record.subtitleConfig as unknown as NonNullable<SceneDirection["subtitleConfig"]>;
  }

  return scene;
};

const mapPrismaScriptToDomain = (record: {
  id: string;
  topicId: string;
  ideaId: string;
  contentFormatId: string;
  title: string;
  summary: string;
  voiceover: string;
  sceneBlueprints: unknown;
  estimatedDurationSeconds: number;
  generationProvider: string;
  sourceMetadata: unknown;
  status: PrismaScriptStatus;
  createdAt: Date;
  updatedAt: Date;
}): ContentScript => {
  const script: ContentScript = {
    id: record.id,
    topicId: record.topicId,
    ideaId: record.ideaId,
    contentFormatId: record.contentFormatId,
    title: record.title,
    summary: record.summary,
    voiceover: record.voiceover,
    scenes: isJsonArray(record.sceneBlueprints as never)
      ? (record.sceneBlueprints as unknown[])
          .map((scene) => mapSceneDirectionFromJson(scene))
          .filter((scene): scene is SceneDirection => scene !== undefined)
      : [],
    estimatedDurationSeconds: record.estimatedDurationSeconds,
    generationProvider: record.generationProvider as ContentScript["generationProvider"],
    status: mapScriptStatusFromPrisma(record.status),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
  const sourceMetadata = readMetadataRecord(record.sourceMetadata as never);

  if (sourceMetadata) {
    script.sourceMetadata = sourceMetadata;
  }

  return script;
};

const mapScriptToPrismaCreateData = (script: ContentScript) => {
  return {
    id: script.id,
    topicId: script.topicId,
    ideaId: script.ideaId,
    contentFormatId: script.contentFormatId,
    title: script.title,
    summary: script.summary,
    voiceover: script.voiceover,
    sceneBlueprints: toInputJsonValue(script.scenes.map((scene) => mapSceneDirectionToJson(scene))),
    estimatedDurationSeconds: script.estimatedDurationSeconds,
    generationProvider: script.generationProvider,
    sourceMetadata: toNullableJsonValue(script.sourceMetadata),
    status: mapScriptStatusToPrisma(script.status),
    createdAt: script.createdAt
  };
};

const mapScriptToPrismaUpdateData = (script: ContentScript) => {
  return {
    topicId: script.topicId,
    ideaId: script.ideaId,
    contentFormatId: script.contentFormatId,
    title: script.title,
    summary: script.summary,
    voiceover: script.voiceover,
    sceneBlueprints: toInputJsonValue(script.scenes.map((scene) => mapSceneDirectionToJson(scene))),
    estimatedDurationSeconds: script.estimatedDurationSeconds,
    generationProvider: script.generationProvider,
    sourceMetadata: toNullableJsonValue(script.sourceMetadata),
    status: mapScriptStatusToPrisma(script.status)
  };
};

export class PrismaScriptRepository implements ScriptRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async save(script: ContentScript): Promise<void> {
    await this.prisma.contentScript.upsert({
      where: {
        id: script.id
      },
      create: mapScriptToPrismaCreateData(script),
      update: mapScriptToPrismaUpdateData(script)
    });
  }

  async findById(scriptId: string): Promise<ContentScript | undefined> {
    const script = await this.prisma.contentScript.findUnique({
      where: {
        id: scriptId
      }
    });

    return script ? mapPrismaScriptToDomain(script) : undefined;
  }

  async list(): Promise<ContentScript[]> {
    const scripts = await this.prisma.contentScript.findMany({
      orderBy: {
        createdAt: "asc"
      }
    });

    return scripts.map(mapPrismaScriptToDomain);
  }
}
