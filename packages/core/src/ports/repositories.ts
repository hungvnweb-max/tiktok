import type { Asset } from "../domain/asset/asset";
import type { ActivityLog } from "../domain/activity/activity-log";
import type { ContentCaption } from "../domain/caption/caption";
import type { CallbackReceipt } from "../domain/callback/callback-receipt";
import type { EntityReference } from "../domain/common/reference";
import type { ContentFormat } from "../domain/content-format/content-format";
import type { CostRecord } from "../domain/cost/cost-record";
import type { ImagePromptPack } from "../domain/image/image-prompt-pack";
import type { ContentIdea } from "../domain/idea/idea";
import type {
  WorkflowJob,
  WorkflowJobLog,
  WorkflowJobStatus,
  WorkflowJobType
} from "../domain/job/workflow-job";
import type { PublishAttempt } from "../domain/publish/publish-attempt";
import type { PublicationSchedule } from "../domain/schedule/publication-schedule";
import type { ContentScript } from "../domain/script/script";
import type { SubtitlePack } from "../domain/subtitle/subtitle-pack";
import type { Topic } from "../domain/topic/topic";
import type { VersionSnapshot } from "../domain/version/version-snapshot";
import type { Video } from "../domain/video/video";
import type { VoiceJob } from "../domain/voice/voice-job";

export interface TopicRepository {
  save(topic: Topic): Promise<void>;
  findById(topicId: string): Promise<Topic | undefined>;
  findBySlug(slug: string): Promise<Topic | undefined>;
  list(): Promise<Topic[]>;
}

export interface ContentFormatRepository {
  save(contentFormat: ContentFormat): Promise<void>;
  findById(contentFormatId: string): Promise<ContentFormat | undefined>;
  findBySlug(slug: string): Promise<ContentFormat | undefined>;
  list(): Promise<ContentFormat[]>;
}

export interface IdeaRepository {
  save(idea: ContentIdea): Promise<void>;
  findById(ideaId: string): Promise<ContentIdea | undefined>;
  list(): Promise<ContentIdea[]>;
}

export interface ScriptRepository {
  save(script: ContentScript): Promise<void>;
  findById(scriptId: string): Promise<ContentScript | undefined>;
  list(): Promise<ContentScript[]>;
}

export interface CaptionRepository {
  save(caption: ContentCaption): Promise<void>;
  findById(captionId: string): Promise<ContentCaption | undefined>;
  list(): Promise<ContentCaption[]>;
}

export interface VideoRepository {
  save(video: Video): Promise<void>;
  findById(videoId: string): Promise<Video | undefined>;
  findByScriptId(scriptId: string): Promise<Video | undefined>;
  list(): Promise<Video[]>;
}

export interface AssetRepository {
  save(asset: Asset): Promise<void>;
  findById(assetId: string): Promise<Asset | undefined>;
  list(): Promise<Asset[]>;
  listByVideoId(videoId: string): Promise<Asset[]>;
  listBySceneId(sceneId: string): Promise<Asset[]>;
}

export interface ImagePromptPackRepository {
  save(imagePromptPack: ImagePromptPack): Promise<void>;
  findById(imagePromptPackId: string): Promise<ImagePromptPack | undefined>;
  findByVideoId(videoId: string): Promise<ImagePromptPack | undefined>;
  list(): Promise<ImagePromptPack[]>;
}

export interface SubtitlePackRepository {
  save(subtitlePack: SubtitlePack): Promise<void>;
  findById(subtitlePackId: string): Promise<SubtitlePack | undefined>;
  findByVideoId(videoId: string): Promise<SubtitlePack | undefined>;
  list(): Promise<SubtitlePack[]>;
}

export interface PublicationScheduleRepository {
  save(schedule: PublicationSchedule): Promise<void>;
  findById(scheduleId: string): Promise<PublicationSchedule | undefined>;
  findByVideoId(videoId: string): Promise<PublicationSchedule | undefined>;
  list(): Promise<PublicationSchedule[]>;
}

export interface PublishAttemptRepository {
  save(publishAttempt: PublishAttempt): Promise<void>;
  findById(publishAttemptId: string): Promise<PublishAttempt | undefined>;
  list(): Promise<PublishAttempt[]>;
  listByVideoId(videoId: string): Promise<PublishAttempt[]>;
}

export interface WorkflowJobRepository {
  save(job: WorkflowJob): Promise<void>;
  findById(jobId: string): Promise<WorkflowJob | undefined>;
  list(): Promise<WorkflowJob[]>;
  listByReference(reference: EntityReference, type?: WorkflowJobType): Promise<WorkflowJob[]>;
  tryAcquireLease(
    jobId: string,
    input: {
      ownerId: string;
      leaseToken: string;
      leaseExpiresAt: Date;
      expectedStatuses?: WorkflowJobStatus[];
    }
  ): Promise<WorkflowJob | undefined>;
  releaseLease(jobId: string, leaseToken: string): Promise<boolean>;
}

export interface CallbackReceiptRepository {
  save(callbackReceipt: CallbackReceipt): Promise<void>;
  findByIdempotencyKey(idempotencyKey: string): Promise<CallbackReceipt | undefined>;
  reserve(callbackReceipt: CallbackReceipt): Promise<{
    created: boolean;
    callbackReceipt: CallbackReceipt;
  }>;
}

export interface VoiceJobRepository {
  save(voiceJob: VoiceJob): Promise<void>;
  findById(voiceJobId: string): Promise<VoiceJob | undefined>;
  list(): Promise<VoiceJob[]>;
  listByVideoId(videoId: string): Promise<VoiceJob[]>;
  listBySceneId(sceneId: string): Promise<VoiceJob[]>;
}

export interface WorkflowJobLogRepository {
  append(log: WorkflowJobLog): Promise<void>;
  listByJobId(jobId: string): Promise<WorkflowJobLog[]>;
}

export interface CostRecordRepository {
  save(costRecord: CostRecord): Promise<void>;
  list(): Promise<CostRecord[]>;
  listByReference(reference: EntityReference): Promise<CostRecord[]>;
}

export interface ActivityLogRepository {
  save(activityLog: ActivityLog): Promise<void>;
  list(): Promise<ActivityLog[]>;
  listByReference(reference: EntityReference): Promise<ActivityLog[]>;
}

export interface VersionSnapshotRepository {
  save(versionSnapshot: VersionSnapshot): Promise<void>;
  listByReference(reference: EntityReference): Promise<VersionSnapshot[]>;
}

export interface PlatformRepositories {
  topicRepository: TopicRepository;
  contentFormatRepository: ContentFormatRepository;
  ideaRepository: IdeaRepository;
  scriptRepository: ScriptRepository;
  captionRepository: CaptionRepository;
  videoRepository: VideoRepository;
  assetRepository: AssetRepository;
  imagePromptPackRepository: ImagePromptPackRepository;
  subtitlePackRepository: SubtitlePackRepository;
  publicationScheduleRepository: PublicationScheduleRepository;
  publishAttemptRepository: PublishAttemptRepository;
  workflowJobRepository: WorkflowJobRepository;
  callbackReceiptRepository: CallbackReceiptRepository;
  workflowJobLogRepository: WorkflowJobLogRepository;
  voiceJobRepository: VoiceJobRepository;
  costRecordRepository: CostRecordRepository;
  activityLogRepository: ActivityLogRepository;
  versionSnapshotRepository: VersionSnapshotRepository;
}

export type Sprint1Repositories = PlatformRepositories;
