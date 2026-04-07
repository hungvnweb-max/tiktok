import type { Asset, AssetRepository } from "@videotik/core";
import {
  AssetRole as PrismaAssetRole,
  AssetSourceType as PrismaAssetSourceType,
  AssetStatus as PrismaAssetStatus,
  AssetStorageProvider as PrismaAssetStorageProvider,
  AssetType as PrismaAssetType,
  type PrismaClient
} from "@prisma/client";
import {
  readMetadataRecord,
  toInputJsonValue,
  toNullableJsonValue
} from "./shared-operational-mappers";

const mapAssetTypeToPrisma = (type: Asset["type"]): PrismaAssetType => {
  switch (type) {
    case "image":
      return PrismaAssetType.IMAGE;
    case "audio":
      return PrismaAssetType.AUDIO;
    case "video":
      return PrismaAssetType.VIDEO;
  }
};

const mapAssetTypeFromPrisma = (type: PrismaAssetType): Asset["type"] => {
  switch (type) {
    case PrismaAssetType.IMAGE:
      return "image";
    case PrismaAssetType.AUDIO:
      return "audio";
    case PrismaAssetType.VIDEO:
      return "video";
  }
};

const mapAssetRoleToPrisma = (role: Asset["role"]): PrismaAssetRole => {
  switch (role) {
    case "scene_image":
      return PrismaAssetRole.SCENE_IMAGE;
    case "scene_voice":
      return PrismaAssetRole.SCENE_VOICE;
    case "render_output":
      return PrismaAssetRole.RENDER_OUTPUT;
  }
};

const mapAssetRoleFromPrisma = (role: PrismaAssetRole): Asset["role"] => {
  switch (role) {
    case PrismaAssetRole.SCENE_IMAGE:
      return "scene_image";
    case PrismaAssetRole.SCENE_VOICE:
      return "scene_voice";
    case PrismaAssetRole.RENDER_OUTPUT:
      return "render_output";
  }
};

const mapAssetStatusToPrisma = (status: Asset["status"]): PrismaAssetStatus => {
  switch (status) {
    case "ready":
      return PrismaAssetStatus.READY;
    case "archived":
      return PrismaAssetStatus.ARCHIVED;
  }
};

const mapAssetStatusFromPrisma = (status: PrismaAssetStatus): Asset["status"] => {
  switch (status) {
    case PrismaAssetStatus.READY:
      return "ready";
    case PrismaAssetStatus.ARCHIVED:
      return "archived";
  }
};

const mapAssetSourceTypeToPrisma = (sourceType: Asset["sourceType"]): PrismaAssetSourceType => {
  switch (sourceType) {
    case "manual_upload":
      return PrismaAssetSourceType.MANUAL_UPLOAD;
    case "provider_generated":
      return PrismaAssetSourceType.PROVIDER_GENERATED;
  }
};

const mapAssetSourceTypeFromPrisma = (
  sourceType: PrismaAssetSourceType
): Asset["sourceType"] => {
  switch (sourceType) {
    case PrismaAssetSourceType.MANUAL_UPLOAD:
      return "manual_upload";
    case PrismaAssetSourceType.PROVIDER_GENERATED:
      return "provider_generated";
  }
};

const mapAssetStorageProviderToPrisma = (
  storageProvider: Asset["storage"]["storageProvider"]
): PrismaAssetStorageProvider => {
  switch (storageProvider) {
    case "external_url":
      return PrismaAssetStorageProvider.EXTERNAL_URL;
    case "s3":
      return PrismaAssetStorageProvider.S3;
    case "local":
      return PrismaAssetStorageProvider.LOCAL;
  }
};

const mapAssetStorageProviderFromPrisma = (
  storageProvider: PrismaAssetStorageProvider
): Asset["storage"]["storageProvider"] => {
  switch (storageProvider) {
    case PrismaAssetStorageProvider.EXTERNAL_URL:
      return "external_url";
    case PrismaAssetStorageProvider.S3:
      return "s3";
    case PrismaAssetStorageProvider.LOCAL:
      return "local";
  }
};

