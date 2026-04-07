import { AuditTrailService, WorkflowJobService, createReference } from "./operational-services";
import { PublishingWorkflowService } from "./publishing-services";
import { RenderWorkflowService } from "./render-services";
import {
  ImagePromptGenerationService,
  SceneAssetService,
  SceneVoiceGenerationService,
  SubtitlePackGenerationService,
  VideoCmsService
} from "./asset-services";
import { VideoWorkflowService } from "./video-workflow-services";
import { createContentCaption, type CreateContentCaptionInput } from "../domain/caption/caption";
import {
  buildSceneRolesForCount,
  isContentFormatActive,
  type ContentFormat
} from "../domain/content-format/content-format";
import { ConflictError, InvalidStateError, NotFoundError } from "../domain/common/entity";
import { createContentIdea } from "../domain/idea/idea";
import { createContentScript } from "../domain/script/script";
import {
  validateScenesAgainstContentFormat,
  validateScriptDurationAgainstContentFormat
} from "../domain/script/script-validation";
import {
  archiveTopic,
  createTopic,
  updateTopic,
  type CreateTopicInput,
  type UpdateTopicInput
} from "../domain/topic/topic";
import {
  createDefaultImageWorkflowConfig,
  createDefaultRenderConfig,
  createDefaultSubtitleConfig,
  createDefaultVoiceoverConfig,
  createVideoConcept
} from "../domain/video/video";
import type { ImagePromptGenerationPort } from "../ports/image-prompt-generation-port";
import type { PlatformRepositories } from "../ports/repositories";
import type { SceneVoiceGenerationPort } from "../ports/scene-voice-generation-port";
import type { SubtitleCompositionPort } from "../ports/subtitle-composition-port";
import type { TextGenerationPort } from "../ports/text-generation-port";
import type { PublishingProviderPort } from "../ports/publishing-provider-port";
import type { RenderPipelinePort } from "../ports/render-pipeline-port";

export interface GenerateIdeaInput {
  topicId: string;
  contentFormatSlug: string;
}

export interface GenerateScriptInput {
  ideaId: string;
}

export interface GenerateCaptionInput {
  scriptId: string;
}

export interface Sprint1Dependencies {
  repositories: PlatformRepositories;
  textGenerationPort: TextGenerationPort;
}

export interface Sprint2Dependencies extends Sprint1Dependencies {
  imagePromptGenerationPort: ImagePromptGenerationPort;
  sceneVoiceGenerationPort: SceneVoiceGenerationPort;
  subtitleCompositionPort: SubtitleCompositionPort;
  renderPipelines: RenderPipelinePort[];
}

export interface Sprint5Dependencies extends Sprint2Dependencies {
  publishingProviders: PublishingProviderPort[];
}

export class TopicService {
  constructor(
    private readonly repositories: PlatformRepositories,
    private readonly auditTrailService: AuditTrailService
  ) {}

  async createTopic(input: CreateTopicInput) {
    const topic = createTopic(input);
    const existing = await this.repositories.topicRepository.findBySlug(topic.slug);

    if (existing) {
      throw new ConflictError(`A topic with slug "${topic.slug}" already exists.`, {
        field: "slug",
        slug: topic.slug
      });
    }

    await this.repositories.topicRepository.save(topic);
    await this.auditTrailService.recordActivity({
      action: "topic.created",
      reference: createReference("topic", topic.id),
      message: `Created topic "${topic.slug}".`
    });
    await this.auditTrailService.snapshot(createReference("topic", topic.id), "topic.created", topic);
    return topic;
  }

