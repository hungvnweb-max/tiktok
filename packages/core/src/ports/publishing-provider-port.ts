import type { Asset } from "../domain/asset/asset";
import type { ContentCaption } from "../domain/caption/caption";
import type { ErrorDetails, MetadataRecord } from "../domain/common/entity";
import type { PublishMode } from "../domain/common/media";
import type { PublishingProvider } from "../domain/common/providers";
import type { ContentFormat } from "../domain/content-format/content-format";
import type { PublishAttempt } from "../domain/publish/publish-attempt";
import type { PublicationSchedule } from "../domain/schedule/publication-schedule";
import type { Video } from "../domain/video/video";

export interface PublishProviderValidationIssue {
  code: string;
  message: string;
  details?: ErrorDetails;
}

export interface PublishProviderRequest {
  video: Video;
  contentFormat: ContentFormat;
  schedule: PublicationSchedule;
  publishMode: PublishMode;
  callbackToken?: string;
  caption?: ContentCaption;
  activeRenderAsset?: Asset;
  activeImageAssets: Asset[];
  activeAudioAssets: Asset[];
}

export interface PublishProviderValidationResult {
  isValid: boolean;
  issues: PublishProviderValidationIssue[];
  metadata?: MetadataRecord;
}

export interface PublishProviderCost {
  amount: number;
  currency?: string;
  units: string;
  quantity: number;
  metadata?: MetadataRecord;
}

export interface PublishProviderResult {
  status: "manual_action_required" | "submitted" | "published";
  providerStatus: string;
  publicationId?: string;
  externalUrl?: string;
  publishedAt?: Date;
  checklist?: string[];
  metadata?: MetadataRecord;
  cost?: PublishProviderCost;
}

export interface PublishProviderReconcileRequest {
  attempt: PublishAttempt;
  video: Video;
  contentFormat: ContentFormat;
  schedule: PublicationSchedule;
  publishMode: PublishMode;
  caption?: ContentCaption;
  activeRenderAsset?: Asset;
  activeImageAssets: Asset[];
  activeAudioAssets: Asset[];
}

export interface PublishProviderReconcileResult {
  state: "submitted" | "manual_action_required" | "published" | "failed";
  providerStatus: string;
  publicationId?: string;
  externalUrl?: string;
  publishedAt?: Date;
  checklist?: string[];
  metadata?: MetadataRecord;
  failureMessage?: string;
  cost?: PublishProviderCost;
}

export interface PublishProviderCallbackVerificationRequest {
  attempt: PublishAttempt;
  callbackToken: string;
  idempotencyKey: string;
  signature: string;
  signatureTimestamp: string;
  payload: MetadataRecord;
}

export interface PublishProviderCallbackVerificationResult {
  verifiedAt: string;
  scheme: string;
}

export interface PublishingProviderPort {
  readonly providerId: PublishingProvider;
  readonly supportedPlatforms: readonly string[];
  readonly supportedModes: readonly PublishMode[];
  validate(request: PublishProviderRequest): Promise<PublishProviderValidationResult>;
  publish(request: PublishProviderRequest): Promise<PublishProviderResult>;
  verifyCallback?(
    request: PublishProviderCallbackVerificationRequest
  ): Promise<PublishProviderCallbackVerificationResult>;
  reconcileSubmission?(
    request: PublishProviderReconcileRequest
  ): Promise<PublishProviderReconcileResult>;
}
