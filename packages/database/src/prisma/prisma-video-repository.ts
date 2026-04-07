import type { SceneDirection, Video, VideoRepository } from "@videotik/core";
import {
  normalizeImageWorkflowConfig,
  normalizePublishMode,
  normalizeRenderConfig,
  normalizeSubtitleConfig,
  normalizeVoiceoverConfig
} from "@videotik/core";
import {
  SceneRole as PrismaSceneRole,
  VideoStatus as PrismaVideoStatus,
  type PrismaClient,
  type Scene as PrismaSceneRecord,
  type Video as PrismaVideoRecord
} from "@prisma/client";
import {
  isJsonObject,
  readDateValue,
  toInputJsonValue,
  toNullableJsonValue
} from "./shared-operational-mappers";

type PrismaVideoRow = PrismaVideoRecord & {
  scenes: PrismaSceneRecord[];
};

const mapVideoStatusToPrisma = (status: Video["status"]): PrismaVideoStatus => {
  switch (status) {
    case "idea_created":
      return PrismaVideoStatus.IDEA_CREATED;
    case "script_ready":
      return PrismaVideoStatus.SCRIPT_READY;
    case "image_ready":
      return PrismaVideoStatus.IMAGE_READY;
    case "voice_ready":
      return PrismaVideoStatus.VOICE_READY;
    case "render_ready":
      return PrismaVideoStatus.RENDER_READY;
    case "rendered":
      return PrismaVideoStatus.RENDERED;
    case "scheduled":
      return PrismaVideoStatus.SCHEDULED;
    case "published":
      return PrismaVideoStatus.PUBLISHED;
    case "failed":
      return PrismaVideoStatus.FAILED;
  }
};

const mapVideoStatusFromPrisma = (status: PrismaVideoStatus): Video["status"] => {
  switch (status) {
    case PrismaVideoStatus.IDEA_CREATED:
      return "idea_created";
    case PrismaVideoStatus.SCRIPT_READY:
      return "script_ready";
    case PrismaVideoStatus.IMAGE_READY:
      return "image_ready";
    case PrismaVideoStatus.VOICE_READY:
      return "voice_ready";
    case PrismaVideoStatus.RENDER_READY:
      return "render_ready";
    case PrismaVideoStatus.RENDERED:
      return "rendered";
    case PrismaVideoStatus.SCHEDULED:
      return "scheduled";
    case PrismaVideoStatus.PUBLISHED:
      return "published";
    case PrismaVideoStatus.FAILED:
      return "failed";
  }
};

const mapSceneRoleToPrisma = (role: SceneDirection["role"]): PrismaSceneRole => {
  switch (role) {
    case "hook":
      return PrismaSceneRole.HOOK;
    case "setup":
      return PrismaSceneRole.SETUP;
    case "body":
      return PrismaSceneRole.BODY;
    case "proof":
      return PrismaSceneRole.PROOF;
    case "twist":
      return PrismaSceneRole.TWIST;
    case "payoff":
      return PrismaSceneRole.PAYOFF;
    case "cta":
      return PrismaSceneRole.CTA;
  }
};

const mapSceneRoleFromPrisma = (role: PrismaSceneRole): SceneDirection["role"] => {
  switch (role) {
    case PrismaSceneRole.HOOK:
      return "hook";
    case PrismaSceneRole.SETUP:
      return "setup";
    case PrismaSceneRole.BODY:
      return "body";
    case PrismaSceneRole.PROOF:
      return "proof";
    case PrismaSceneRole.TWIST:
      return "twist";
    case PrismaSceneRole.PAYOFF:
      return "payoff";
    case PrismaSceneRole.CTA:
      return "cta";
  }
};

const mapPrismaSceneToDomain = (record: PrismaSceneRecord): SceneDirection => {
  const scene: SceneDirection = {
    id: record.id,
    order: record.sequence,
    role: mapSceneRoleFromPrisma(record.role),
    narration: record.narration,
    visualDirection: record.visualDirection,
    onScreenText: record.onScreenText,
    estimatedDurationSeconds: record.estimatedDurationSeconds,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };

  if (record.subtitleConfig && typeof record.subtitleConfig === "object" && !Array.isArray(record.subtitleConfig)) {
    scene.subtitleConfig =
      record.subtitleConfig as unknown as NonNullable<SceneDirection["subtitleConfig"]>;
  }

  return scene;
};