  async updateTopic(topicId: string, input: UpdateTopicInput) {
    const existing = await this.getTopicOrThrow(topicId);
    const updated = updateTopic(existing, input);
    const duplicate = await this.repositories.topicRepository.findBySlug(updated.slug);

    if (duplicate && duplicate.id !== topicId) {
      throw new ConflictError(`A topic with slug "${updated.slug}" already exists.`, {
        field: "slug",
        slug: updated.slug
      });
    }

    await this.repositories.topicRepository.save(updated);
    await this.auditTrailService.recordActivity({
      action: "topic.updated",
      reference: createReference("topic", updated.id),
      message: `Updated topic "${updated.slug}".`
    });
    await this.auditTrailService.snapshot(createReference("topic", updated.id), "topic.updated", updated);
    return updated;
  }

  async archiveTopic(topicId: string) {
    const existing = await this.getTopicOrThrow(topicId);
    const archived = archiveTopic(existing);
    await this.repositories.topicRepository.save(archived);
    await this.auditTrailService.recordActivity({
      action: "topic.archived",
      reference: createReference("topic", archived.id),
      message: `Archived topic "${archived.slug}".`
    });
    await this.auditTrailService.snapshot(createReference("topic", archived.id), "topic.archived", archived);
    return archived;
  }

  async getTopicOrThrow(topicId: string) {
    const topic = await this.repositories.topicRepository.findById(topicId);

    if (!topic) {
      throw new NotFoundError(`Topic "${topicId}" was not found.`, {
        entityType: "topic",
        entityId: topicId
      });
    }

    return topic;
  }

  async listTopics() {
    return this.repositories.topicRepository.list();
  }
}

export class ContentFormatService {
  constructor(private readonly repositories: PlatformRepositories) {}

  async listFormats() {
    return this.repositories.contentFormatRepository.list();
  }

  async getFormatBySlugOrThrow(contentFormatSlug: string) {
    const contentFormat = await this.repositories.contentFormatRepository.findBySlug(contentFormatSlug);

    if (!contentFormat) {
      throw new NotFoundError(`Content format "${contentFormatSlug}" was not found.`, {
        entityType: "content_format",
        slug: contentFormatSlug
      });
    }

    return contentFormat;
  }
}

class ContentGenerationRulesService {
  validateScript(contentFormat: ContentFormat, script: ReturnType<typeof createContentScript>) {
    validateScenesAgainstContentFormat(script.scenes, contentFormat);
    validateScriptDurationAgainstContentFormat(script.estimatedDurationSeconds, contentFormat);
  }

  buildTargetSceneRoles(contentFormat: ContentFormat) {
    return buildSceneRolesForCount(contentFormat);
  }
}

export class IdeaGenerationService {
  constructor(
    private readonly repositories: PlatformRepositories,
    private readonly textGenerationPort: TextGenerationPort,
    private readonly topicService: TopicService,
    private readonly contentFormatService: ContentFormatService,
    private readonly workflowJobService: WorkflowJobService,
    private readonly auditTrailService: AuditTrailService
  ) {}

  async generateIdea(input: GenerateIdeaInput) {
    const topic = await this.topicService.getTopicOrThrow(input.topicId);

    if (topic.status !== "active") {
      throw new InvalidStateError(`Topic "${topic.id}" is archived and cannot generate new ideas.`, {
        topicId: topic.id,
        currentStatus: topic.status
      });
    }

    const contentFormat = await this.contentFormatService.getFormatBySlugOrThrow(input.contentFormatSlug);

    if (!isContentFormatActive(contentFormat)) {
      throw new InvalidStateError(`Content format "${contentFormat.slug}" is not available for generation.`, {
        contentFormatId: contentFormat.id,
        contentFormatSlug: contentFormat.slug,
        status: contentFormat.status
      });
    }

    const execution = await this.workflowJobService.runJob({
      type: "idea_generation",
      reference: createReference("topic", topic.id),
      payload: {
        contentFormatSlug: contentFormat.slug
      },
      executor: async () => {
        const generatedIdea = await this.textGenerationPort.generateIdea({
          topic,
          contentFormat
        });

        const idea = createContentIdea({
          topicId: topic.id,
          contentFormatId: contentFormat.id,
          title: generatedIdea.title,
          hook: generatedIdea.hook,
          angle: generatedIdea.angle,
          brief: generatedIdea.brief,
          callToAction: generatedIdea.callToAction,
          targetAudience: generatedIdea.targetAudience,
          keywords: generatedIdea.keywords,
          formatRationale: generatedIdea.formatRationale,
          generationProvider: this.textGenerationPort.providerId,
          sourceMetadata: {
            contentFormatSlug: contentFormat.slug,
            topicSlug: topic.slug
          }
        });

        await this.repositories.ideaRepository.save(idea);
        await this.auditTrailService.recordActivity({
          action: "idea.generated",
          reference: createReference("idea", idea.id),
          message: `Generated idea "${idea.title}" for topic "${topic.slug}".`
        });
        await this.auditTrailService.snapshot(createReference("idea", idea.id), "idea.generated", idea);
        await this.auditTrailService.recordCost({
          provider: this.textGenerationPort.providerId,
          category: "text_generation",
          reference: createReference("idea", idea.id),
          amount: 0,
          units: "idea",
          quantity: 1
        });

        return idea;
      }
    });

    return {
      job: execution.job,
      logs: execution.logs,
      idea: execution.result
    };
  }
}

