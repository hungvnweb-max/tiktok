import type {
  PublicationSchedule,
  PublicationScheduleRepository
} from "@videotik/core";
import { normalizePublishMode } from "@videotik/core";
import {
  PublicationScheduleStatus as PrismaPublicationScheduleStatus,
  type PrismaClient
} from "@prisma/client";
import { readStringArray, toInputJsonValue } from "./shared-operational-mappers";

const mapScheduleStatusToPrisma = (
  status: PublicationSchedule["status"]
): PrismaPublicationScheduleStatus => {
  switch (status) {
    case "draft":
      return PrismaPublicationScheduleStatus.DRAFT;
    case "scheduled":
      return PrismaPublicationScheduleStatus.SCHEDULED;
    case "published":
      return PrismaPublicationScheduleStatus.PUBLISHED;
    case "canceled":
      return PrismaPublicationScheduleStatus.CANCELED;
  }
};

const mapScheduleStatusFromPrisma = (
  status: PrismaPublicationScheduleStatus
): PublicationSchedule["status"] => {
  switch (status) {
    case PrismaPublicationScheduleStatus.DRAFT:
      return "draft";
    case PrismaPublicationScheduleStatus.SCHEDULED:
      return "scheduled";
    case PrismaPublicationScheduleStatus.PUBLISHED:
      return "published";
    case PrismaPublicationScheduleStatus.CANCELED:
      return "canceled";
  }
};

const mapPrismaScheduleToDomain = (record: {
  id: string;
  videoId: string;
  platformSlug: string;
  provider: string;
  mode: string;
  timezone: string;
  scheduledFor: Date;
  caption: string;
  hashtags: unknown;
  status: PrismaPublicationScheduleStatus;
  publishedAt: Date | null;
  externalPublicationId: string | null;
  createdAt: Date;
  updatedAt: Date;
}): PublicationSchedule => {
  const schedule: PublicationSchedule = {
    id: record.id,
    videoId: record.videoId,
    platformSlug: record.platformSlug,
    provider: record.provider as PublicationSchedule["provider"],
    mode: normalizePublishMode(record.mode, "publicationSchedule.mode"),
    timezone: record.timezone,
    scheduledFor: record.scheduledFor,
    caption: record.caption,
    hashtags: readStringArray(record.hashtags as never),
    status: mapScheduleStatusFromPrisma(record.status),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };

  if (record.publishedAt) {
    schedule.publishedAt = record.publishedAt;
  }
  if (record.externalPublicationId) {
    schedule.externalPublicationId = record.externalPublicationId;
  }

  return schedule;
};

const mapScheduleToPrismaCreateData = (schedule: PublicationSchedule) => {
  return {
    id: schedule.id,
    videoId: schedule.videoId,
    platformSlug: schedule.platformSlug,
    provider: schedule.provider,
    mode: schedule.mode,
    timezone: schedule.timezone,
    scheduledFor: schedule.scheduledFor,
    caption: schedule.caption,
    hashtags: toInputJsonValue(schedule.hashtags),
    status: mapScheduleStatusToPrisma(schedule.status),
    publishedAt: schedule.publishedAt ?? null,
    externalPublicationId: schedule.externalPublicationId ?? null,
    createdAt: schedule.createdAt
  };
};

const mapScheduleToPrismaUpdateData = (schedule: PublicationSchedule) => {
  return {
    videoId: schedule.videoId,
    platformSlug: schedule.platformSlug,
    provider: schedule.provider,
    mode: schedule.mode,
    timezone: schedule.timezone,
    scheduledFor: schedule.scheduledFor,
    caption: schedule.caption,
    hashtags: toInputJsonValue(schedule.hashtags),
    status: mapScheduleStatusToPrisma(schedule.status),
    publishedAt: schedule.publishedAt ?? null,
    externalPublicationId: schedule.externalPublicationId ?? null
  };
};

export class PrismaPublicationScheduleRepository implements PublicationScheduleRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async save(schedule: PublicationSchedule): Promise<void> {
    await this.prisma.publicationSchedule.upsert({
      where: {
        id: schedule.id
      },
      create: mapScheduleToPrismaCreateData(schedule),
      update: mapScheduleToPrismaUpdateData(schedule)
    });
  }

  async findById(scheduleId: string): Promise<PublicationSchedule | undefined> {
    const schedule = await this.prisma.publicationSchedule.findUnique({
      where: {
        id: scheduleId
      }
    });

    return schedule ? mapPrismaScheduleToDomain(schedule) : undefined;
  }

  async findByVideoId(videoId: string): Promise<PublicationSchedule | undefined> {
    const schedule = await this.prisma.publicationSchedule.findUnique({
      where: {
        videoId
      }
    });

    return schedule ? mapPrismaScheduleToDomain(schedule) : undefined;
  }

  async list(): Promise<PublicationSchedule[]> {
    const schedules = await this.prisma.publicationSchedule.findMany({
      orderBy: {
        createdAt: "asc"
      }
    });

    return schedules.map(mapPrismaScheduleToDomain);
  }
}
