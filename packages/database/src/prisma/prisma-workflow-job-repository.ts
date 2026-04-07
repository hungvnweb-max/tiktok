import type {
  EntityReference,
  WorkflowJob,
  WorkflowJobRepository,
  WorkflowJobType
} from "@videotik/core";
import {
  WorkflowJobStatus as PrismaWorkflowJobStatus,
  WorkflowJobType as PrismaWorkflowJobType,
  type PrismaClient
} from "@prisma/client";
import {
  mapReferenceTypeFromPrisma,
  mapReferenceTypeToPrisma,
  readMetadataRecord,
  toNullableJsonValue
} from "./shared-operational-mappers";

const mapWorkflowJobTypeToPrisma = (type: WorkflowJob["type"]): PrismaWorkflowJobType => {
  switch (type) {
    case "idea_generation":
      return PrismaWorkflowJobType.IDEA_GENERATION;
    case "script_generation":
      return PrismaWorkflowJobType.SCRIPT_GENERATION;
    case "caption_generation":
      return PrismaWorkflowJobType.CAPTION_GENERATION;
    case "image_prompt_generation":
      return PrismaWorkflowJobType.IMAGE_PROMPT_GENERATION;
    case "subtitle_pack_generation":
      return PrismaWorkflowJobType.SUBTITLE_PACK_GENERATION;
    case "voice_generation":
      return PrismaWorkflowJobType.VOICE_GENERATION;
    case "render":
      return PrismaWorkflowJobType.RENDER;
    case "publish":
      return PrismaWorkflowJobType.PUBLISH;
  }
};

const mapWorkflowJobTypeFromPrisma = (type: PrismaWorkflowJobType): WorkflowJob["type"] => {
  switch (type) {
    case PrismaWorkflowJobType.IDEA_GENERATION:
      return "idea_generation";
    case PrismaWorkflowJobType.SCRIPT_GENERATION:
      return "script_generation";
    case PrismaWorkflowJobType.CAPTION_GENERATION:
      return "caption_generation";
    case PrismaWorkflowJobType.IMAGE_PROMPT_GENERATION:
      return "image_prompt_generation";
    case PrismaWorkflowJobType.SUBTITLE_PACK_GENERATION:
      return "subtitle_pack_generation";
    case PrismaWorkflowJobType.VOICE_GENERATION:
      return "voice_generation";
    case PrismaWorkflowJobType.RENDER:
      return "render";
    case PrismaWorkflowJobType.PUBLISH:
      return "publish";
  }
};

const mapWorkflowJobStatusToPrisma = (
  status: WorkflowJob["status"]
): PrismaWorkflowJobStatus => {
  switch (status) {
    case "waiting":
      return PrismaWorkflowJobStatus.WAITING;
    case "processing":
      return PrismaWorkflowJobStatus.PROCESSING;
    case "completed":
      return PrismaWorkflowJobStatus.COMPLETED;
    case "failed":
      return PrismaWorkflowJobStatus.FAILED;
    case "retrying":
      return PrismaWorkflowJobStatus.RETRYING;
  }
};

const mapWorkflowJobStatusFromPrisma = (
  status: PrismaWorkflowJobStatus
): WorkflowJob["status"] => {
  switch (status) {
    case PrismaWorkflowJobStatus.WAITING:
      return "waiting";
    case PrismaWorkflowJobStatus.PROCESSING:
      return "processing";
    case PrismaWorkflowJobStatus.COMPLETED:
      return "completed";
    case PrismaWorkflowJobStatus.FAILED:
      return "failed";
    case PrismaWorkflowJobStatus.RETRYING:
      return "retrying";
  }
};

