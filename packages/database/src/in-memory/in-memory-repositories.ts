import type {
  Asset,
  AssetRepository,
  ActivityLog,
  ActivityLogRepository,
  CallbackReceipt,
  CallbackReceiptRepository,
  CaptionRepository,
  ContentCaption,
  ContentFormat,
  ContentFormatRepository,
  ContentIdea,
  ContentScript,
  CostRecord,
  CostRecordRepository,
  EntityReference,
  IdeaRepository,
  ImagePromptPack,
  ImagePromptPackRepository,
  PlatformRepositories,
  PublishAttempt,
  PublishAttemptRepository,
  PublicationSchedule,
  PublicationScheduleRepository,
  ScriptRepository,
  Sprint1Repositories,
  SubtitlePack,
  SubtitlePackRepository,
  Topic,
  TopicRepository,
  VersionSnapshot,
  VersionSnapshotRepository,
  Video,
  VideoRepository,
  VoiceJob,
  VoiceJobRepository,
  WorkflowJob,
  WorkflowJobLog,
  WorkflowJobLogRepository,
  WorkflowJobRepository,
  WorkflowJobType
} from "@videotik/core";
import { seedContentFormats } from "../seeds/content-formats";

const clone = <T>(value: T): T => structuredClone(value);

const sortByCreatedAt = <T extends { createdAt: Date }>(items: T[]): T[] => {
  return [...items].sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
};

const sameReference = (
  left: EntityReference,
  right: EntityReference
): boolean => {
  return left.entityType === right.entityType && left.entityId === right.entityId;
};

class InMemoryTopicRepository implements TopicRepository {
  private readonly topics = new Map<string, Topic>();

  constructor(seed: Topic[] = []) {
    for (const topic of seed) {
      this.topics.set(topic.id, clone(topic));
    }
  }

  async save(topic: Topic): Promise<void> {
    this.topics.set(topic.id, clone(topic));
  }

  async findById(topicId: string): Promise<Topic | undefined> {
    const topic = this.topics.get(topicId);
    return topic ? clone(topic) : undefined;
  }

  async findBySlug(slug: string): Promise<Topic | undefined> {
    for (const topic of this.topics.values()) {
      if (topic.slug === slug) {
        return clone(topic);
      }
    }

    return undefined;
  }

  async list(): Promise<Topic[]> {
    return sortByCreatedAt([...this.topics.values()]).map((topic) => clone(topic));
  }
}

class InMemoryContentFormatRepository implements ContentFormatRepository {
  private readonly contentFormats = new Map<string, ContentFormat>();

  constructor(seed: ContentFormat[] = []) {
    for (const contentFormat of seed) {
      this.contentFormats.set(contentFormat.id, clone(contentFormat));
    }
  }

  async save(contentFormat: ContentFormat): Promise<void> {
    this.contentFormats.set(contentFormat.id, clone(contentFormat));
  }

  async findById(contentFormatId: string): Promise<ContentFormat | undefined> {
    const contentFormat = this.contentFormats.get(contentFormatId);
    return contentFormat ? clone(contentFormat) : undefined;
  }

  async findBySlug(slug: string): Promise<ContentFormat | undefined> {
    for (const contentFormat of this.contentFormats.values()) {
      if (contentFormat.slug === slug) {
        return clone(contentFormat);
      }
    }

    return undefined;
  }

  async list(): Promise<ContentFormat[]> {
    return sortByCreatedAt([...this.contentFormats.values()]).map((contentFormat) => clone(contentFormat));
  }
}

class InMemoryIdeaRepository implements IdeaRepository {
  private readonly ideas = new Map<string, ContentIdea>();

  constructor(seed: ContentIdea[] = []) {
    for (const idea of seed) {
      this.ideas.set(idea.id, clone(idea));
    }
  }

  async save(idea: ContentIdea): Promise<void> {
    this.ideas.set(idea.id, clone(idea));
  }

