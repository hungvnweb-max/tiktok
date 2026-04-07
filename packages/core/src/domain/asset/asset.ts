import {
  DomainError,
  createEntityId,
  ensureNonEmptyString,
  ensurePositiveInteger,
  now,
  type AuditableEntity,
  type MetadataRecord
} from "../common/entity";
import type { ImageGenerationProvider, RenderProvider, VoiceoverProvider } from "../common/providers";

export type AssetType = "image" | "audio" | "video";
export type AssetRole = "scene_image" | "scene_voice" | "render_output";
export type AssetStatus = "ready" | "archived";
export type AssetSourceType = "manual_upload" | "provider_generated";
export const assetStorageProviders = ["external_url", "s3", "local"] as const;
export type AssetStorageProvider = (typeof assetStorageProviders)[number];
export type AssetProvider = ImageGenerationProvider | VoiceoverProvider | RenderProvider | "manual";

export interface AssetStorageReference {
  storageProvider: AssetStorageProvider;
  url: string;
  storageKey?: string;
  mimeType?: string;
  bytes?: number;
}

export interface Asset extends AuditableEntity {
  videoId: string;
  sceneId?: string;
  type: AssetType;
  role: AssetRole;
  provider: AssetProvider;
  sourceType: AssetSourceType;
  status: AssetStatus;
  versionNumber: number;
  isActive: boolean;
  storage: AssetStorageReference;
  width?: number;
  height?: number;
  durationSeconds?: number;
  metadata?: MetadataRecord;
}

export interface CreateAssetInput {
  videoId: string;
  sceneId?: string;
  type: AssetType;
  role: AssetRole;
  provider: AssetProvider;
  sourceType: AssetSourceType;
  versionNumber: number;
  isActive?: boolean;
  storage: AssetStorageReference;
  width?: number;
  height?: number;
  durationSeconds?: number;
  metadata?: MetadataRecord;
}

export const isAssetStorageProvider = (value: string): value is AssetStorageProvider => {
  return (assetStorageProviders as readonly string[]).includes(value);
};

const normalizeAssetStorageReference = (
  storage: AssetStorageReference,
  fieldPrefix: string = "asset.storage"
): AssetStorageReference => {
  const storageProvider = storage.storageProvider;

  if (!isAssetStorageProvider(storageProvider)) {
    throw new DomainError(
      `${fieldPrefix}.storageProvider must be one of: ${assetStorageProviders.join(", ")}.`
    );
  }

  return {
    storageProvider,
    url: ensureNonEmptyString(storage.url, `${fieldPrefix}.url`),
    ...(storage.storageKey
      ? {
          storageKey: ensureNonEmptyString(storage.storageKey, `${fieldPrefix}.storageKey`)
        }
      : {}),
    ...(storage.mimeType
      ? {
          mimeType: ensureNonEmptyString(storage.mimeType, `${fieldPrefix}.mimeType`)
        }
      : {}),
    ...(storage.bytes === undefined
      ? {}
      : {
          bytes: ensurePositiveInteger(storage.bytes, `${fieldPrefix}.bytes`)
        })
  };
};

export const createAsset = (input: CreateAssetInput): Asset => {
  const timestamp = now();

  return {
    id: createEntityId("asset"),
    videoId: ensureNonEmptyString(input.videoId, "asset.videoId"),
    ...(input.sceneId
      ? {
          sceneId: ensureNonEmptyString(input.sceneId, "asset.sceneId")
        }
      : {}),
    type: input.type,
    role: input.role,
    provider: input.provider,
    sourceType: input.sourceType,
    status: "ready",
    versionNumber: ensurePositiveInteger(input.versionNumber, "asset.versionNumber"),
    isActive: input.isActive ?? false,
    storage: normalizeAssetStorageReference(input.storage),
    createdAt: timestamp,
    updatedAt: timestamp,
    ...(input.width === undefined ? {} : { width: ensurePositiveInteger(input.width, "asset.width") }),
    ...(input.height === undefined ? {} : { height: ensurePositiveInteger(input.height, "asset.height") }),
    ...(input.durationSeconds === undefined
      ? {}
      : {
          durationSeconds: ensurePositiveInteger(input.durationSeconds, "asset.durationSeconds")
        }),
    ...(input.metadata ? { metadata: input.metadata } : {})
  };
};

export const activateAsset = (asset: Asset): Asset => {
  if (asset.status !== "ready") {
    throw new DomainError(`Asset "${asset.id}" cannot be activated from status "${asset.status}".`);
  }

  return {
    ...asset,
    isActive: true,
    updatedAt: now()
  };
};

export const deactivateAsset = (asset: Asset): Asset => {
  return {
    ...asset,
    isActive: false,
    updatedAt: now()
  };
};

export const archiveAsset = (asset: Asset): Asset => {
  return {
    ...asset,
    status: "archived",
    isActive: false,
    updatedAt: now()
  };
};
