import type { MetadataRecord, TrackableEntityType } from "@videotik/core";
import {
  Prisma,
  ReferenceEntityType as PrismaReferenceEntityType,
  type ActivityLog as PrismaActivityLogRecord,
  type CostRecord as PrismaCostRecordRecord,
  type WorkflowJob as PrismaWorkflowJobRecord,
  type WorkflowJobLog as PrismaWorkflowJobLogRecord
} from "@prisma/client";

type PrismaJsonObject = Record<string, Prisma.JsonValue>;

export const isJsonObject = (
  value: Prisma.JsonValue | null | undefined
): value is PrismaJsonObject => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

export const isJsonArray = (
  value: Prisma.JsonValue | null | undefined
): value is Prisma.JsonValue[] => {
  return Array.isArray(value);
};

export const readStringArray = (value: Prisma.JsonValue | null | undefined): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
};

export const readMetadataRecord = (
  value: Prisma.JsonValue | null | undefined
): MetadataRecord | undefined => {
  if (!isJsonObject(value)) {
    return undefined;
  }

  const metadata: MetadataRecord = {};

  for (const [key, item] of Object.entries(value)) {
    if (
      typeof item === "string" ||
      typeof item === "number" ||
      typeof item === "boolean" ||
      item === null
    ) {
      metadata[key] = item;
    }
  }

  return Object.keys(metadata).length > 0 ? metadata : undefined;
};

export const readDateValue = (
  value: Prisma.JsonValue | null | undefined
): Date | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
};

export const toInputJsonValue = (value: unknown): Prisma.InputJsonValue => {
  return value as Prisma.InputJsonValue;
};

export const toNullableJsonValue = (
  value: unknown
): Prisma.InputJsonValue | typeof Prisma.JsonNull => {
  if (value === undefined || value === null) {
    return Prisma.JsonNull;
  }

  return toInputJsonValue(value);
};

export const mapReferenceTypeToPrisma = (
  entityType: TrackableEntityType
): PrismaReferenceEntityType => {
  switch (entityType) {
    case "topic":
      return PrismaReferenceEntityType.TOPIC;
    case "content_format":
      return PrismaReferenceEntityType.CONTENT_FORMAT;
    case "idea":
      return PrismaReferenceEntityType.IDEA;
    case "script":
      return PrismaReferenceEntityType.SCRIPT;
    case "caption":
      return PrismaReferenceEntityType.CAPTION;
    case "video":
      return PrismaReferenceEntityType.VIDEO;
    case "image_prompt_pack":
      return PrismaReferenceEntityType.IMAGE_PROMPT_PACK;
    case "subtitle_pack":
      return PrismaReferenceEntityType.SUBTITLE_PACK;
    case "asset":
      return PrismaReferenceEntityType.ASSET;
    case "voice_job":
      return PrismaReferenceEntityType.VOICE_JOB;
    case "publication_schedule":
      return PrismaReferenceEntityType.PUBLICATION_SCHEDULE;
    case "publish_attempt":
      return PrismaReferenceEntityType.PUBLISH_ATTEMPT;
    case "workflow_job":
      return PrismaReferenceEntityType.WORKFLOW_JOB;
  }
};

export const mapReferenceTypeFromPrisma = (
  entityType: PrismaReferenceEntityType
): TrackableEntityType => {
  switch (entityType) {
    case PrismaReferenceEntityType.TOPIC:
      return "topic";
    case PrismaReferenceEntityType.CONTENT_FORMAT:
      return "content_format";
    case PrismaReferenceEntityType.IDEA:
      return "idea";
    case PrismaReferenceEntityType.SCRIPT:
      return "script";
    case PrismaReferenceEntityType.CAPTION:
      return "caption";
    case PrismaReferenceEntityType.VIDEO:
      return "video";
    case PrismaReferenceEntityType.IMAGE_PROMPT_PACK:
      return "image_prompt_pack";
    case PrismaReferenceEntityType.SUBTITLE_PACK:
      return "subtitle_pack";
    case PrismaReferenceEntityType.ASSET:
      return "asset";
    case PrismaReferenceEntityType.VOICE_JOB:
      return "voice_job";
    case PrismaReferenceEntityType.PUBLICATION_SCHEDULE:
      return "publication_schedule";
    case PrismaReferenceEntityType.PUBLISH_ATTEMPT:
      return "publish_attempt";
    case PrismaReferenceEntityType.WORKFLOW_JOB:
      return "workflow_job";
  }
};

export const buildImmutableCreateInput = <TInput extends { id: string; createdAt: Date }>(
  value: TInput
) => {
  return {
    id: value.id,
    createdAt: value.createdAt
  };
};

export type PrismaOperationalReferenceRecord =
  | PrismaActivityLogRecord
  | PrismaCostRecordRecord
  | PrismaWorkflowJobRecord
  | PrismaWorkflowJobLogRecord;