const readPublishingConfig = (value: unknown): Video["publishingConfig"] => {
  if (!isJsonObject(value as never)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const config: NonNullable<Video["publishingConfig"]> = {
    enabled: record.enabled === true
  };

  if (typeof record.channel === "string") {
    config.channel = record.channel;
  }
  if (typeof record.provider === "string") {
    config.provider = record.provider as NonNullable<typeof config.provider>;
  }
  if (typeof record.mode === "string") {
    config.mode = normalizePublishMode(record.mode, "video.publishingConfig.mode");
  }
  const scheduledFor = readDateValue(record.scheduledFor as never);
  if (scheduledFor) {
    config.scheduledFor = scheduledFor;
  }
  const publishedAt = readDateValue(record.publishedAt as never);
  if (publishedAt) {
    config.publishedAt = publishedAt;
  }
  if (typeof record.lastPublishAttemptId === "string") {
    config.lastPublishAttemptId = record.lastPublishAttemptId;
  }
  if (typeof record.lastProviderStatus === "string") {
    config.lastProviderStatus = record.lastProviderStatus;
  }
  if (typeof record.lastPublishError === "string") {
    config.lastPublishError = record.lastPublishError;
  }
  if (typeof record.externalPublicationId === "string") {
    config.externalPublicationId = record.externalPublicationId;
  }
  if (typeof record.externalUrl === "string") {
    config.externalUrl = record.externalUrl;
  }

  return config;
};

const mapPrismaVideoToDomain = (record: PrismaVideoRow): Video => {
  return {
    id: record.id,
    topicId: record.topicId,
    ideaId: record.ideaId,
    scriptId: record.scriptId,
    contentFormatId: record.contentFormatId,
    title: record.title,
    formatSlug: record.formatSlug,
    status: mapVideoStatusFromPrisma(record.status),
    scenes: record.scenes.map((scene) => mapPrismaSceneToDomain(scene)).sort((a, b) => a.order - b.order),
    estimatedDurationSeconds: record.estimatedDurationSeconds,
    subtitleConfig: normalizeSubtitleConfig(record.subtitleConfig as unknown as Video["subtitleConfig"]),
    imageWorkflowConfig: normalizeImageWorkflowConfig(
      record.imageWorkflowConfig as unknown as Video["imageWorkflowConfig"]
    ),
    voiceoverConfig: normalizeVoiceoverConfig(
      record.voiceoverConfig as unknown as Video["voiceoverConfig"]
    ),
    renderConfig: normalizeRenderConfig(record.renderConfig as unknown as Video["renderConfig"]),
    publishingConfig: readPublishingConfig(record.publishingConfig),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
};

const mapVideoToPrismaCreateData = (video: Video) => {
  return {
    id: video.id,
    topicId: video.topicId,
    ideaId: video.ideaId,
    scriptId: video.scriptId,
    contentFormatId: video.contentFormatId,
    formatSlug: video.formatSlug,
    title: video.title,
    status: mapVideoStatusToPrisma(video.status),
    estimatedDurationSeconds: video.estimatedDurationSeconds,
    subtitleConfig: toInputJsonValue(video.subtitleConfig),
    imageWorkflowConfig: toInputJsonValue(video.imageWorkflowConfig),
    voiceoverConfig: toInputJsonValue(video.voiceoverConfig),
    renderConfig: toInputJsonValue(video.renderConfig),
    publishingConfig: toNullableJsonValue(
      video.publishingConfig
        ? {
            ...video.publishingConfig,
            ...(video.publishingConfig.scheduledFor
              ? { scheduledFor: video.publishingConfig.scheduledFor.toISOString() }
              : {}),
            ...(video.publishingConfig.publishedAt
              ? { publishedAt: video.publishingConfig.publishedAt.toISOString() }
              : {})
          }
        : null
    ),
    createdAt: video.createdAt
  };
};

const mapVideoToPrismaUpdateData = (video: Video) => {
  return {
    topicId: video.topicId,
    ideaId: video.ideaId,
    scriptId: video.scriptId,
    contentFormatId: video.contentFormatId,
    formatSlug: video.formatSlug,
    title: video.title,
    status: mapVideoStatusToPrisma(video.status),
    estimatedDurationSeconds: video.estimatedDurationSeconds,
    subtitleConfig: toInputJsonValue(video.subtitleConfig),
    imageWorkflowConfig: toInputJsonValue(video.imageWorkflowConfig),
    voiceoverConfig: toInputJsonValue(video.voiceoverConfig),
    renderConfig: toInputJsonValue(video.renderConfig),
    publishingConfig: toNullableJsonValue(
      video.publishingConfig
        ? {
            ...video.publishingConfig,
            ...(video.publishingConfig.scheduledFor
              ? { scheduledFor: video.publishingConfig.scheduledFor.toISOString() }
              : {}),
            ...(video.publishingConfig.publishedAt
              ? { publishedAt: video.publishingConfig.publishedAt.toISOString() }
              : {})
          }
        : null
    )
  };
};

const mapSceneToPrismaCreateData = (video: Video, scene: SceneDirection) => {
  return {
    id: scene.id,
    videoId: video.id,
    scriptId: video.scriptId,
    sequence: scene.order,
    role: mapSceneRoleToPrisma(scene.role),
    narration: scene.narration,
    visualDirection: scene.visualDirection,
    onScreenText: scene.onScreenText,
    estimatedDurationSeconds: scene.estimatedDurationSeconds,
    subtitleConfig: toNullableJsonValue(scene.subtitleConfig ?? null),
    metadata: toNullableJsonValue(null),
    createdAt: scene.createdAt
  };
};

const mapSceneToPrismaUpdateData = (video: Video, scene: SceneDirection) => {
  return {
    videoId: video.id,
    scriptId: video.scriptId,
    sequence: scene.order,
    role: mapSceneRoleToPrisma(scene.role),
    narration: scene.narration,
    visualDirection: scene.visualDirection,
    onScreenText: scene.onScreenText,
    estimatedDurationSeconds: scene.estimatedDurationSeconds,
    subtitleConfig: toNullableJsonValue(scene.subtitleConfig ?? null),
    metadata: toNullableJsonValue(null)
  };
};

export class PrismaVideoRepository implements VideoRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async save(video: Video): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.video.upsert({
        where: {
          id: video.id
        },
        create: mapVideoToPrismaCreateData(video),
        update: mapVideoToPrismaUpdateData(video)
      });

      const existingScenes = await tx.scene.findMany({
        where: {
          videoId: video.id
        },
        select: {
          id: true
        }
      });
      const sceneIds = new Set(video.scenes.map((scene) => scene.id));
      const removedSceneIds = existingScenes
        .map((scene) => scene.id)
        .filter((sceneId) => !sceneIds.has(sceneId));

      if (removedSceneIds.length > 0) {
        await tx.scene.deleteMany({
          where: {
            id: {
              in: removedSceneIds
            }
          }
        });
      }

      for (const scene of video.scenes) {
        await tx.scene.upsert({
          where: {
            id: scene.id
          },
          create: mapSceneToPrismaCreateData(video, scene),
          update: mapSceneToPrismaUpdateData(video, scene)
        });
      }
    });
  }

  async findById(videoId: string): Promise<Video | undefined> {
    const video = await this.prisma.video.findUnique({
      where: {
        id: videoId
      },
      include: {
        scenes: {
          orderBy: {
            sequence: "asc"
          }
        }
      }
    });

    return video ? mapPrismaVideoToDomain(video) : undefined;
  }

  async findByScriptId(scriptId: string): Promise<Video | undefined> {
    const video = await this.prisma.video.findFirst({
      where: {
        scriptId
      },
      include: {
        scenes: {
          orderBy: {
            sequence: "asc"
          }
        }
      },
      orderBy: {
        createdAt: "asc"
      }
    });

    return video ? mapPrismaVideoToDomain(video) : undefined;
  }

  async list(): Promise<Video[]> {
    const videos = await this.prisma.video.findMany({
      include: {
        scenes: {
          orderBy: {
            sequence: "asc"
          }
        }
      },
      orderBy: {
        createdAt: "asc"
      }
    });

    return videos.map(mapPrismaVideoToDomain);
  }
}
