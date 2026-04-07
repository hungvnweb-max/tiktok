import type { FastifyInstance } from "fastify";
import {
  type ActivityLog,
  type CostRecord,
  type PublicationSchedule,
  type VersionSnapshot,
  type Video,
  type WorkflowJob,
  type WorkflowJobLog,
  type VideoDetail,
  activeVoiceoverProviders,
  assetStorageProviders,
  createReference,
  type AuditTrailService,
  type ImagePromptGenerationService,
  type SceneAssetService,
  type SceneVoiceGenerationService,
  type SubtitlePackGenerationService,
  type VideoCmsService,
  type VideoWorkflowService,
  type WorkflowJobService,
  imageGenerationProviders,
  publishModes,
  publishingProviders,
  subtitleModes,
  subtitlePositions
} from "@videotik/core";
import {
  ensureObject,
  readDate,
  readBoolean,
  readEnumValue,
  readOptionalEnumValue,
  readOptionalBoolean,
  readOptionalNumber,
  readOptionalString,
  readOptionalStringArray,
  readString,
  readTrackableEntityType
} from "./http-utils";
import type { ApiListResponse } from "./api-contracts";

type GenerateImagePromptPackResponse = Awaited<
  ReturnType<ImagePromptGenerationService["generateImagePromptPack"]>
>;
type GenerateSubtitlePackResponse = Awaited<
  ReturnType<SubtitlePackGenerationService["generateSubtitlePack"]>
>;
type GenerateSceneVoicesResponse = Awaited<
  ReturnType<SceneVoiceGenerationService["generateSceneVoices"]>
>;
type RegisterManualSceneImageResponse = Awaited<
  ReturnType<SceneAssetService["registerManualSceneImage"]>
>;
type SelectActiveSceneImageResponse = Awaited<
  ReturnType<SceneAssetService["selectActiveSceneImage"]>
>;

