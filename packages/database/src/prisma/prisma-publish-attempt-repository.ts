import type { PublishAttempt, PublishAttemptRepository } from "@videotik/core";
import { normalizePublishMode } from "@videotik/core";
import {
  PublishAttemptStatus as PrismaPublishAttemptStatus,
  PublishFailureStage as PrismaPublishFailureStage,
  type PrismaClient
} from "@prisma/client";
import {
  readMetadataRecord,
  readStringArray,
  toInputJsonValue,
  toNullableJsonValue
} from "./shared-operational-mappers";

const mapPublishAttemptStatusToPrisma = (
  status: PublishAttempt["status"]
): PrismaPublishAttemptStatus => {
  switch (status) {
    case "pending":
      return PrismaPublishAttemptStatus.PENDING;
    case "processing":
      return PrismaPublishAttemptStatus.PROCESSING;
    case "retrying":
      return PrismaPublishAttemptStatus.RETRYING;
    case "manual_action_required":
      return PrismaPublishAttemptStatus.MANUAL_ACTION_REQUIRED;
    case "submitted":
      return PrismaPublishAttemptStatus.SUBMITTED;
    case "published":
      return PrismaPublishAttemptStatus.PUBLISHED;
    case "failed":
      return PrismaPublishAttemptStatus.FAILED;
  }
};

const mapPublishAttemptStatusFromPrisma = (
  status: PrismaPublishAttemptStatus
): PublishAttempt["status"] => {
  switch (status) {
    case PrismaPublishAttemptStatus.PENDING:
      return "pending";
    case PrismaPublishAttemptStatus.PROCESSING:
      return "processing";
    case PrismaPublishAttemptStatus.RETRYING:
      return "retrying";
    case PrismaPublishAttemptStatus.MANUAL_ACTION_REQUIRED:
      return "manual_action_required";
    case PrismaPublishAttemptStatus.SUBMITTED:
      return "submitted";
    case PrismaPublishAttemptStatus.PUBLISHED:
      return "published";
    case PrismaPublishAttemptStatus.FAILED:
      return "failed";
  }
};

const mapPublishFailureStageToPrisma = (
  stage: PublishAttempt["failureStage"]
): PrismaPublishFailureStage | null => {
  if (!stage) {
    return null;
  }

  switch (stage) {
    case "validation":
      return PrismaPublishFailureStage.VALIDATION;
    case "provider_execution":
      return PrismaPublishFailureStage.PROVIDER_EXECUTION;
    case "workflow":
      return PrismaPublishFailureStage.WORKFLOW;
  }
};

const mapPublishFailureStageFromPrisma = (
  stage: PrismaPublishFailureStage | null
): PublishAttempt["failureStage"] => {
  if (!stage) {
    return undefined;
  }

  switch (stage) {
    case PrismaPublishFailureStage.VALIDATION:
      return "validation";
    case PrismaPublishFailureStage.PROVIDER_EXECUTION:
      return "provider_execution";
    case PrismaPublishFailureStage.WORKFLOW:
      return "workflow";
  }
};

const mapPrismaPublishAttemptToDomain = (record: {
  id: string;
  videoId: string;
  publicationScheduleId: string;
  provider: string;
  platformSlug: string;
  mode: string;
  sequenceNumber: number;
  status: PrismaPublishAttemptStatus;
  workflowAttemptCount: number;
  maxWorkflowAttempts: number;
  workflowJobId: string | null;
  providerStatus: string | null;
  providerPublicationId: string | null;
  externalUrl: string | null;
  checklist: unknown;
  validationIssues: unknown;
  lastError: string | null;
  failureStage: PrismaPublishFailureStage | null;
  publishedAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}): PublishAttempt => {
  const publishAttempt: PublishAttempt = {
    id: record.id,
    videoId: record.videoId,
    publicationScheduleId: record.publicationScheduleId,
    provider: record.provider as PublishAttempt["provider"],
    platformSlug: record.platformSlug,
    mode: normalizePublishMode(record.mode, "publishAttempt.mode"),
    sequenceNumber: record.sequenceNumber,
    status: mapPublishAttemptStatusFromPrisma(record.status),
    workflowAttemptCount: record.workflowAttemptCount,
    maxWorkflowAttempts: record.maxWorkflowAttempts,
    checklist: readStringArray(record.checklist as never),
    validationIssues: readStringArray(record.validationIssues as never),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };

  if (record.workflowJobId) {
    publishAttempt.workflowJobId = record.workflowJobId;
  }
  if (record.providerStatus) {
    publishAttempt.providerStatus = record.providerStatus;
  }
  if (record.providerPublicationId) {
    publishAttempt.providerPublicationId = record.providerPublicationId;
  }
  if (record.externalUrl) {
    publishAttempt.externalUrl = record.externalUrl;
  }
  if (record.lastError) {
    publishAttempt.lastError = record.lastError;
  }
  if (record.publishedAt) {
    publishAttempt.publishedAt = record.publishedAt;
  }
  if (record.startedAt) {
    publishAttempt.startedAt = record.startedAt;
  }
  if (record.completedAt) {
    publishAttempt.completedAt = record.completedAt;
  }

  const failureStage = mapPublishFailureStageFromPrisma(record.failureStage);
  if (failureStage) {
    publishAttempt.failureStage = failureStage;
  }

  const metadata = readMetadataRecord(record.metadata as never);
  if (metadata) {
    publishAttempt.metadata = metadata;
  }

  return publishAttempt;
};