  async findById(ideaId: string): Promise<ContentIdea | undefined> {
    const idea = this.ideas.get(ideaId);
    return idea ? clone(idea) : undefined;
  }

  async list(): Promise<ContentIdea[]> {
    return sortByCreatedAt([...this.ideas.values()]).map((idea) => clone(idea));
  }
}

class InMemoryScriptRepository implements ScriptRepository {
  private readonly scripts = new Map<string, ContentScript>();

  constructor(seed: ContentScript[] = []) {
    for (const script of seed) {
      this.scripts.set(script.id, clone(script));
    }
  }

  async save(script: ContentScript): Promise<void> {
    this.scripts.set(script.id, clone(script));
  }

  async findById(scriptId: string): Promise<ContentScript | undefined> {
    const script = this.scripts.get(scriptId);
    return script ? clone(script) : undefined;
  }

  async list(): Promise<ContentScript[]> {
    return sortByCreatedAt([...this.scripts.values()]).map((script) => clone(script));
  }
}

class InMemoryCaptionRepository implements CaptionRepository {
  private readonly captions = new Map<string, ContentCaption>();

  constructor(seed: ContentCaption[] = []) {
    for (const caption of seed) {
      this.captions.set(caption.id, clone(caption));
    }
  }

  async save(caption: ContentCaption): Promise<void> {
    this.captions.set(caption.id, clone(caption));
  }

  async findById(captionId: string): Promise<ContentCaption | undefined> {
    const caption = this.captions.get(captionId);
    return caption ? clone(caption) : undefined;
  }

  async list(): Promise<ContentCaption[]> {
    return sortByCreatedAt([...this.captions.values()]).map((caption) => clone(caption));
  }
}

class InMemoryVideoRepository implements VideoRepository {
  private readonly videos = new Map<string, Video>();

  constructor(seed: Video[] = []) {
    for (const video of seed) {
      this.videos.set(video.id, clone(video));
    }
  }

  async save(video: Video): Promise<void> {
    this.videos.set(video.id, clone(video));
  }

  async findById(videoId: string): Promise<Video | undefined> {
    const video = this.videos.get(videoId);
    return video ? clone(video) : undefined;
  }

  async findByScriptId(scriptId: string): Promise<Video | undefined> {
    for (const video of this.videos.values()) {
      if (video.scriptId === scriptId) {
        return clone(video);
      }
    }

    return undefined;
  }

  async list(): Promise<Video[]> {
    return sortByCreatedAt([...this.videos.values()]).map((video) => clone(video));
  }
}

class InMemoryAssetRepository implements AssetRepository {
  private readonly assets = new Map<string, Asset>();

  constructor(seed: Asset[] = []) {
    for (const asset of seed) {
      this.assets.set(asset.id, clone(asset));
    }
  }

  async save(asset: Asset): Promise<void> {
    this.assets.set(asset.id, clone(asset));
  }

  async findById(assetId: string): Promise<Asset | undefined> {
    const asset = this.assets.get(assetId);
    return asset ? clone(asset) : undefined;
  }

  async list(): Promise<Asset[]> {
    return sortByCreatedAt([...this.assets.values()]).map((asset) => clone(asset));
  }

  async listByVideoId(videoId: string): Promise<Asset[]> {
    return sortByCreatedAt(
      [...this.assets.values()].filter((asset) => asset.videoId === videoId)
    ).map((asset) => clone(asset));
  }

  async listBySceneId(sceneId: string): Promise<Asset[]> {
    return sortByCreatedAt(
      [...this.assets.values()].filter((asset) => asset.sceneId === sceneId)
    ).map((asset) => clone(asset));
  }
}

class InMemoryImagePromptPackRepository implements ImagePromptPackRepository {
  private readonly packs = new Map<string, ImagePromptPack>();

  constructor(seed: ImagePromptPack[] = []) {
    for (const pack of seed) {
      this.packs.set(pack.id, clone(pack));
    }
  }