const mapPrismaAssetToDomain = (record: {
  id: string;
  videoId: string;
  sceneId: string | null;
  type: PrismaAssetType;
  role: PrismaAssetRole;
  provider: string;
  sourceType: PrismaAssetSourceType;
  status: PrismaAssetStatus;
  versionNumber: number;
  isActive: boolean;
  storageProvider: PrismaAssetStorageProvider;
  assetUrl: string;
  storageKey: string | null;
  mimeType: string | null;
  bytes: number | null;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}): Asset => {
  const asset: Asset = {
    id: record.id,
    videoId: record.videoId,
    type: mapAssetTypeFromPrisma(record.type),
    role: mapAssetRoleFromPrisma(record.role),
    provider: record.provider as Asset["provider"],
    sourceType: mapAssetSourceTypeFromPrisma(record.sourceType),
    status: mapAssetStatusFromPrisma(record.status),
    versionNumber: record.versionNumber,
    isActive: record.isActive,
    storage: {
      storageProvider: mapAssetStorageProviderFromPrisma(record.storageProvider),
      url: record.assetUrl
    },
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };

  if (record.sceneId) {
    asset.sceneId = record.sceneId;
  }
  if (record.storageKey) {
    asset.storage.storageKey = record.storageKey;
  }
  if (record.mimeType) {
    asset.storage.mimeType = record.mimeType;
  }
  if (record.bytes !== null) {
    asset.storage.bytes = record.bytes;
  }
  if (record.width !== null) {
    asset.width = record.width;
  }
  if (record.height !== null) {
    asset.height = record.height;
  }
  if (record.durationSeconds !== null) {
    asset.durationSeconds = record.durationSeconds;
  }
  const metadata = readMetadataRecord(record.metadata as never);

  if (metadata) {
    asset.metadata = metadata;
  }

  return asset;
};

const mapAssetToPrismaCreateData = (asset: Asset) => {
  return {
    id: asset.id,
    videoId: asset.videoId,
    sceneId: asset.sceneId ?? null,
    type: mapAssetTypeToPrisma(asset.type),
    role: mapAssetRoleToPrisma(asset.role),
    provider: asset.provider,
    sourceType: mapAssetSourceTypeToPrisma(asset.sourceType),
    status: mapAssetStatusToPrisma(asset.status),
    versionNumber: asset.versionNumber,
    isActive: asset.isActive,
    storageProvider: mapAssetStorageProviderToPrisma(asset.storage.storageProvider),
    assetUrl: asset.storage.url,
    storageKey: asset.storage.storageKey ?? null,
    mimeType: asset.storage.mimeType ?? null,
    bytes: asset.storage.bytes ?? null,
    width: asset.width ?? null,
    height: asset.height ?? null,
    durationSeconds: asset.durationSeconds ?? null,
    metadata: toNullableJsonValue(asset.metadata),
    createdAt: asset.createdAt
  };
};

const mapAssetToPrismaUpdateData = (asset: Asset) => {
  return {
    videoId: asset.videoId,
    sceneId: asset.sceneId ?? null,
    type: mapAssetTypeToPrisma(asset.type),
    role: mapAssetRoleToPrisma(asset.role),
    provider: asset.provider,
    sourceType: mapAssetSourceTypeToPrisma(asset.sourceType),
    status: mapAssetStatusToPrisma(asset.status),
    versionNumber: asset.versionNumber,
    isActive: asset.isActive,
    storageProvider: mapAssetStorageProviderToPrisma(asset.storage.storageProvider),
    assetUrl: asset.storage.url,
    storageKey: asset.storage.storageKey ?? null,
    mimeType: asset.storage.mimeType ?? null,
    bytes: asset.storage.bytes ?? null,
    width: asset.width ?? null,
    height: asset.height ?? null,
    durationSeconds: asset.durationSeconds ?? null,
    metadata: toNullableJsonValue(asset.metadata)
  };
};

export class PrismaAssetRepository implements AssetRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async save(asset: Asset): Promise<void> {
    await this.prisma.asset.upsert({
      where: {
        id: asset.id
      },
      create: mapAssetToPrismaCreateData(asset),
      update: mapAssetToPrismaUpdateData(asset)
    });
  }

  async findById(assetId: string): Promise<Asset | undefined> {
    const asset = await this.prisma.asset.findUnique({
      where: {
        id: assetId
      }
    });

    return asset ? mapPrismaAssetToDomain(asset) : undefined;
  }

  async list(): Promise<Asset[]> {
    const assets = await this.prisma.asset.findMany({
      orderBy: {
        createdAt: "asc"
      }
    });

    return assets.map(mapPrismaAssetToDomain);
  }

  async listByVideoId(videoId: string): Promise<Asset[]> {
    const assets = await this.prisma.asset.findMany({
      where: {
        videoId
      },
      orderBy: {
        createdAt: "asc"
      }
    });

    return assets.map(mapPrismaAssetToDomain);
  }

  async listBySceneId(sceneId: string): Promise<Asset[]> {
    const assets = await this.prisma.asset.findMany({
      where: {
        sceneId
      },
      orderBy: {
        createdAt: "asc"
      }
    });

    return assets.map(mapPrismaAssetToDomain);
  }
}
