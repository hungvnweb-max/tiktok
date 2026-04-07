import {
  createEntityId,
  dedupeStrings,
  ensureNonEmptyString,
  now,
  type AuditableEntity
} from "../common/entity";
import type { PublishMode } from "../common/media";
import type { PublishingProvider } from "../common/providers";

export type PublicationScheduleStatus = "draft" | "scheduled" | "published" | "canceled";

export interface PublicationSchedule extends AuditableEntity {
  videoId: string;
  platformSlug: string;
  provider: PublishingProvider;
  mode: PublishMode;
  timezone: string;
  scheduledFor: Date;
  caption: string;
  hashtags: string[];
  status: PublicationScheduleStatus;
  publishedAt?: Date;
  externalPublicationId?: string;
}

export interface CreatePublicationScheduleInput {
  videoId: string;
  platformSlug: string;
  provider: PublishingProvider;
  mode: PublishMode;
  timezone: string;
  scheduledFor: Date;
  caption: string;
  hashtags: string[];
}

export const createPublicationSchedule = (
  input: CreatePublicationScheduleInput
): PublicationSchedule => {
  const timestamp = now();

  return {
    id: createEntityId("schedule"),
    videoId: ensureNonEmptyString(input.videoId, "schedule.videoId"),
    platformSlug: ensureNonEmptyString(input.platformSlug, "schedule.platformSlug"),
    provider: input.provider,
    mode: input.mode,
    timezone: ensureNonEmptyString(input.timezone, "schedule.timezone"),
    scheduledFor: input.scheduledFor,
    caption: ensureNonEmptyString(input.caption, "schedule.caption"),
    hashtags: dedupeStrings(input.hashtags),
    status: "scheduled",
    createdAt: timestamp,
    updatedAt: timestamp
  };
};

export const markPublicationSchedulePublished = (
  schedule: PublicationSchedule,
  input: {
    publishedAt: Date;
    externalPublicationId?: string;
  }
): PublicationSchedule => {
  return {
    ...schedule,
    status: "published",
    publishedAt: input.publishedAt,
    updatedAt: now(),
    ...(input.externalPublicationId ? { externalPublicationId: input.externalPublicationId } : {})
  };
};