  async save(imagePromptPack: ImagePromptPack): Promise<void> {
    for (const [existingId, existingPack] of this.packs.entries()) {
      if (existingPack.videoId === imagePromptPack.videoId && existingId !== imagePromptPack.id) {
        this.packs.delete(existingId);
      }
    }

    this.packs.set(imagePromptPack.id, clone(imagePromptPack));
  }

  async findById(imagePromptPackId: string): Promise<ImagePromptPack | undefined> {
    const pack = this.packs.get(imagePromptPackId);
    return pack ? clone(pack) : undefined;
  }

  async findByVideoId(videoId: string): Promise<ImagePromptPack | undefined> {
    for (const pack of this.packs.values()) {
      if (pack.videoId === videoId) {
        return clone(pack);
      }
    }

    return undefined;
  }

  async list(): Promise<ImagePromptPack[]> {
    return sortByCreatedAt([...this.packs.values()]).map((pack) => clone(pack));
  }
}

class InMemorySubtitlePackRepository implements SubtitlePackRepository {
  private readonly packs = new Map<string, SubtitlePack>();

  constructor(seed: SubtitlePack[] = []) {
    for (const pack of seed) {
      this.packs.set(pack.id, clone(pack));
    }
  }

  async save(subtitlePack: SubtitlePack): Promise<void> {
    for (const [existingId, existingPack] of this.packs.entries()) {
      if (existingPack.videoId === subtitlePack.videoId && existingId !== subtitlePack.id) {
        this.packs.delete(existingId);
      }
    }

    this.packs.set(subtitlePack.id, clone(subtitlePack));
  }

  async findById(subtitlePackId: string): Promise<SubtitlePack | undefined> {
    const pack = this.packs.get(subtitlePackId);
    return pack ? clone(pack) : undefined;
  }

  async findByVideoId(videoId: string): Promise<SubtitlePack | undefined> {
    for (const pack of this.packs.values()) {
      if (pack.videoId === videoId) {
        return clone(pack);
      }
    }

    return undefined;
  }

  async list(): Promise<SubtitlePack[]> {
    return sortByCreatedAt([...this.packs.values()]).map((pack) => clone(pack));
  }
}

class InMemoryPublicationScheduleRepository implements PublicationScheduleRepository {
  private readonly schedules = new Map<string, PublicationSchedule>();

  constructor(seed: PublicationSchedule[] = []) {
    for (const schedule of seed) {
      this.schedules.set(schedule.id, clone(schedule));
    }
  }

  async save(schedule: PublicationSchedule): Promise<void> {
    for (const [existingId, existingSchedule] of this.schedules.entries()) {
      if (existingSchedule.videoId === schedule.videoId && existingId !== schedule.id) {
        this.schedules.delete(existingId);
      }
    }

    this.schedules.set(schedule.id, clone(schedule));
  }

  async findById(scheduleId: string): Promise<PublicationSchedule | undefined> {
    const schedule = this.schedules.get(scheduleId);
    return schedule ? clone(schedule) : undefined;
  }

  async findByVideoId(videoId: string): Promise<PublicationSchedule | undefined> {
    for (const schedule of this.schedules.values()) {
      if (schedule.videoId === videoId) {
        return clone(schedule);
      }
    }

    return undefined;
  }

  async list(): Promise<PublicationSchedule[]> {
    return sortByCreatedAt([...this.schedules.values()]).map((schedule) => clone(schedule));
  }
}

class InMemoryPublishAttemptRepository implements PublishAttemptRepository {
  private readonly attempts = new Map<string, PublishAttempt>();

  constructor(seed: PublishAttempt[] = []) {
    for (const attempt of seed) {
      this.attempts.set(attempt.id, clone(attempt));
    }
  }

  async save(publishAttempt: PublishAttempt): Promise<void> {
    this.attempts.set(publishAttempt.id, clone(publishAttempt));
  }

