import type { CallbackReceipt, CallbackReceiptRepository, TrackableEntityType } from "@videotik/core";
import { Prisma, ReferenceEntityType as PrismaReferenceEntityType, type PrismaClient } from "@prisma/client";

const mapReferenceTypeToPrisma = (
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
    case "workflow_job":
      return PrismaReferenceEntityType.WORKFLOW_JOB;
    case "publish_attempt":
      return PrismaReferenceEntityType.PUBLISH_ATTEMPT;
  }
};

const mapReferenceTypeFromPrisma = (
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

const mapPrismaCallbackReceiptToDomain = (
  record: {
    id: string;
    channel: string;
    operation: string;
    provider: string;
    idempotencyKey: string;
    workflowJobId: string | null;
    referenceType: PrismaReferenceEntityType;
    referenceId: string;
    status: string;
    requestMetadata: Prisma.JsonValue | null;
    responsePayload: string | null;
    processedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }
): CallbackReceipt => {
  const callbackReceipt: CallbackReceipt = {
    id: record.id,
    channel: record.channel as CallbackReceipt["channel"],
    operation: record.operation,
    provider: record.provider,
    idempotencyKey: record.idempotencyKey,
    reference: {
      entityType: mapReferenceTypeFromPrisma(record.referenceType),
      entityId: record.referenceId
    },
    status: record.status as CallbackReceipt["status"],
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };

  if (record.workflowJobId) {
    callbackReceipt.workflowJobId = record.workflowJobId;
  }

  if (record.requestMetadata && typeof record.requestMetadata === "object" && !Array.isArray(record.requestMetadata)) {
    callbackReceipt.requestMetadata =
      record.requestMetadata as NonNullable<CallbackReceipt["requestMetadata"]>;
  }

  if (record.responsePayload) {
    callbackReceipt.responsePayload = record.responsePayload;
  }

  if (record.processedAt) {
    callbackReceipt.processedAt = record.processedAt;
  }

  return callbackReceipt;
};

const mapCallbackReceiptToPrismaCreateData = (
  callbackReceipt: CallbackReceipt
): Prisma.CallbackReceiptUncheckedCreateInput => {
  return {
    id: callbackReceipt.id,
    channel: callbackReceipt.channel,
    operation: callbackReceipt.operation,
    provider: callbackReceipt.provider,
    idempotencyKey: callbackReceipt.idempotencyKey,
    referenceType: mapReferenceTypeToPrisma(callbackReceipt.reference.entityType),
    referenceId: callbackReceipt.reference.entityId,
    status: callbackReceipt.status,
    ...(callbackReceipt.workflowJobId ? { workflowJobId: callbackReceipt.workflowJobId } : {}),
    ...(callbackReceipt.requestMetadata
      ? {
          requestMetadata: callbackReceipt.requestMetadata as unknown as Prisma.InputJsonValue
        }
      : {}),
    ...(callbackReceipt.responsePayload ? { responsePayload: callbackReceipt.responsePayload } : {}),
    ...(callbackReceipt.processedAt ? { processedAt: callbackReceipt.processedAt } : {}),
    createdAt: callbackReceipt.createdAt
  };
};

const mapCallbackReceiptToPrismaUpdateData = (
  callbackReceipt: CallbackReceipt
): Prisma.CallbackReceiptUncheckedUpdateInput => {
  return {
    channel: callbackReceipt.channel,
    operation: callbackReceipt.operation,
    provider: callbackReceipt.provider,
    idempotencyKey: callbackReceipt.idempotencyKey,
    referenceType: mapReferenceTypeToPrisma(callbackReceipt.reference.entityType),
    referenceId: callbackReceipt.reference.entityId,
    status: callbackReceipt.status,
    workflowJobId: callbackReceipt.workflowJobId ?? null,
    requestMetadata: callbackReceipt.requestMetadata
      ? (callbackReceipt.requestMetadata as unknown as Prisma.InputJsonValue)
      : Prisma.JsonNull,
    responsePayload: callbackReceipt.responsePayload ?? null,
    processedAt: callbackReceipt.processedAt ?? null
  };
};

const isUniqueConstraintError = (
  error: unknown
): error is Prisma.PrismaClientKnownRequestError => {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
};

export class PrismaCallbackReceiptRepository implements CallbackReceiptRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async save(callbackReceipt: CallbackReceipt): Promise<void> {
    await this.prisma.callbackReceipt.upsert({
      where: {
        id: callbackReceipt.id
      },
      create: mapCallbackReceiptToPrismaCreateData(callbackReceipt),
      update: mapCallbackReceiptToPrismaUpdateData(callbackReceipt)
    });
  }

  async findByIdempotencyKey(idempotencyKey: string): Promise<CallbackReceipt | undefined> {
    const callbackReceipt = await this.prisma.callbackReceipt.findUnique({
      where: {
        idempotencyKey
      }
    });

    return callbackReceipt ? mapPrismaCallbackReceiptToDomain(callbackReceipt) : undefined;
  }

  async reserve(callbackReceipt: CallbackReceipt): Promise<{
    created: boolean;
    callbackReceipt: CallbackReceipt;
  }> {
    try {
      const createdCallbackReceipt = await this.prisma.callbackReceipt.create({
        data: mapCallbackReceiptToPrismaCreateData(callbackReceipt)
      });

      return {
        created: true,
        callbackReceipt: mapPrismaCallbackReceiptToDomain(createdCallbackReceipt)
      };
    } catch (error) {
      if (!isUniqueConstraintError(error)) {
        throw error;
      }

      const existingCallbackReceipt = await this.prisma.callbackReceipt.findUnique({
        where: {
          idempotencyKey: callbackReceipt.idempotencyKey
        }
      });

      if (!existingCallbackReceipt) {
        throw error;
      }

      return {
        created: false,
        callbackReceipt: mapPrismaCallbackReceiptToDomain(existingCallbackReceipt)
      };
    }
  }
}