export class ScriptGenerationService {
  private readonly rulesService = new ContentGenerationRulesService();

  constructor(
    private readonly repositories: PlatformRepositories,
    private readonly textGenerationPort: TextGenerationPort,
    private readonly topicService: TopicService,
    private readonly workflowJobService: WorkflowJobService,
    private readonly auditTrailService: AuditTrailService
  ) {}

  async generateScript(input: GenerateScriptInput) {
    const idea = await this.repositories.ideaRepository.findById(input.ideaId);

    if (!idea) {
      throw new NotFoundError(`Idea "${input.ideaId}" was not found.`, {
        entityType: "idea",
        entityId: input.ideaId
      });
    }

    const topic = await this.topicService.getTopicOrThrow(idea.topicId);
    const contentFormat = await this.repositories.contentFormatRepository.findById(idea.contentFormatId);

    if (!contentFormat) {
      throw new NotFoundError(`Content format "${idea.contentFormatId}" was not found.`, {
        entityType: "content_format",
        entityId: idea.contentFormatId
      });
    }

    const execution = await this.workflowJobService.runJob({
      type: "script_generation",
      reference: createReference("idea", idea.id),
      payload: {
        contentFormatSlug: contentFormat.slug
      },
      executor: async () => {
        const generatedScript = await this.textGenerationPort.generateScript({
          topic,
          contentFormat,
          idea
        });

        const script = createContentScript({
          topicId: topic.id,
          ideaId: idea.id,
          contentFormatId: contentFormat.id,
          title: generatedScript.title,
          summary: generatedScript.summary,
          voiceover: generatedScript.voiceover,
          scenes: generatedScript.scenes,
          estimatedDurationSeconds: generatedScript.estimatedDurationSeconds,
          generationProvider: this.textGenerationPort.providerId,
          sourceMetadata: {
            contentFormatSlug: contentFormat.slug,
            topicSlug: topic.slug
          }
        });

        this.rulesService.validateScript(contentFormat, script);
        await this.repositories.scriptRepository.save(script);

        const video = createVideoConcept({
          topicId: topic.id,
          ideaId: idea.id,
          scriptId: script.id,
          contentFormatId: contentFormat.id,
          formatSlug: contentFormat.slug,
          title: script.title,
          scenes: script.scenes,
          estimatedDurationSeconds: script.estimatedDurationSeconds,
          subtitleConfig: createDefaultSubtitleConfig(contentFormat),
          imageWorkflowConfig: createDefaultImageWorkflowConfig(contentFormat),
          voiceoverConfig: createDefaultVoiceoverConfig(contentFormat),
          renderConfig: createDefaultRenderConfig(contentFormat),
          publishingConfig: null
        });

        await this.repositories.videoRepository.save(video);
        await this.auditTrailService.recordActivity({
          action: "script.generated",
          reference: createReference("script", script.id),
          message: `Generated script "${script.title}" with ${script.scenes.length} scenes.`
        });
        await this.auditTrailService.snapshot(createReference("script", script.id), "script.generated", script);
        await this.auditTrailService.recordActivity({
          action: "video.created",
          reference: createReference("video", video.id),
          message: `Created video draft "${video.id}" from script "${script.id}".`
        });
        await this.auditTrailService.snapshot(createReference("video", video.id), "video.created", video);
        await this.auditTrailService.recordCost({
          provider: this.textGenerationPort.providerId,
          category: "text_generation",
          reference: createReference("script", script.id),
          amount: 0,
          units: "scene",
          quantity: script.scenes.length
        });

        return {
          script,
          video
        };
      }
    });

    return {
      job: execution.job,
      logs: execution.logs,
      script: execution.result.script,
      video: execution.result.video
    };
  }
}

