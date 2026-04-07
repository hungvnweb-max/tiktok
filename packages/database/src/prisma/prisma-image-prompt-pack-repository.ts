import type {
  ImagePromptPack,
  ImagePromptPackRepository,
  SceneImagePrompt
} from "@videotik/core";
import { normalizeImageWorkflowMode } from "@videotik/core";
import {
  ImagePromptPackStatus as PrismaImagePromptPackStatus,
  type PrismaClient,
  type ImagePromptPack as PrismaImagePromptPackRecord,
  type SceneImagePrompt as PrismaSceneImagePromptRecord
} from "@prisma/client";
import { readMetadataRecord, toNullableJsonValue } from "./shared-operational-mappers";

type PrismaImagePromptPackRow = PrismaImagePromptPackRecord & {
  prompts: PrismaSceneImagePromptRecord[];
};

const mapPackStatusToPrisma = (
  status: ImagePromptPack["status"]
): PrismaImagePromptPackStatus => {
  switch (status) {
    case "draft":
      return PrismaImagePromptPackStatus.DRAFT;
    case "ready":
      return PrismaImagePromptPackStatus.READY;
  }
};

const mapPackStatusFromPrisma = (
  status: PrismaImagePromptPackStatus
): ImagePromptPack["status"] => {
  switch (status) {
    case PrismaImagePromptPackStatus.DRAFT:
      return "draft";
    case PrismaImagePromptPackStatus.READY:
      return "ready";
  }
};

const mapPrismaPromptToDomain = (record: PrismaSceneImagePromptRecord): SceneImagePrompt => {
  const prompt: SceneImagePrompt = {
    id: record.id,
    sceneId: record.sceneId,
    sceneOrder: record.sceneOrder,
    prompt: record.prompt,
    aspectRatio: record.aspectRatio as SceneImagePrompt["aspectRatio"],
    styleSlug: record.styleSlug,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };

  if (record.negativePrompt) {
    prompt.negativePrompt = record.negativePrompt;
  }

  return prompt;
};

const mapPrismaPackToDomain = (record: PrismaImagePromptPackRow): ImagePromptPack => {
  const pack: ImagePromptPack = {
    id: record.id,
    topicId: record.topicId,
    ideaId: record.ideaId,
    scriptId: record.scriptId,
    videoId: record.videoId,
    contentFormatId: record.contentFormatId,
    workflowMode: normalizeImageWorkflowMode(record.workflowMode, "imagePromptPack.workflowMode"),
    provider: record.provider as ImagePromptPack["provider"],
    status: mapPackStatusFromPrisma(record.status),
    prompts: record.prompts
      .map((prompt) => mapPrismaPromptToDomain(prompt))
      .sort((left, right) => left.sceneOrder - right.sceneOrder),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
  const metadata = readMetadataRecord(record.metadata as never);

  if (metadata) {
    pack.metadata = metadata;
  }

  return pack;
};

const mapPackToPrismaCreateData = (pack: ImagePromptPack) => {
  return {
    id: pack.id,
    topicId: pack.topicId,
    ideaId: pack.ideaId,
    scriptId: pack.scriptId,
    videoId: pack.videoId,
    contentFormatId: pack.contentFormatId,
    workflowMode: pack.workflowMode,
    provider: pack.provider,
    status: mapPackStatusToPrisma(pack.status),
    metadata: toNullableJsonValue(pack.metadata),
    createdAt: pack.createdAt
  };
};

const mapPackToPrismaUpdateData = (pack: ImagePromptPack) => {
  return {
    topicId: pack.topicId,
    ideaId: pack.ideaId,
    scriptId: pack.scriptId,
    videoId: pack.videoId,
    contentFormatId: pack.contentFormatId,
    workflowMode: pack.workflowMode,
    provider: pack.provider,
    status: mapPackStatusToPrisma(pack.status),
    metadata: toNullableJsonValue(pack.metadata)
  };
};

const mapPromptToPrismaCreateData = (pack: ImagePromptPack, prompt: SceneImagePrompt) => {
  return {
    id: prompt.id,
    imagePromptPackId: pack.id,
    sceneId: prompt.sceneId,
    sceneOrder: prompt.sceneOrder,
    prompt: prompt.prompt,
    negativePrompt: prompt.negativePrompt ?? null,
    aspectRatio: prompt.aspectRatio,
    styleSlug: prompt.styleSlug,
    createdAt: prompt.createdAt
  };
};

const mapPromptToPrismaUpdateData = (pack: ImagePromptPack, prompt: SceneImagePrompt) => {
  return {
    imagePromptPackId: pack.id,
    sceneId: prompt.sceneId,
    sceneOrder: prompt.sceneOrder,
    prompt: prompt.prompt,
    negativePrompt: prompt.negativePrompt ?? null,
    aspectRatio: prompt.aspectRatio,
    styleSlug: prompt.styleSlug
  };
};

export class PrismaImagePromptPackRepository implements ImagePromptPackRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async save(imagePromptPack: ImagePromptPack): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.imagePromptPack.upsert({
        where: {
          id: imagePromptPack.id
        },
        create: mapPackToPrismaCreateData(imagePromptPack),
        update: mapPackToPrismaUpdateData(imagePromptPack)
      });

      const existingPrompts = await tx.sceneImagePrompt.findMany({
        where: {
          imagePromptPackId: imagePromptPack.id
        },
        select: {
          id: true
        }
      });
      const promptIds = new Set(imagePromptPack.prompts.map((prompt) => prompt.id));
      const removedPromptIds = existingPrompts
        .map((prompt) => prompt.id)
        .filter((promptId) => !promptIds.has(promptId));

      if (removedPromptIds.length > 0) {
        await tx.sceneImagePrompt.deleteMany({
          where: {
            id: {
              in: removedPromptIds
            }
          }
        });
      }

      for (const prompt of imagePromptPack.prompts) {
        await tx.sceneImagePrompt.upsert({
          where: {
            id: prompt.id
          },
          create: mapPromptToPrismaCreateData(imagePromptPack, prompt),
          update: mapPromptToPrismaUpdateData(imagePromptPack, prompt)
        });
      }
    });
  }

  async findById(imagePromptPackId: string): Promise<ImagePromptPack | undefined> {
    const pack = await this.prisma.imagePromptPack.findUnique({
      where: {
        id: imagePromptPackId
      },
      include: {
        prompts: {
          orderBy: {
            sceneOrder: "asc"
          }
        }
      }
    });

    return pack ? mapPrismaPackToDomain(pack) : undefined;
  }

  async findByVideoId(videoId: string): Promise<ImagePromptPack | undefined> {
    const pack = await this.prisma.imagePromptPack.findUnique({
      where: {
        videoId
      },
      include: {
        prompts: {
          orderBy: {
            sceneOrder: "asc"
          }
        }
      }
    });

    return pack ? mapPrismaPackToDomain(pack) : undefined;
  }

  async list(): Promise<ImagePromptPack[]> {
    const packs = await this.prisma.imagePromptPack.findMany({
      include: {
        prompts: {
          orderBy: {
            sceneOrder: "asc"
          }
        }
      },
      orderBy: {
        createdAt: "asc"
      }
    });

    return packs.map(mapPrismaPackToDomain);
  }
}
