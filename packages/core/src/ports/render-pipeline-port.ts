import type { Asset } from "../domain/asset/asset";
import type { MetadataRecord } from "../domain/common/entity";
import type { RenderProvider } from "../domain/common/providers";
import type { ContentFormat } from "../domain/content-format/content-format";
import type { WorkflowJob } from "../domain/job/workflow-job";
import type { SubtitlePack } from "../domain/subtitle/subtitle-pack";
import type { Video } from "../domain/video/video";

export interface RenderPipelineRequest {
  workflowJob: WorkflowJob;
  video: Video;
  contentFormat: ContentFormat;
  subtitlePack?: SubtitlePack;
  activeImageAssets: Asset[];
  activeAudioAssets: Asset[];
}

export interface RenderPipelineCost {
  amount: number;
  currency?: string;
  units: string;
  quantity: number;
  metadata?: MetadataRecord;
}

export interface RenderPipelineSubmissionResult {
  providerJobId: string;
  providerStatus: string;
  metadata?: MetadataRecord;
  cost?: RenderPipelineCost;
}

export interface RenderPipelineCallbackVerificationRequest {
  action: "complete" | "fail";
  workflowJob: WorkflowJob;
  callbackToken: string;
  providerJobId: string;
  idempotencyKey: string;
  signature: string;
  signatureTimestamp: string;
  payload: MetadataRecord;
}

export interface RenderPipelineCallbackVerificationResult {
  verifiedAt: string;
  scheme: string;
}

export interface RenderPipelineCompletionResult {
  assetUrl: string;
  storageProvider?: Asset["storage"]["storageProvider"];
  storageKey?: string;
  mimeType?: string;
  bytes?: number;
  width?: number;
  height?: number;
  durationSeconds?: number;
}

export interface RenderPipelineReconciliationRequest {
  workflowJob: WorkflowJob;
  video: Video;
  contentFormat: ContentFormat;
}

export interface RenderPipelineReconciliationResult {
  state: "pending" | "completed" | "failed";
  providerStatus: string;
  checkedAt: string;
  metadata?: MetadataRecord;
  completion?: RenderPipelineCompletionResult;
  failureMessage?: string;
}

export interface RenderPipelinePort {
  readonly providerId: RenderProvider;
  readonly supportedTemplateSlugs: readonly string[];
  enqueue(request: RenderPipelineRequest): Promise<RenderPipelineSubmissionResult>;
  verifyCallback(
    request: RenderPipelineCallbackVerificationRequest
  ): Promise<RenderPipelineCallbackVerificationResult>;
  reconcileSubmission?(
    request: RenderPipelineReconciliationRequest
  ): Promise<RenderPipelineReconciliationResult>;
}