export class CaptionGenerationService {
  constructor(
    private readonly repositories: PlatformRepositories,
    private readonly textGenerationPort: TextGenerationPort,
    private readonly topicService: TopicService,
    private readonly workflowJobService: WorkflowJobService,
    private readonly auditTrailService: AuditTrailService
  ) {}

  async generateCaption(input: GenerateCaptionInput) {
    const script = await this.repositories.scriptRepository.findById(input.scriptId);

    if (!script) {
      throw new NotFoundError(`Script "${input.scriptId}" was not found.`, {
        entityType: "script",
        entityId: input.scriptId
      });
    }

    const idea = await this.repositories.ideaRepository.findById(script.ideaId);

    if (!idea) {
      throw new NotFoundError(`Idea "${script.ideaId}" was not found.`, {
        entityType: "idea",
        entityId: script.ideaId
      });
    }

    const topic = await this.topicService.getTopicOrThrow(script.topicId);
    const contentFormat = await this.repositories.contentFormatRepository.findById(script.contentFormatId);

    if (!contentFormat) {
      throw new NotFoundError(`Content format "${script.contentFormatId}" was not found.`, {
        entityType: "content_format",
        entityId: script.contentFormatId
      });
    }

    const execution = await this.workflowJobService.runJob({
      type: "caption_generation",
      reference: createReference("script", script.id),
      payload: {
        contentFormatSlug: contentFormat.slug
      },
      executor: async () => {
        const generatedCaption = await this.textGenerationPort.generateCaption({
          topic,
          contentFormat,
          idea,
          script
        });

        const captionInput: CreateContentCaptionInput = {
          topicId: topic.id,
          ideaId: idea.id,
          scriptId: script.id,
          contentFormatId: contentFormat.id,
          shortCaption: generatedCaption.shortCaption,
          longCaption: generatedCaption.longCaption,
          hashtags: generatedCaption.hashtags,
          callToAction: generatedCaption.callToAction,
          generationProvider: this.textGenerationPort.providerId,
          sourceMetadata: {
            contentFormatSlug: contentFormat.slug,
            topicSlug: topic.slug
          }
        };

        const caption = createContentCaption(captionInput);
        await this.repositories.captionRepository.save(caption);
        await this.auditTrailService.recordActivity({
          action: "caption.generated",
          reference: createReference("caption", caption.id),
          message: `Generated caption "${caption.id}" for script "${script.id}".`
        });
        await this.auditTrailService.snapshot(
          createReference("caption", caption.id),
          "caption.generated",
          caption
        );
        await this.auditTrailService.recordCost({
          provider: this.textGenerationPort.providerId,
          category: "text_generation",
          reference: createReference("caption", caption.id),
          amount: 0,
          units: "caption",
          quantity: 1
        });

        return caption;
      }
    });

    return {
      job: execution.job,
      logs: execution.logs,
      caption: execution.result
    };
  }
}

