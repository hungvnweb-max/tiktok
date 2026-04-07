import type { EntityReference, VersionSnapshot, VersionSnapshotRepository } from "@videotik/core";
import type { PrismaClient } from "@prisma/client";
import { mapReferenceTypeFromPrisma, mapReferenceTypeToPrisma } from "./shared-operational-mappers";

const mapPrismaVersionSnapshotToDomain = (record: {
  id: string;
  referenceType: ReturnType<typeof mapReferenceTypeToPrisma>;
  referenceId: string;
  versionNumber: number;
  sourceAction: string;
  serializedPayload: string;
  createdAt: Date;
  updatedAt: Date;
}): VersionSnapshot => {
  return {
    id: record.id,
    reference: {
      entityType: mapReferenceTypeFromPrisma(record.referenceType),
      entityId: record.referenceId
    },
    versionNumber: record.versionNumber,
    sourceAction: record.sourceAction,
    serializedPayload: record.serializedPayload,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
};

const mapVersionSnapshotToPrismaCreateData = (versionSnapshot: VersionSnapshot) => {
  return {
    id: versionSnapshot.id,
    referenceType: mapReferenceTypeToPrisma(versionSnapshot.reference.entityType),
    referenceId: versionSnapshot.reference.entityId,
    versionNumber: versionSnapshot.versionNumber,
    sourceAction: versionSnapshot.sourceAction,
    serializedPayload: versionSnapshot.serializedPayload,
    createdAt: versionSnapshot.createdAt
  };
};

export class PrismaVersionSnapshotRepository implements VersionSnapshotRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async save(versionSnapshot: VersionSnapshot): Promise<void> {
    await this.prisma.versionSnapshot.upsert({
      where: {
        id: versionSnapshot.id
      },
      create: mapVersionSnapshotToPrismaCreateData(versionSnapshot),
      update: {
        referenceType: mapReferenceTypeToPrisma(versionSnapshot.reference.entityType),
        referenceId: versionSnapshot.reference.entityId,
        versionNumber: versionSnapshot.versionNumber,
        sourceAction: versionSnapshot.sourceAction,
        serializedPayload: versionSnapshot.serializedPayload
      }
    });
  }

  async listByReference(reference: EntityReference): Promise<VersionSnapshot[]> {
    const snapshots = await this.prisma.versionSnapshot.findMany({
      where: {
        referenceType: mapReferenceTypeToPrisma(reference.entityType),
        referenceId: reference.entityId
      },
      orderBy: {
        createdAt: "asc"
      }
    });

    return snapshots.map(mapPrismaVersionSnapshotToDomain);
  }
}
