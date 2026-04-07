import type { ActivityLog, ActivityLogRepository, EntityReference } from "@videotik/core";
import { ActivityActorType as PrismaActivityActorType, type PrismaClient } from "@prisma/client";
import {
  mapReferenceTypeFromPrisma,
  mapReferenceTypeToPrisma,
  readMetadataRecord,
  toNullableJsonValue
} from "./shared-operational-mappers";

const mapActivityActorTypeToPrisma = (type: ActivityLog["actorType"]): PrismaActivityActorType => {
  switch (type) {
    case "system":
      return PrismaActivityActorType.SYSTEM;
    case "user":
      return PrismaActivityActorType.USER;
    case "worker":
      return PrismaActivityActorType.WORKER;
  }
};

const mapActivityActorTypeFromPrisma = (
  type: PrismaActivityActorType
): ActivityLog["actorType"] => {
  switch (type) {
    case PrismaActivityActorType.SYSTEM:
      return "system";
    case PrismaActivityActorType.USER:
      return "user";
    case PrismaActivityActorType.WORKER:
      return "worker";
  }
};

const mapPrismaActivityLogToDomain = (record: {
  id: string;
  actorType: PrismaActivityActorType;
  actorId: string;
  action: string;
  referenceType: ReturnType<typeof mapReferenceTypeToPrisma>;
  referenceId: string;
  message: string;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}): ActivityLog => {
  const activityLog: ActivityLog = {
    id: record.id,
    actorType: mapActivityActorTypeFromPrisma(record.actorType),
    actorId: record.actorId,
    action: record.action,
    reference: {
      entityType: mapReferenceTypeFromPrisma(record.referenceType),
      entityId: record.referenceId
    },
    message: record.message,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
  const metadata = readMetadataRecord(record.metadata as never);

  if (metadata) {
    activityLog.metadata = metadata;
  }

  return activityLog;
};

const mapActivityLogToPrismaCreateData = (activityLog: ActivityLog) => {
  return {
    id: activityLog.id,
    actorType: mapActivityActorTypeToPrisma(activityLog.actorType),
    actorId: activityLog.actorId,
    action: activityLog.action,
    referenceType: mapReferenceTypeToPrisma(activityLog.reference.entityType),
    referenceId: activityLog.reference.entityId,
    message: activityLog.message,
    metadata: toNullableJsonValue(activityLog.metadata),
    createdAt: activityLog.createdAt
  };
};

export class PrismaActivityLogRepository implements ActivityLogRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async save(activityLog: ActivityLog): Promise<void> {
    await this.prisma.activityLog.upsert({
      where: {
        id: activityLog.id
      },
      create: mapActivityLogToPrismaCreateData(activityLog),
      update: {
        actorType: mapActivityActorTypeToPrisma(activityLog.actorType),
        actorId: activityLog.actorId,
        action: activityLog.action,
        referenceType: mapReferenceTypeToPrisma(activityLog.reference.entityType),
        referenceId: activityLog.reference.entityId,
        message: activityLog.message,
        metadata: toNullableJsonValue(activityLog.metadata)
      }
    });
  }

  async list(): Promise<ActivityLog[]> {
    const logs = await this.prisma.activityLog.findMany({
      orderBy: {
        createdAt: "asc"
      }
    });

    return logs.map(mapPrismaActivityLogToDomain);
  }

  async listByReference(reference: EntityReference): Promise<ActivityLog[]> {
    const logs = await this.prisma.activityLog.findMany({
      where: {
        referenceType: mapReferenceTypeToPrisma(reference.entityType),
        referenceId: reference.entityId
      },
      orderBy: {
        createdAt: "asc"
      }
    });

    return logs.map(mapPrismaActivityLogToDomain);
  }
}
