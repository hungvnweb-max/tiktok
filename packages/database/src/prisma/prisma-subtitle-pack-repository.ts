import type {
  OverlayCue,
  SubtitleCue,
  SubtitlePack,
  SubtitlePackRepository
} from "@videotik/core";
import { normalizeSubtitleMode } from "@videotik/core";
import {
  SubtitlePackStatus as PrismaSubtitlePackStatus,
  type OverlayCue as PrismaOverlayCueRecord,
  type PrismaClient,
  type SubtitleCue as PrismaSubtitleCueRecord,
  type SubtitlePack as PrismaSubtitlePackRecord
} from "@prisma/client";
import { readMetadataRecord, toNullableJsonValue } from "./shared-operational-mappers";

type PrismaSubtitlePackRow = PrismaSubtitlePackRecord & {
  subtitleCues: PrismaSubtitleCueRecord[];
  overlayCues: PrismaOverlayCueRecord[];
};

const mapPackStatusToPrisma = (
  status: SubtitlePack["status"]
): PrismaSubtitlePackStatus => {
  switch (status) {
    case "draft":
      return PrismaSubtitlePackStatus.DRAFT;
    case "ready":
      return PrismaSubtitlePackStatus.READY;
  }
};

const mapPackStatusFromPrisma = (
  status: PrismaSubtitlePackStatus
): SubtitlePack["status"] => {
  switch (status) {
    case PrismaSubtitlePackStatus.DRAFT:
      return "draft";
    case PrismaSubtitlePackStatus.READY:
      return "ready";
  }
};

