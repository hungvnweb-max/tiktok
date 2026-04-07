import type { VoiceJob, VoiceJobRepository } from "@videotik/core";
import { normalizeVoiceGenerationMode } from "@videotik/core";
import {
  VoiceJobStatus as PrismaVoiceJobStatus,
  type PrismaClient
} from "@prisma/client";
import { readMetadataRecord, toNullableJsonValue } from "./shared-operational-mappers";

const mapVoiceJobStatusToPrisma = (
  status: VoiceJob["status"]
): PrismaVoiceJobStatus => {
  switch (status) {
    case "waiting":
      return PrismaVoiceJobStatus.WAITING;
    case "processing":
      return PrismaVoiceJobStatus.PROCESSING;
    case "completed":
      return PrismaVoiceJobStatus.COMPLETED;
    case "failed":
      return PrismaVoiceJobStatus.FAILED;
    case "retrying":
      return PrismaVoiceJobStatus.RETRYING;
  }
};

const mapVoiceJobStatusFromPrisma = (
  status: PrismaVoiceJobStatus
): VoiceJob["status"] => {
  switch (status) {
    case PrismaVoiceJobStatus.WAITING:
      return "waiting";
    case PrismaVoiceJobStatus.PROCESSING:
      return "processing";
    case PrismaVoiceJobStatus.COMPLETED:
      return "completed";
    case PrismaVoiceJobStatus.FAILED:
      return "failed";
    case PrismaVoiceJobStatus.RETRYING:
      return "retrying";
  }
};

const mapPrismaVoiceJobToDomain = (record: {
  id: string;
  videoId: string;
  sceneId: string;
  contentFormatId: string;
  provider: string;
  generationMode: string;
  sourceLine: string;
  voiceId: string | null;
  status: PrismaVoiceJobStatus;
  attemptCount: number;
  maxAttempts: number;
  outputAssetId: string | null;
  durationSeconds: number | null;
  lastError: string | null;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}): VoiceJob => {
  const voiceJob: VoiceJob = {
    id: record.id,
    videoId: record.videoId,
    sceneId: record.sceneId,
    contentFormatId: record.contentFormatId,
    provider: record.provider as VoiceJob["provider"],
    generationMode: normalizeVoiceGenerationMode(record.generationMode, "voiceJob.generationMode"),
    sourceLine: record.sourceLine,
    status: mapVoiceJobStatusFromPrisma(record.status),
    attemptCount: record.attemptCount,
    maxAttempts: record.maxAttempts,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };

  if (record.voiceId) {
    voiceJob.voiceId = record.voiceId;
  }
  if (record.outputAssetId) {
    voiceJob.outputAssetId = record.outputAssetId;
  }
  if (record.durationSeconds !== null) {
    voiceJob.durationSeconds = record.durationSeconds;
  }
  if (record.lastError) {
    voiceJob.lastError = record.lastError;
  }
  const metadata = readMetadataRecord(record.metadata as never);

  if (metadata) {
    voiceJob.metadata = metadata;
  }

  return voiceJob;
};

const mapVoiceJobToPrismaCreateData = (voiceJob: VoiceJob) => {
  return {
    id: voiceJob.id,
    videoId: voiceJob.videoId,
    sceneId: voiceJob.sceneId,
    contentFormatId: voiceJob.contentFormatId,
    provider: voiceJob.provider,
    generationMode: voiceJob.generationMode,
    sourceLine: voiceJob.sourceLine,
    voiceId: voiceJob.voiceId ?? null,
    status: mapVoiceJobStatusToPrisma(voiceJob.status),
    attemptCount: voiceJob.attemptCount,
    maxAttempts: voiceJob.maxAttempts,
    outputAssetId: voiceJob.outputAssetId ?? null,
    durationSeconds: voiceJob.durationSeconds ?? null,
    lastError: voiceJob.lastError ?? null,
    metadata: toNullableJsonValue(voiceJob.metadata),
    createdAt: voiceJob.createdAt
  };
};

const mapVoiceJobToPrismaUpdateData = (voiceJob: VoiceJob) => {
  return {
    videoId: voiceJob.videoId,
    sceneId: voiceJob.sceneId,
    contentFormatId: voiceJob.contentFormatId,
    provider: voiceJob.provider,
    generationMode: voiceJob.generationMode,
    sourceLine: voiceJob.sourceLine,
    voiceId: voiceJob.voiceId ?? null,
    status: mapVoiceJobStatusToPrisma(voiceJob.status),
    attemptCount: voiceJob.attemptCount,
    maxAttempts: voiceJob.maxAttempts,
    outputAssetId: voiceJob.outputAssetId ?? null,
    durationSeconds: voiceJob.durationSeconds ?? null,
    lastError: voiceJob.lastError ?? null,
    metadata: toNullableJsonValue(voiceJob.metadata)
  };
};

export class PrismaVoiceJobRepository implements VoiceJobRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async save(voiceJob: VoiceJob): Promise<void> {
    await this.prisma.voiceJob.upsert({
      where: {
        id: voiceJob.id
      },
      create: mapVoiceJobToPrismaCreateData(voiceJob),
      update: mapVoiceJobToPrismaUpdateData(voiceJob)
    });
  }

  async findById(voiceJobId: string): Promise<VoiceJob | undefined> {
    const voiceJob = await this.prisma.voiceJob.findUnique({
      where: {
        id: voiceJobId
      }
    });

    return voiceJob ? mapPrismaVoiceJobToDomain(voiceJob) : undefined;
  }

  async list(): Promise<VoiceJob[]> {
    const voiceJobs = await this.prisma.voiceJob.findMany({
      orderBy: {
        createdAt: "asc"
      }
    });

    return voiceJobs.map(mapPrismaVoiceJobToDomain);
  }

  async listByVideoId(videoId: string): Promise<VoiceJob[]> {
    const voiceJobs = await this.prisma.voiceJob.findMany({
      where: {
        videoId
      },
      orderBy: {
        createdAt: "asc"
      }
    });

    return voiceJobs.map(mapPrismaVoiceJobToDomain);
  }

  async listBySceneId(sceneId: string): Promise<VoiceJob[]> {
    const voiceJobs = await this.prisma.voiceJob.findMany({
      where: {
        sceneId
      },
      orderBy: {
        createdAt: "asc"
      }
    });

    return voiceJobs.map(mapPrismaVoiceJobToDomain);
  }
}