  async findById(publishAttemptId: string): Promise<PublishAttempt | undefined> {
    const publishAttempt = this.attempts.get(publishAttemptId);
    return publishAttempt ? clone(publishAttempt) : undefined;
  }

  async list(): Promise<PublishAttempt[]> {
    return sortByCreatedAt([...this.attempts.values()]).map((attempt) => clone(attempt));
  }

  async listByVideoId(videoId: string): Promise<PublishAttempt[]> {
    return sortByCreatedAt(
      [...this.attempts.values()].filter((attempt) => attempt.videoId === videoId)
    ).map((attempt) => clone(attempt));
  }
}

class InMemoryWorkflowJobRepository implements WorkflowJobRepository {
  private readonly jobs = new Map<string, WorkflowJob>();

  constructor(seed: WorkflowJob[] = []) {
    for (const job of seed) {
      this.jobs.set(job.id, clone(job));
    }
  }

  async save(job: WorkflowJob): Promise<void> {
    this.jobs.set(job.id, clone(job));
  }

  async findById(jobId: string): Promise<WorkflowJob | undefined> {
    const job = this.jobs.get(jobId);
    return job ? clone(job) : undefined;
  }

  async list(): Promise<WorkflowJob[]> {
    return sortByCreatedAt([...this.jobs.values()]).map((job) => clone(job));
  }

  async listByReference(reference: EntityReference, type?: WorkflowJobType): Promise<WorkflowJob[]> {
    return sortByCreatedAt(
      [...this.jobs.values()].filter((job) => {
        const sameJobReference =
          job.reference.entityType === reference.entityType &&
          job.reference.entityId === reference.entityId;

        return sameJobReference && (type === undefined || job.type === type);
      })
    ).map((job) => clone(job));
  }

  async tryAcquireLease(
    jobId: string,
    input: {
      ownerId: string;
      leaseToken: string;
      leaseExpiresAt: Date;
      expectedStatuses?: WorkflowJob["status"][];
    }
  ): Promise<WorkflowJob | undefined> {
    const existingJob = this.jobs.get(jobId);

    if (!existingJob) {
      return undefined;
    }

    if (
      input.expectedStatuses &&
      !input.expectedStatuses.includes(existingJob.status)
    ) {
      return undefined;
    }

    const existingLease = existingJob.lease;
    const canAcquire =
      !existingLease ||
      existingLease.expiresAt.getTime() <= Date.now() ||
      existingLease.token === input.leaseToken;

    if (!canAcquire) {
      return undefined;
    }

    const leasedJob: WorkflowJob = {
      ...clone(existingJob),
      lease: {
        ownerId: input.ownerId,
        token: input.leaseToken,
        expiresAt: new Date(input.leaseExpiresAt)
      },
      updatedAt: new Date()
    };
    this.jobs.set(jobId, leasedJob);
    return clone(leasedJob);
  }

  async releaseLease(jobId: string, leaseToken: string): Promise<boolean> {
    const existingJob = this.jobs.get(jobId);

    if (!existingJob?.lease || existingJob.lease.token !== leaseToken) {
      return false;
    }

    const { lease: _lease, ...rest } = clone(existingJob);
    const releasedJob: WorkflowJob = {
      ...rest,
      updatedAt: new Date()
    };
    this.jobs.set(jobId, releasedJob);
    return true;
  }
}

class InMemoryCallbackReceiptRepository implements CallbackReceiptRepository {
  private readonly receipts = new Map<string, CallbackReceipt>();
  private readonly keys = new Map<string, string>();

  constructor(seed: CallbackReceipt[] = []) {
    for (const receipt of seed) {
      this.receipts.set(receipt.id, clone(receipt));
      this.keys.set(receipt.idempotencyKey, receipt.id);
    }
  }

  async save(callbackReceipt: CallbackReceipt): Promise<void> {
    this.receipts.set(callbackReceipt.id, clone(callbackReceipt));
    this.keys.set(callbackReceipt.idempotencyKey, callbackReceipt.id);
  }

