import {
  DomainError,
  createEntityId,
  ensureNonEmptyString,
  ensurePositiveInteger,
  now,
  type AuditableEntity,
  type MetadataRecord
} from "../common/entity";
import type { VoiceGenerationMode } from "../common/media";
import type { VoiceoverProvider } from "../common/providers";

export type VoiceJobStatus = "waiting" | "processing" | "completed" | "failed" | "retrying";

export interface VoiceJob extends AuditableEntity {
  videoId: string;
  sceneId: string;
  contentFormatId: string;
  provider: Exclude<VoiceoverProvider, "none">;
  generationMode: VoiceGenerationMode;
  sourceLine: string;
  voiceId?: string;
  status: VoiceJobStatus;
  attemptCount: number;
  maxAttempts: number;
  outputAssetId?: string;
  durationSeconds?: number;
  lastError?: string;
  metadata?: MetadataRecord;
}

export interface CreateVoiceJobInput {
  videoId: string;
  sceneId: string;
  contentFormatId: string;
  provider: Exclude<VoiceoverProvider, "none">;
  generationMode: VoiceGenerationMode;
  sourceLine: string;
  voiceId?: string;
  maxAttempts?: number;
  metadata?: MetadataRecord;
}

export const createVoiceJob = (input: CreateVoiceJobInput): VoiceJob => {
  const timestamp = now();

  return {
    id: createEntityId("voicejob"),
    videoId: ensureNonEmptyString(input.videoId, "voiceJob.videoId"),
    sceneId: ensureNonEmptyString(input.sceneId, "voiceJob.sceneId"),
    contentFormatId: ensureNonEmptyString(input.contentFormatId, "voiceJob.contentFormatId"),
    provider: input.provider,
    generationMode: input.generationMode,
    sourceLine: ensureNonEmptyString(input.sourceLine, "voiceJob.sourceLine"),
    status: "waiting",
    attemptCount: 0,
    maxAttempts:
      input.maxAttempts === undefined
        ? 3
        : ensurePositiveInteger(input.maxAttempts, "voiceJob.maxAttempts"),
    createdAt: timestamp,
    updatedAt: timestamp,
    ...(input.voiceId
      ? {
          voiceId: ensureNonEmptyString(input.voiceId, "voiceJob.voiceId")
        }
      : {}),
    ...(input.metadata ? { metadata: input.metadata } : {})
  };
};

export const startVoiceJob = (voiceJob: VoiceJob): VoiceJob => {
  if (voiceJob.status !== "waiting" && voiceJob.status !== "retrying") {
    throw new DomainError(
      `Voice job "${voiceJob.id}" cannot start from status "${voiceJob.status}".`
    );
  }

  const { lastError: _lastError, ...rest } = voiceJob;

  return {
    ...rest,
    status: "processing",
    attemptCount: voiceJob.attemptCount + 1,
    updatedAt: now()
  };
};

export const completeVoiceJob = (
  voiceJob: VoiceJob,
  input: {
    outputAssetId: string;
    durationSeconds: number;
  }
): VoiceJob => {
  if (voiceJob.status !== "processing") {
    throw new DomainError(
      `Voice job "${voiceJob.id}" cannot complete from status "${voiceJob.status}".`
    );
  }

  return {
    ...voiceJob,
    status: "completed",
    outputAssetId: ensureNonEmptyString(input.outputAssetId, "voiceJob.outputAssetId"),
    durationSeconds: ensurePositiveInteger(input.durationSeconds, "voiceJob.durationSeconds"),
    updatedAt: now()
  };
};

export const markVoiceJobRetrying = (voiceJob: VoiceJob, errorMessage: string): VoiceJob => {
  if (voiceJob.status !== "processing") {
    throw new DomainError(
      `Voice job "${voiceJob.id}" cannot retry from status "${voiceJob.status}".`
    );
  }

  if (voiceJob.attemptCount >= voiceJob.maxAttempts) {
    throw new DomainError(`Voice job "${voiceJob.id}" has no retries remaining.`);
  }

  return {
    ...voiceJob,
    status: "retrying",
    lastError: ensureNonEmptyString(errorMessage, "voiceJob.errorMessage"),
    updatedAt: now()
  };
};

export const failVoiceJob = (voiceJob: VoiceJob, errorMessage: string): VoiceJob => {
  if (voiceJob.status !== "processing" && voiceJob.status !== "retrying") {
    throw new DomainError(
      `Voice job "${voiceJob.id}" cannot fail from status "${voiceJob.status}".`
    );
  }

  return {
    ...voiceJob,
    status: "failed",
    lastError: ensureNonEmptyString(errorMessage, "voiceJob.errorMessage"),
    updatedAt: now()
  };
};
