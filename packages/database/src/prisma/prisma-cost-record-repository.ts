import type { CostRecord, CostRecordRepository, EntityReference } from "@videotik/core";
import { CostCategory as PrismaCostCategory, type PrismaClient } from "@prisma/client";
import {
  mapReferenceTypeFromPrisma,
  mapReferenceTypeToPrisma,
  readMetadataRecord,
  toNullableJsonValue
} from "./shared-operational-mappers";

const mapCostCategoryToPrisma = (category: CostRecord["category"]): PrismaCostCategory => {
  switch (category) {
    case "text_generation":
      return PrismaCostCategory.TEXT_GENERATION;
    case "image_generation":
      return PrismaCostCategory.IMAGE_GENERATION;
    case "voice_generation":
      return PrismaCostCategory.VOICE_GENERATION;
    case "subtitle_generation":
      return PrismaCostCategory.SUBTITLE_GENERATION;
    case "render":
      return PrismaCostCategory.RENDER;
    case "publishing":
      return PrismaCostCategory.PUBLISHING;
  }
};

const mapCostCategoryFromPrisma = (category: PrismaCostCategory): CostRecord["category"] => {
  switch (category) {
    case PrismaCostCategory.TEXT_GENERATION:
      return "text_generation";
    case PrismaCostCategory.IMAGE_GENERATION:
      return "image_generation";
    case PrismaCostCategory.VOICE_GENERATION:
      return "voice_generation";
    case PrismaCostCategory.SUBTITLE_GENERATION:
      return "subtitle_generation";
    case PrismaCostCategory.RENDER:
      return "render";
    case PrismaCostCategory.PUBLISHING:
      return "publishing";
  }
};

const mapPrismaCostRecordToDomain = (record: {
  id: string;
  provider: string;
  category: PrismaCostCategory;
  referenceType: ReturnType<typeof mapReferenceTypeToPrisma>;
  referenceId: string;
  amount: number;
  currency: string;
  units: string;
  quantity: number;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}): CostRecord => {
  const costRecord: CostRecord = {
    id: record.id,
    provider: record.provider,
    category: mapCostCategoryFromPrisma(record.category),
    reference: {
      entityType: mapReferenceTypeFromPrisma(record.referenceType),
      entityId: record.referenceId
    },
    amount: record.amount,
    currency: record.currency,
    units: record.units,
    quantity: record.quantity,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
  const metadata = readMetadataRecord(record.metadata as never);

  if (metadata) {
    costRecord.metadata = metadata;
  }

  return costRecord;
};

const mapCostRecordToPrismaCreateData = (costRecord: CostRecord) => {
  return {
    id: costRecord.id,
    provider: costRecord.provider,
    category: mapCostCategoryToPrisma(costRecord.category),
    referenceType: mapReferenceTypeToPrisma(costRecord.reference.entityType),
    referenceId: costRecord.reference.entityId,
    amount: costRecord.amount,
    currency: costRecord.currency,
    units: costRecord.units,
    quantity: costRecord.quantity,
    metadata: toNullableJsonValue(costRecord.metadata),
    createdAt: costRecord.createdAt
  };
};

export class PrismaCostRecordRepository implements CostRecordRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async save(costRecord: CostRecord): Promise<void> {
    await this.prisma.costRecord.upsert({
      where: {
        id: costRecord.id
      },
      create: mapCostRecordToPrismaCreateData(costRecord),
      update: {
        provider: costRecord.provider,
        category: mapCostCategoryToPrisma(costRecord.category),
        referenceType: mapReferenceTypeToPrisma(costRecord.reference.entityType),
        referenceId: costRecord.reference.entityId,
        amount: costRecord.amount,
        currency: costRecord.currency,
        units: costRecord.units,
        quantity: costRecord.quantity,
        metadata: toNullableJsonValue(costRecord.metadata)
      }
    });
  }

  async list(): Promise<CostRecord[]> {
    const records = await this.prisma.costRecord.findMany({
      orderBy: {
        createdAt: "asc"
      }
    });

    return records.map(mapPrismaCostRecordToDomain);
  }

  async listByReference(reference: EntityReference): Promise<CostRecord[]> {
    const records = await this.prisma.costRecord.findMany({
      where: {
        referenceType: mapReferenceTypeToPrisma(reference.entityType),
        referenceId: reference.entityId
      },
      orderBy: {
        createdAt: "asc"
      }
    });

    return records.map(mapPrismaCostRecordToDomain);
  }
}