  async findByIdempotencyKey(idempotencyKey: string): Promise<CallbackReceipt | undefined> {
    const receiptId = this.keys.get(idempotencyKey);

    if (!receiptId) {
      return undefined;
    }

    const receipt = this.receipts.get(receiptId);
    return receipt ? clone(receipt) : undefined;
  }

  async reserve(callbackReceipt: CallbackReceipt): Promise<{
    created: boolean;
    callbackReceipt: CallbackReceipt;
  }> {
    const existing = await this.findByIdempotencyKey(callbackReceipt.idempotencyKey);

    if (existing) {
      return {
        created: false,
        callbackReceipt: existing
      };
    }

    await this.save(callbackReceipt);

    return {
      created: true,
      callbackReceipt: clone(callbackReceipt)
    };
  }
}

class InMemoryVoiceJobRepository implements VoiceJobRepository {
  private readonly jobs = new Map<string, VoiceJob>();

  constructor(seed: VoiceJob[] = []) {
    for (const voiceJob of seed) {
      this.jobs.set(voiceJob.id, clone(voiceJob));
    }
  }

  async save(voiceJob: VoiceJob): Promise<void> {
    this.jobs.set(voiceJob.id, clone(voiceJob));
  }

  async findById(voiceJobId: string): Promise<VoiceJob | undefined> {
    const voiceJob = this.jobs.get(voiceJobId);
    return voiceJob ? clone(voiceJob) : undefined;
  }

  async list(): Promise<VoiceJob[]> {
    return sortByCreatedAt([...this.jobs.values()]).map((voiceJob) => clone(voiceJob));
  }

  async listByVideoId(videoId: string): Promise<VoiceJob[]> {
    return sortByCreatedAt(
      [...this.jobs.values()].filter((voiceJob) => voiceJob.videoId === videoId)
    ).map((voiceJob) => clone(voiceJob));
  }

  async listBySceneId(sceneId: string): Promise<VoiceJob[]> {
    return sortByCreatedAt(
      [...this.jobs.values()].filter((voiceJob) => voiceJob.sceneId === sceneId)
    ).map((voiceJob) => clone(voiceJob));
  }
}

class InMemoryWorkflowJobLogRepository implements WorkflowJobLogRepository {
  private readonly logs = new Map<string, WorkflowJobLog>();

  constructor(seed: WorkflowJobLog[] = []) {
    for (const log of seed) {
      this.logs.set(log.id, clone(log));
    }
  }

  async append(log: WorkflowJobLog): Promise<void> {
    this.logs.set(log.id, clone(log));
  }

  async listByJobId(jobId: string): Promise<WorkflowJobLog[]> {
    return sortByCreatedAt([...this.logs.values()].filter((log) => log.workflowJobId === jobId)).map((log) =>
      clone(log)
    );
  }
}

class InMemoryCostRecordRepository implements CostRecordRepository {
  private readonly records = new Map<string, CostRecord>();

  constructor(seed: CostRecord[] = []) {
    for (const record of seed) {
      this.records.set(record.id, clone(record));
    }
  }

  async save(costRecord: CostRecord): Promise<void> {
    this.records.set(costRecord.id, clone(costRecord));
  }

  async list(): Promise<CostRecord[]> {
    return sortByCreatedAt([...this.records.values()]).map((record) => clone(record));
  }

  async listByReference(reference: EntityReference): Promise<CostRecord[]> {
    return sortByCreatedAt(
      [...this.records.values()].filter((record) => sameReference(record.reference, reference))
    ).map((record) => clone(record));
  }
}

class InMemoryActivityLogRepository implements ActivityLogRepository {
  private readonly logs = new Map<string, ActivityLog>();

  constructor(seed: ActivityLog[] = []) {
    for (const log of seed) {
      this.logs.set(log.id, clone(log));
    }
  }

  async save(activityLog: ActivityLog): Promise<void> {
    this.logs.set(activityLog.id, clone(activityLog));
  }