const mapPublishAttemptToPrismaCreateData = (publishAttempt: PublishAttempt) => {
  return {
    id: publishAttempt.id,
    videoId: publishAttempt.videoId,
    publicationScheduleId: publishAttempt.publicationScheduleId,
    provider: publishAttempt.provider,
    platformSlug: publishAttempt.platformSlug,
    mode: publishAttempt.mode,
    sequenceNumber: publishAttempt.sequenceNumber,
    status: mapPublishAttemptStatusToPrisma(publishAttempt.status),
    workflowAttemptCount: publishAttempt.workflowAttemptCount,
    maxWorkflowAttempts: publishAttempt.maxWorkflowAttempts,
    workflowJobId: publishAttempt.workflowJobId ?? null,
    providerStatus: publishAttempt.providerStatus ?? null,
    providerPublicationId: publishAttempt.providerPublicationId ?? null,
    externalUrl: publishAttempt.externalUrl ?? null,
    checklist: toInputJsonValue(publishAttempt.checklist),
    validationIssues: toInputJsonValue(publishAttempt.validationIssues),
    lastError: publishAttempt.lastError ?? null,
    failureStage: mapPublishFailureStageToPrisma(publishAttempt.failureStage),
    publishedAt: publishAttempt.publishedAt ?? null,
    startedAt: publishAttempt.startedAt ?? null,
    completedAt: publishAttempt.completedAt ?? null,
    metadata: toNullableJsonValue(publishAttempt.metadata),
    createdAt: publishAttempt.createdAt
  };
};

const mapPublishAttemptToPrismaUpdateData = (publishAttempt: PublishAttempt) => {
  return {
    videoId: publishAttempt.videoId,
    publicationScheduleId: publishAttempt.publicationScheduleId,
    provider: publishAttempt.provider,
    platformSlug: publishAttempt.platformSlug,
    mode: publishAttempt.mode,
    sequenceNumber: publishAttempt.sequenceNumber,
    status: mapPublishAttemptStatusToPrisma(publishAttempt.status),
    workflowAttemptCount: publishAttempt.workflowAttemptCount,
    maxWorkflowAttempts: publishAttempt.maxWorkflowAttempts,
    workflowJobId: publishAttempt.workflowJobId ?? null,
    providerStatus: publishAttempt.providerStatus ?? null,
    providerPublicationId: publishAttempt.providerPublicationId ?? null,
    externalUrl: publishAttempt.externalUrl ?? null,
    checklist: toInputJsonValue(publishAttempt.checklist),
    validationIssues: toInputJsonValue(publishAttempt.validationIssues),
    lastError: publishAttempt.lastError ?? null,
    failureStage: mapPublishFailureStageToPrisma(publishAttempt.failureStage),
    publishedAt: publishAttempt.publishedAt ?? null,
    startedAt: publishAttempt.startedAt ?? null,
    completedAt: publishAttempt.completedAt ?? null,
    metadata: toNullableJsonValue(publishAttempt.metadata)
  };
};

export class PrismaPublishAttemptRepository implements PublishAttemptRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async save(publishAttempt: PublishAttempt): Promise<void> {
    await this.prisma.publishAttempt.upsert({
      where: {
        id: publishAttempt.id
      },
      create: mapPublishAttemptToPrismaCreateData(publishAttempt),
      update: mapPublishAttemptToPrismaUpdateData(publishAttempt)
    });
  }

  async findById(publishAttemptId: string): Promise<PublishAttempt | undefined> {
    const publishAttempt = await this.prisma.publishAttempt.findUnique({
      where: {
        id: publishAttemptId
      }
    });

    return publishAttempt ? mapPrismaPublishAttemptToDomain(publishAttempt) : undefined;
  }

  async list(): Promise<PublishAttempt[]> {
    const publishAttempts = await this.prisma.publishAttempt.findMany({
      orderBy: {
        createdAt: "asc"
      }
    });

    return publishAttempts.map(mapPrismaPublishAttemptToDomain);
  }

  async listByVideoId(videoId: string): Promise<PublishAttempt[]> {
    const publishAttempts = await this.prisma.publishAttempt.findMany({
      where: {
        videoId
      },
      orderBy: {
        createdAt: "asc"
      }
    });

    return publishAttempts.map(mapPrismaPublishAttemptToDomain);
  }
}