export const registerAssetRoutes = (
  app: FastifyInstance,
  services: {
    imagePromptGenerationService: ImagePromptGenerationService;
    sceneAssetService: SceneAssetService;
    sceneVoiceGenerationService: SceneVoiceGenerationService;
    subtitlePackGenerationService: SubtitlePackGenerationService;
    videoCmsService: VideoCmsService;
    videoWorkflowService: VideoWorkflowService;
    workflowJobService: WorkflowJobService;
    auditTrailService: AuditTrailService;
  }
): void => {
  app.post<{ Params: { videoId: string } }>(
    "/videos/:videoId/image-prompts/generate",
    async (request, reply): Promise<GenerateImagePromptPackResponse> => {
      const result = await services.imagePromptGenerationService.generateImagePromptPack({
        videoId: request.params.videoId
      });

      reply.code(201);
      return result;
    }
  );

  app.post<{ Params: { videoId: string } }>(
    "/videos/:videoId/subtitles/generate",
    async (request, reply): Promise<GenerateSubtitlePackResponse> => {
      const result = await services.subtitlePackGenerationService.generateSubtitlePack({
        videoId: request.params.videoId
      });

      reply.code(201);
      return result;
    }
  );

  app.post<{ Params: { videoId: string } }>(
    "/videos/:videoId/voices/generate",
    async (request, reply): Promise<GenerateSceneVoicesResponse> => {
      const body = request.body === undefined ? {} : ensureObject(request.body);
      const provider = readOptionalEnumValue(body, "provider", activeVoiceoverProviders);
      const voiceId = readOptionalString(body, "voiceId");
      const styleNotes = readOptionalStringArray(body, "styleNotes");
      const result = await services.sceneVoiceGenerationService.generateSceneVoices({
        videoId: request.params.videoId,
        ...(provider ? { provider } : {}),
        ...(voiceId ? { voiceId } : {}),
        ...(styleNotes ? { styleNotes } : {})
      });

      reply.code(201);
      return result;
    }
  );

  app.get("/videos", async (): Promise<ApiListResponse<Video>> => {
    const items = await services.videoCmsService.listVideos();

    return {
      items
    };
  });

  app.get<{ Params: { videoId: string } }>(
    "/videos/:videoId",
    async (request): Promise<VideoDetail> => {
      return services.videoCmsService.getVideoDetail(request.params.videoId);
    }
  );

  app.post<{ Params: { videoId: string } }>(
    "/videos/:videoId/schedule",
    async (request, reply): Promise<PublicationSchedule> => {
      const body = ensureObject(request.body);
      const provider = readOptionalEnumValue(body, "provider", publishingProviders);
      const mode = readOptionalEnumValue(body, "mode", publishModes);
      const schedule = await services.videoCmsService.scheduleVideo({
        videoId: request.params.videoId,
        platformSlug: readString(body, "platformSlug"),
        ...(provider ? { provider } : {}),
        ...(mode ? { mode } : {}),
        timezone: readString(body, "timezone"),
        scheduledFor: readDate(body, "scheduledFor"),
        caption: readString(body, "caption"),
        hashtags: readOptionalStringArray(body, "hashtags") ?? []
      });

      reply.code(201);
      return schedule;
    }
  );

  app.get("/schedules", async (): Promise<ApiListResponse<PublicationSchedule>> => {
    const items = await services.videoCmsService.listSchedules();

    return {
      items
    };
  });

  app.post<{ Params: { videoId: string; sceneId: string } }>(
    "/videos/:videoId/scenes/:sceneId/images/manual",
    async (request, reply): Promise<RegisterManualSceneImageResponse> => {
      const body = ensureObject(request.body);
      const provider = readOptionalEnumValue(body, "provider", imageGenerationProviders);
      const storageProvider = readOptionalEnumValue(body, "storageProvider", assetStorageProviders);
      const storageKey = readOptionalString(body, "storageKey");
      const mimeType = readOptionalString(body, "mimeType");
      const bytes = readOptionalNumber(body, "bytes");
      const width = readOptionalNumber(body, "width");
      const height = readOptionalNumber(body, "height");
      const result = await services.sceneAssetService.registerManualSceneImage({
        videoId: request.params.videoId,
        sceneId: request.params.sceneId,
        assetUrl: readString(body, "assetUrl"),
        ...(provider ? { provider } : {}),
        ...(storageProvider ? { storageProvider } : {}),
        ...(storageKey ? { storageKey } : {}),
        ...(mimeType ? { mimeType } : {}),
        ...(bytes === undefined ? {} : { bytes }),
        ...(width === undefined ? {} : { width }),
        ...(height === undefined ? {} : { height })
      });

      reply.code(201);
      return result;
    }
  );

  app.post<{ Params: { videoId: string; sceneId: string; assetId: string } }>(
    "/videos/:videoId/scenes/:sceneId/images/:assetId/activate",
    async (request): Promise<SelectActiveSceneImageResponse> => {
      return services.sceneAssetService.selectActiveSceneImage({
        videoId: request.params.videoId,
        sceneId: request.params.sceneId,
        assetId: request.params.assetId
      });
    }
  );

  app.post<{ Params: { videoId: string } }>(
    "/videos/:videoId/subtitle-config",
    async (request): Promise<Video> => {
      const body = ensureObject(request.body);

      return services.videoWorkflowService.updateVideoSubtitleConfig(request.params.videoId, {
        enabled: readBoolean(body, "enabled"),
        mode: readEnumValue(body, "mode", subtitleModes),
        stylePreset: readOptionalString(body, "stylePreset") ?? "clean-bold",
        maxWordsPerLine: readOptionalNumber(body, "maxWordsPerLine") ?? 5,
        position: readOptionalEnumValue(body, "position", subtitlePositions) ?? "bottom",
        highlightKeywords: readOptionalBoolean(body, "highlightKeywords") ?? true
      });
    }
  );

  app.post<{ Params: { videoId: string; sceneId: string } }>(
    "/videos/:videoId/scenes/:sceneId/subtitle-config",
    async (request): Promise<Video> => {
      const body = ensureObject(request.body);

      return services.videoWorkflowService.updateSceneSubtitleConfig(
        request.params.videoId,
        request.params.sceneId,
        {
          enabled: readBoolean(body, "enabled"),
          mode: readEnumValue(body, "mode", subtitleModes)
        }
      );
    }
  );

  app.get("/jobs", async (): Promise<ApiListResponse<WorkflowJob>> => {
    const items = await services.workflowJobService.listJobs();

    return {
      items
    };
  });

  app.get<{ Params: { jobId: string } }>(
    "/jobs/:jobId/logs",
    async (request): Promise<ApiListResponse<WorkflowJobLog>> => {
      const items = await services.workflowJobService.listLogs(request.params.jobId);

      return {
        items
      };
    }
  );

  app.get("/activity", async (): Promise<ApiListResponse<ActivityLog>> => {
    const items = await services.auditTrailService.listActivity();

    return {
      items
    };
  });

  app.get("/costs", async (): Promise<ApiListResponse<CostRecord>> => {
    const items = await services.auditTrailService.listCosts();

    return {
      items
    };
  });

  app.get<{ Params: { entityType: string; entityId: string } }>(
    "/versions/:entityType/:entityId",
    async (request): Promise<ApiListResponse<VersionSnapshot>> => {
      const items = await services.auditTrailService.listVersions(
        createReference(
          readTrackableEntityType(request.params.entityType),
          request.params.entityId
        )
      );

      return {
        items
      };
    }
  );
};