  async list(): Promise<ActivityLog[]> {
    return sortByCreatedAt([...this.logs.values()]).map((log) => clone(log));
  }

  async listByReference(reference: EntityReference): Promise<ActivityLog[]> {
    return sortByCreatedAt(
      [...this.logs.values()].filter((log) => sameReference(log.reference, reference))
    ).map((log) => clone(log));
  }
}

class InMemoryVersionSnapshotRepository implements VersionSnapshotRepository {
  private readonly snapshots = new Map<string, VersionSnapshot>();

  constructor(seed: VersionSnapshot[] = []) {
    for (const snapshot of seed) {
      this.snapshots.set(snapshot.id, clone(snapshot));
    }
  }

  async save(versionSnapshot: VersionSnapshot): Promise<void> {
    this.snapshots.set(versionSnapshot.id, clone(versionSnapshot));
  }

  async listByReference(reference: EntityReference): Promise<VersionSnapshot[]> {
    return sortByCreatedAt(
      [...this.snapshots.values()].filter((snapshot) => sameReference(snapshot.reference, reference))
    ).map((snapshot) => clone(snapshot));
  }
}

export interface CreateInMemoryRepositoriesOptions {
  topics?: Topic[];
  contentFormats?: ContentFormat[];
  ideas?: ContentIdea[];
  scripts?: ContentScript[];
  captions?: ContentCaption[];
  videos?: Video[];
  assets?: Asset[];
  imagePromptPacks?: ImagePromptPack[];
  subtitlePacks?: SubtitlePack[];
  publicationSchedules?: PublicationSchedule[];
  publishAttempts?: PublishAttempt[];
  workflowJobs?: WorkflowJob[];
  callbackReceipts?: CallbackReceipt[];
  workflowJobLogs?: WorkflowJobLog[];
  voiceJobs?: VoiceJob[];
  costRecords?: CostRecord[];
  activityLogs?: ActivityLog[];
  versionSnapshots?: VersionSnapshot[];
}

export const createInMemoryPlatformRepositories = (
  options: CreateInMemoryRepositoriesOptions = {}
): PlatformRepositories => {
  return {
    topicRepository: new InMemoryTopicRepository(options.topics),
    contentFormatRepository: new InMemoryContentFormatRepository(
      options.contentFormats ?? seedContentFormats
    ),
    ideaRepository: new InMemoryIdeaRepository(options.ideas),
    scriptRepository: new InMemoryScriptRepository(options.scripts),
    captionRepository: new InMemoryCaptionRepository(options.captions),
    videoRepository: new InMemoryVideoRepository(options.videos),
    assetRepository: new InMemoryAssetRepository(options.assets),
    imagePromptPackRepository: new InMemoryImagePromptPackRepository(options.imagePromptPacks),
    subtitlePackRepository: new InMemorySubtitlePackRepository(options.subtitlePacks),
    publicationScheduleRepository: new InMemoryPublicationScheduleRepository(
      options.publicationSchedules
    ),
    publishAttemptRepository: new InMemoryPublishAttemptRepository(options.publishAttempts),
    workflowJobRepository: new InMemoryWorkflowJobRepository(options.workflowJobs),
    callbackReceiptRepository: new InMemoryCallbackReceiptRepository(options.callbackReceipts),
    workflowJobLogRepository: new InMemoryWorkflowJobLogRepository(options.workflowJobLogs),
    voiceJobRepository: new InMemoryVoiceJobRepository(options.voiceJobs),
    costRecordRepository: new InMemoryCostRecordRepository(options.costRecords),
    activityLogRepository: new InMemoryActivityLogRepository(options.activityLogs),
    versionSnapshotRepository: new InMemoryVersionSnapshotRepository(options.versionSnapshots)
  };
};

export const createInMemorySprint1Repositories = (
  options: CreateInMemoryRepositoriesOptions = {}
): Sprint1Repositories => {
  return createInMemoryPlatformRepositories(options);
};