const mapPrismaWorkflowJobToDomain = (record: {
  id: string;
  type: PrismaWorkflowJobType;
  status: PrismaWorkflowJobStatus;
  referenceType: ReturnType<typeof mapReferenceTypeToPrisma>;
  referenceId: string;
  attemptCount: number;
  maxAttempts: number;
  payload: unknown;
  resultMetadata: unknown;
  lastError: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  leaseOwner: string | null;
  leaseToken: string | null;
  leaseExpiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): WorkflowJob => {
  const job: WorkflowJob = {
    id: record.id,
    type: mapWorkflowJobTypeFromPrisma(record.type),
    status: mapWorkflowJobStatusFromPrisma(record.status),
    reference: {
      entityType: mapReferenceTypeFromPrisma(record.referenceType),
      entityId: record.referenceId
    },
    attemptCount: record.attemptCount,
    maxAttempts: record.maxAttempts,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
  const payload = readMetadataRecord(record.payload as never);
  const resultMetadata = readMetadataRecord(record.resultMetadata as never);

  if (payload) {
    job.payload = payload;
  }
  if (resultMetadata) {
    job.resultMetadata = resultMetadata;
  }
  if (record.lastError) {
    job.lastError = record.lastError;
  }
  if (record.startedAt) {
    job.startedAt = record.startedAt;
  }
  if (record.finishedAt) {
    job.finishedAt = record.finishedAt;
  }
  if (record.leaseOwner && record.leaseToken && record.leaseExpiresAt) {
    job.lease = {
      ownerId: record.leaseOwner,
      token: record.leaseToken,
      expiresAt: record.leaseExpiresAt
    };
  }

  return job;
};

const mapWorkflowJobToPrismaCreateData = (job: WorkflowJob) => {
  return {
    id: job.id,
    type: mapWorkflowJobTypeToPrisma(job.type),
    status: mapWorkflowJobStatusToPrisma(job.status),
    referenceType: mapReferenceTypeToPrisma(job.reference.entityType),
    referenceId: job.reference.entityId,
    attemptCount: job.attemptCount,
    maxAttempts: job.maxAttempts,
    payload: toNullableJsonValue(job.payload),
    resultMetadata: toNullableJsonValue(job.resultMetadata),
    lastError: job.lastError ?? null,
    startedAt: job.startedAt ?? null,
    finishedAt: job.finishedAt ?? null,
    leaseOwner: job.lease?.ownerId ?? null,
    leaseToken: job.lease?.token ?? null,
    leaseExpiresAt: job.lease?.expiresAt ?? null,
    createdAt: job.createdAt
  };
};

const mapWorkflowJobToPrismaUpdateData = (job: WorkflowJob) => {
  return {
    type: mapWorkflowJobTypeToPrisma(job.type),
    status: mapWorkflowJobStatusToPrisma(job.status),
    referenceType: mapReferenceTypeToPrisma(job.reference.entityType),
    referenceId: job.reference.entityId,
    attemptCount: job.attemptCount,
    maxAttempts: job.maxAttempts,
    payload: toNullableJsonValue(job.payload),
    resultMetadata: toNullableJsonValue(job.resultMetadata),
    lastError: job.lastError ?? null,
    startedAt: job.startedAt ?? null,
    finishedAt: job.finishedAt ?? null,
    leaseOwner: job.lease?.ownerId ?? null,
    leaseToken: job.lease?.token ?? null,
    leaseExpiresAt: job.lease?.expiresAt ?? null
  };
};

export class PrismaWorkflowJobRepository implements WorkflowJobRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async save(job: WorkflowJob): Promise<void> {
    await this.prisma.workflowJob.upsert({
      where: {
        id: job.id
      },
      create: mapWorkflowJobToPrismaCreateData(job),
      update: mapWorkflowJobToPrismaUpdateData(job)
    });
  }

  async findById(jobId: string): Promise<WorkflowJob | undefined> {
    const job = await this.prisma.workflowJob.findUnique({
      where: {
        id: jobId
      }
    });

    return job ? mapPrismaWorkflowJobToDomain(job) : undefined;
  }

  async list(): Promise<WorkflowJob[]> {
    const jobs = await this.prisma.workflowJob.findMany({
      orderBy: {
        createdAt: "asc"
      }
    });

    return jobs.map(mapPrismaWorkflowJobToDomain);
  }

  async listByReference(reference: EntityReference, type?: WorkflowJobType): Promise<WorkflowJob[]> {
    const jobs = await this.prisma.workflowJob.findMany({
      where: {
        referenceType: mapReferenceTypeToPrisma(reference.entityType),
        referenceId: reference.entityId,
        ...(type ? { type: mapWorkflowJobTypeToPrisma(type) } : {})
      },
      orderBy: {
        createdAt: "asc"
      }
    });

    return jobs.map(mapPrismaWorkflowJobToDomain);
  }

  async tryAcquireLease(
    jobId: string,
    input: {
      ownerId: string;
      leaseToken: string;
      leaseExpiresAt: Date;
      expectedStatuses?: WorkflowJob["status"][];
    }
  ): Promise<WorkflowJob | undefined> {
    const expectedStatuses = input.expectedStatuses?.map((status) =>
      mapWorkflowJobStatusToPrisma(status)
    );
    const acquired = await this.prisma.workflowJob.updateMany({
      where: {
        id: jobId,
        ...(expectedStatuses ? { status: { in: expectedStatuses } } : {}),
        OR: [
          {
            leaseExpiresAt: null
          },
          {
            leaseExpiresAt: {
              lte: new Date()
            }
          },
          {
            leaseToken: input.leaseToken
          }
        ]
      },
      data: {
        leaseOwner: input.ownerId,
        leaseToken: input.leaseToken,
        leaseExpiresAt: input.leaseExpiresAt
      }
    });

    if (acquired.count === 0) {
      return undefined;
    }

    return this.findById(jobId);
  }

  async releaseLease(jobId: string, leaseToken: string): Promise<boolean> {
    const released = await this.prisma.workflowJob.updateMany({
      where: {
        id: jobId,
        leaseToken
      },
      data: {
        leaseOwner: null,
        leaseToken: null,
        leaseExpiresAt: null
      }
    });

    return released.count > 0;
  }
}