export interface Sprint1Services {
  topicService: TopicService;
  contentFormatService: ContentFormatService;
  ideaGenerationService: IdeaGenerationService;
  scriptGenerationService: ScriptGenerationService;
  captionGenerationService: CaptionGenerationService;
  workflowJobService: WorkflowJobService;
  auditTrailService: AuditTrailService;
}

export interface Sprint2Services extends Sprint1Services {
  imagePromptGenerationService: ImagePromptGenerationService;
  sceneAssetService: SceneAssetService;
  sceneVoiceGenerationService: SceneVoiceGenerationService;
  subtitlePackGenerationService: SubtitlePackGenerationService;
  videoCmsService: VideoCmsService;
  videoWorkflowService: VideoWorkflowService;
  renderWorkflowService: RenderWorkflowService;
}

export interface Sprint5Services extends Sprint2Services {
  publishingWorkflowService: PublishingWorkflowService;
}

export const createSprint1Services = (dependencies: Sprint1Dependencies): Sprint1Services => {
  const auditTrailService = new AuditTrailService(dependencies.repositories);
  const workflowJobService = new WorkflowJobService(dependencies.repositories);
  const topicService = new TopicService(dependencies.repositories, auditTrailService);
  const contentFormatService = new ContentFormatService(dependencies.repositories);

  return {
    topicService,
    contentFormatService,
    ideaGenerationService: new IdeaGenerationService(
      dependencies.repositories,
      dependencies.textGenerationPort,
      topicService,
      contentFormatService,
      workflowJobService,
      auditTrailService
    ),
    scriptGenerationService: new ScriptGenerationService(
      dependencies.repositories,
      dependencies.textGenerationPort,
      topicService,
      workflowJobService,
      auditTrailService
    ),
    captionGenerationService: new CaptionGenerationService(
      dependencies.repositories,
      dependencies.textGenerationPort,
      topicService,
      workflowJobService,
      auditTrailService
    ),
    workflowJobService,
    auditTrailService
  };
};

export const createSprint2Services = (dependencies: Sprint2Dependencies): Sprint2Services => {
  const sprint1Services = createSprint1Services(dependencies);
  const videoWorkflowService = new VideoWorkflowService(
    dependencies.repositories,
    sprint1Services.auditTrailService
  );

  return {
    ...sprint1Services,
    imagePromptGenerationService: new ImagePromptGenerationService(
      dependencies.repositories,
      dependencies.imagePromptGenerationPort,
      sprint1Services.workflowJobService,
      sprint1Services.auditTrailService
    ),
    sceneAssetService: new SceneAssetService(
      dependencies.repositories,
      sprint1Services.auditTrailService
    ),
    sceneVoiceGenerationService: new SceneVoiceGenerationService(
      dependencies.repositories,
      dependencies.sceneVoiceGenerationPort,
      sprint1Services.workflowJobService,
      sprint1Services.auditTrailService
    ),
    subtitlePackGenerationService: new SubtitlePackGenerationService(
      dependencies.repositories,
      dependencies.subtitleCompositionPort,
      sprint1Services.workflowJobService,
      sprint1Services.auditTrailService
    ),
    videoCmsService: new VideoCmsService(
      dependencies.repositories,
      sprint1Services.auditTrailService
    ),
    videoWorkflowService,
    renderWorkflowService: new RenderWorkflowService(
      dependencies.repositories,
      dependencies.renderPipelines,
      videoWorkflowService,
      sprint1Services.workflowJobService,
      sprint1Services.auditTrailService
    )
  };
};

export const createSprint5Services = (dependencies: Sprint5Dependencies): Sprint5Services => {
  const sprint2Services = createSprint2Services(dependencies);

  return {
    ...sprint2Services,
    publishingWorkflowService: new PublishingWorkflowService(
      dependencies.repositories,
      dependencies.publishingProviders,
      sprint2Services.workflowJobService,
      sprint2Services.auditTrailService
    )
  };
};