const mapPrismaSubtitleCueToDomain = (record: PrismaSubtitleCueRecord): SubtitleCue => {
  return {
    id: record.id,
    sceneId: record.sceneId,
    sceneOrder: record.sceneOrder,
    mode: normalizeSubtitleMode(record.mode, "subtitleCue.mode"),
    text: record.text,
    startMs: record.startMs,
    endMs: record.endMs,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
};

const mapPrismaOverlayCueToDomain = (record: PrismaOverlayCueRecord): OverlayCue => {
  return {
    id: record.id,
    sceneId: record.sceneId,
    sceneOrder: record.sceneOrder,
    text: record.text,
    position: record.position as OverlayCue["position"],
    styleSlug: record.styleSlug,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
};

const mapPrismaPackToDomain = (record: PrismaSubtitlePackRow): SubtitlePack => {
  const pack: SubtitlePack = {
    id: record.id,
    videoId: record.videoId,
    scriptId: record.scriptId,
    contentFormatId: record.contentFormatId,
    provider: record.provider as SubtitlePack["provider"],
    defaultMode: normalizeSubtitleMode(record.defaultMode, "subtitlePack.defaultMode"),
    status: mapPackStatusFromPrisma(record.status),
    subtitleCues: record.subtitleCues
      .map((cue) => mapPrismaSubtitleCueToDomain(cue))
      .sort((left, right) => left.sceneOrder - right.sceneOrder),
    overlayCues: record.overlayCues
      .map((cue) => mapPrismaOverlayCueToDomain(cue))
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

const mapPackToPrismaCreateData = (pack: SubtitlePack) => {
  return {
    id: pack.id,
    videoId: pack.videoId,
    scriptId: pack.scriptId,
    contentFormatId: pack.contentFormatId,
    provider: pack.provider,
    defaultMode: pack.defaultMode,
    status: mapPackStatusToPrisma(pack.status),
    metadata: toNullableJsonValue(pack.metadata),
    createdAt: pack.createdAt
  };
};

const mapPackToPrismaUpdateData = (pack: SubtitlePack) => {
  return {
    videoId: pack.videoId,
    scriptId: pack.scriptId,
    contentFormatId: pack.contentFormatId,
    provider: pack.provider,
    defaultMode: pack.defaultMode,
    status: mapPackStatusToPrisma(pack.status),
    metadata: toNullableJsonValue(pack.metadata)
  };
};

const mapSubtitleCueToPrismaCreateData = (pack: SubtitlePack, cue: SubtitleCue) => {
  return {
    id: cue.id,
    subtitlePackId: pack.id,
    sceneId: cue.sceneId,
    sceneOrder: cue.sceneOrder,
    mode: cue.mode,
    text: cue.text,
    startMs: cue.startMs,
    endMs: cue.endMs,
    createdAt: cue.createdAt
  };
};

const mapSubtitleCueToPrismaUpdateData = (pack: SubtitlePack, cue: SubtitleCue) => {
  return {
    subtitlePackId: pack.id,
    sceneId: cue.sceneId,
    sceneOrder: cue.sceneOrder,
    mode: cue.mode,
    text: cue.text,
    startMs: cue.startMs,
    endMs: cue.endMs
  };
};

const mapOverlayCueToPrismaCreateData = (pack: SubtitlePack, cue: OverlayCue) => {
  return {
    id: cue.id,
    subtitlePackId: pack.id,
    sceneId: cue.sceneId,
    sceneOrder: cue.sceneOrder,
    text: cue.text,
    position: cue.position,
    styleSlug: cue.styleSlug,
    createdAt: cue.createdAt
  };
};

const mapOverlayCueToPrismaUpdateData = (pack: SubtitlePack, cue: OverlayCue) => {
  return {
    subtitlePackId: pack.id,
    sceneId: cue.sceneId,
    sceneOrder: cue.sceneOrder,
    text: cue.text,
    position: cue.position,
    styleSlug: cue.styleSlug
  };
};

export class PrismaSubtitlePackRepository implements SubtitlePackRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async save(subtitlePack: SubtitlePack): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.subtitlePack.upsert({
        where: {
          id: subtitlePack.id
        },
        create: mapPackToPrismaCreateData(subtitlePack),
        update: mapPackToPrismaUpdateData(subtitlePack)
      });

      const [existingSubtitleCues, existingOverlayCues] = await Promise.all([
        tx.subtitleCue.findMany({
          where: {
            subtitlePackId: subtitlePack.id
          },
          select: {
            id: true
          }
        }),
        tx.overlayCue.findMany({
          where: {
            subtitlePackId: subtitlePack.id
          },
          select: {
            id: true
          }
        })
      ]);

      const subtitleCueIds = new Set(subtitlePack.subtitleCues.map((cue) => cue.id));
      const overlayCueIds = new Set(subtitlePack.overlayCues.map((cue) => cue.id));
      const removedSubtitleCueIds = existingSubtitleCues
        .map((cue) => cue.id)
        .filter((cueId) => !subtitleCueIds.has(cueId));
      const removedOverlayCueIds = existingOverlayCues
        .map((cue) => cue.id)
        .filter((cueId) => !overlayCueIds.has(cueId));

      if (removedSubtitleCueIds.length > 0) {
        await tx.subtitleCue.deleteMany({
          where: {
            id: {
              in: removedSubtitleCueIds
            }
          }
        });
      }

      if (removedOverlayCueIds.length > 0) {
        await tx.overlayCue.deleteMany({
          where: {
            id: {
              in: removedOverlayCueIds
            }
          }
        });
      }

      for (const subtitleCue of subtitlePack.subtitleCues) {
        await tx.subtitleCue.upsert({
          where: {
            id: subtitleCue.id
          },
          create: mapSubtitleCueToPrismaCreateData(subtitlePack, subtitleCue),
          update: mapSubtitleCueToPrismaUpdateData(subtitlePack, subtitleCue)
        });
      }

      for (const overlayCue of subtitlePack.overlayCues) {
        await tx.overlayCue.upsert({
          where: {
            id: overlayCue.id
          },
          create: mapOverlayCueToPrismaCreateData(subtitlePack, overlayCue),
          update: mapOverlayCueToPrismaUpdateData(subtitlePack, overlayCue)
        });
      }
    });
  }

  async findById(subtitlePackId: string): Promise<SubtitlePack | undefined> {
    const pack = await this.prisma.subtitlePack.findUnique({
      where: {
        id: subtitlePackId
      },
      include: {
        subtitleCues: {
          orderBy: {
            sceneOrder: "asc"
          }
        },
        overlayCues: {
          orderBy: {
            sceneOrder: "asc"
          }
        }
      }
    });

    return pack ? mapPrismaPackToDomain(pack) : undefined;
  }

  async findByVideoId(videoId: string): Promise<SubtitlePack | undefined> {
    const pack = await this.prisma.subtitlePack.findUnique({
      where: {
        videoId
      },
      include: {
        subtitleCues: {
          orderBy: {
            sceneOrder: "asc"
          }
        },
        overlayCues: {
          orderBy: {
            sceneOrder: "asc"
          }
        }
      }
    });

    return pack ? mapPrismaPackToDomain(pack) : undefined;
  }

  async list(): Promise<SubtitlePack[]> {
    const packs = await this.prisma.subtitlePack.findMany({
      include: {
        subtitleCues: {
          orderBy: {
            sceneOrder: "asc"
          }
        },
        overlayCues: {
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
