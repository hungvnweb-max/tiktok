-- Initial content operations schema.
-- This migration resets pre-production tables from earlier scaffolding so the
-- database shape matches the required platform entities exactly.

DROP TABLE IF EXISTS "publish_jobs" CASCADE;
DROP TABLE IF EXISTS "render_jobs" CASCADE;
DROP TABLE IF EXISTS "voice_jobs" CASCADE;
DROP TABLE IF EXISTS "subtitle_settings" CASCADE;
DROP TABLE IF EXISTS "assets" CASCADE;
DROP TABLE IF EXISTS "schedules" CASCADE;
DROP TABLE IF EXISTS "activity_logs" CASCADE;
DROP TABLE IF EXISTS "version_records" CASCADE;
DROP TABLE IF EXISTS "cost_logs" CASCADE;
DROP TABLE IF EXISTS "scenes" CASCADE;
DROP TABLE IF EXISTS "videos" CASCADE;
DROP TABLE IF EXISTS "ideas" CASCADE;
DROP TABLE IF EXISTS "content_formats" CASCADE;
DROP TABLE IF EXISTS "topics" CASCADE;

DROP TABLE IF EXISTS "WorkflowJobLog" CASCADE;
DROP TABLE IF EXISTS "WorkflowJob" CASCADE;
DROP TABLE IF EXISTS "SubtitlePack" CASCADE;
DROP TABLE IF EXISTS "ImagePromptPack" CASCADE;
DROP TABLE IF EXISTS "PublicationSchedule" CASCADE;
DROP TABLE IF EXISTS "VersionSnapshot" CASCADE;
DROP TABLE IF EXISTS "CostRecord" CASCADE;
DROP TABLE IF EXISTS "ActivityLog" CASCADE;
DROP TABLE IF EXISTS "Scene" CASCADE;
DROP TABLE IF EXISTS "Video" CASCADE;
DROP TABLE IF EXISTS "ContentCaption" CASCADE;
DROP TABLE IF EXISTS "ContentScript" CASCADE;
DROP TABLE IF EXISTS "ContentIdea" CASCADE;
DROP TABLE IF EXISTS "ContentFormat" CASCADE;
DROP TABLE IF EXISTS "Topic" CASCADE;

DROP TYPE IF EXISTS "CostCategory" CASCADE;
DROP TYPE IF EXISTS "TrackedEntityType" CASCADE;
DROP TYPE IF EXISTS "ActivityActorType" CASCADE;
DROP TYPE IF EXISTS "ChannelType" CASCADE;
DROP TYPE IF EXISTS "ScheduleStatus" CASCADE;
DROP TYPE IF EXISTS "SubtitlePosition" CASCADE;
DROP TYPE IF EXISTS "SubtitleMode" CASCADE;
DROP TYPE IF EXISTS "SubtitleOwnerType" CASCADE;
DROP TYPE IF EXISTS "VoiceJobScope" CASCADE;
DROP TYPE IF EXISTS "VoiceGenerationMode" CASCADE;
DROP TYPE IF EXISTS "AsyncJobStatus" CASCADE;
DROP TYPE IF EXISTS "AssetStatus" CASCADE;
DROP TYPE IF EXISTS "AssetType" CASCADE;
DROP TYPE IF EXISTS "AssetScope" CASCADE;
DROP TYPE IF EXISTS "SceneStatus" CASCADE;
DROP TYPE IF EXISTS "SceneRole" CASCADE;
DROP TYPE IF EXISTS "VideoStatus" CASCADE;
DROP TYPE IF EXISTS "IdeaStatus" CASCADE;
DROP TYPE IF EXISTS "ContentFormatStatus" CASCADE;
DROP TYPE IF EXISTS "TopicStatus" CASCADE;

DROP TYPE IF EXISTS "ReferenceEntityType" CASCADE;
DROP TYPE IF EXISTS "WorkflowJobType" CASCADE;
DROP TYPE IF EXISTS "WorkflowJobStatus" CASCADE;
DROP TYPE IF EXISTS "ImageWorkflowMode" CASCADE;
DROP TYPE IF EXISTS "ImagePromptPackStatus" CASCADE;
DROP TYPE IF EXISTS "SubtitlePackStatus" CASCADE;
DROP TYPE IF EXISTS "PublicationScheduleStatus" CASCADE;
DROP TYPE IF EXISTS "ScriptStatus" CASCADE;
DROP TYPE IF EXISTS "CaptionStatus" CASCADE;

CREATE TYPE "TopicStatus" AS ENUM ('ACTIVE', 'ARCHIVED');
CREATE TYPE "ContentFormatStatus" AS ENUM ('ACTIVE', 'DEPRECATED');
CREATE TYPE "IdeaStatus" AS ENUM ('DRAFT', 'READY', 'APPROVED', 'REJECTED', 'ARCHIVED');
CREATE TYPE "VideoStatus" AS ENUM (
  'IDEA_CREATED',
  'SCRIPT_READY',
  'IMAGE_READY',
  'VOICE_READY',
  'RENDER_READY',
  'RENDERED',
  'SCHEDULED',
  'PUBLISHED',
  'FAILED'
);
CREATE TYPE "SceneRole" AS ENUM ('HOOK', 'SETUP', 'BODY', 'PROOF', 'TWIST', 'PAYOFF', 'CTA');
CREATE TYPE "SceneStatus" AS ENUM ('DRAFT', 'READY', 'FAILED');
CREATE TYPE "AssetScope" AS ENUM ('SCENE', 'VIDEO');
CREATE TYPE "AssetType" AS ENUM (
  'IMAGE',
  'AUDIO',
  'SUBTITLE_DATA',
  'OVERLAY_DATA',
  'RENDERED_VIDEO',
  'THUMBNAIL',
  'PROJECT_FILE'
);
CREATE TYPE "AssetStatus" AS ENUM ('PENDING', 'READY', 'FAILED', 'ARCHIVED');
CREATE TYPE "AsyncJobStatus" AS ENUM ('WAITING', 'PROCESSING', 'COMPLETED', 'FAILED', 'RETRYING');
CREATE TYPE "VoiceGenerationMode" AS ENUM ('SCENE_PER_LINE', 'MERGED_NARRATION');
CREATE TYPE "VoiceJobScope" AS ENUM ('SCENE', 'VIDEO');
CREATE TYPE "SubtitleOwnerType" AS ENUM ('VIDEO', 'SCENE');
CREATE TYPE "SubtitleMode" AS ENUM ('OFF', 'SENTENCE', 'PHRASE_HIGHLIGHT', 'WORD_KARAOKE');
CREATE TYPE "SubtitlePosition" AS ENUM ('BOTTOM', 'CENTER');
CREATE TYPE "ScheduleStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'PROCESSING', 'PUBLISHED', 'FAILED', 'CANCELED');
CREATE TYPE "ChannelType" AS ENUM ('TIKTOK', 'YOUTUBE_SHORTS', 'INSTAGRAM_REELS', 'CUSTOM');
CREATE TYPE "ActivityActorType" AS ENUM ('SYSTEM', 'USER', 'WORKER');
CREATE TYPE "TrackedEntityType" AS ENUM (
  'TOPIC',
  'IDEA',
  'CONTENT_FORMAT',
  'VIDEO',
  'SCENE',
  'ASSET',
  'VOICE_JOB',
  'RENDER_JOB',
  'PUBLISH_JOB',
  'SUBTITLE_SETTING',
  'SCHEDULE'
);
CREATE TYPE "CostCategory" AS ENUM (
  'IDEA_GENERATION',
  'IMAGE_GENERATION',
  'VOICE_GENERATION',
  'SUBTITLE_GENERATION',
  'RENDER',
  'PUBLISH',
  'STORAGE',
  'OTHER'
);

CREATE TABLE "topics" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "audience" TEXT NOT NULL,
  "contentPillars" JSONB NOT NULL,
  "keywords" JSONB NOT NULL,
  "preferredFormatSlugs" JSONB NOT NULL,
  "status" "TopicStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "topics_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "content_formats" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "objective" TEXT NOT NULL,
  "defaultDurationSeconds" INTEGER NOT NULL,
  "defaultSceneCount" INTEGER NOT NULL,
  "promptGuidance" JSONB NOT NULL,
  "structure" JSONB NOT NULL,
  "deliveryOptions" JSONB NOT NULL,
  "capabilities" JSONB NOT NULL,
  "status" "ContentFormatStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "content_formats_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ideas" (
  "id" TEXT NOT NULL,
  "topicId" TEXT NOT NULL,
  "contentFormatId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "hook" TEXT NOT NULL,
  "angle" TEXT NOT NULL,
  "brief" TEXT NOT NULL,
  "callToAction" TEXT NOT NULL,
  "targetAudience" TEXT NOT NULL,
  "keywords" JSONB NOT NULL,
  "formatRationale" TEXT NOT NULL,
  "generationProvider" TEXT NOT NULL,
  "sourceMetadata" JSONB,
  "status" "IdeaStatus" NOT NULL DEFAULT 'DRAFT',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ideas_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ideas_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "topics"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ideas_contentFormatId_fkey" FOREIGN KEY ("contentFormatId") REFERENCES "content_formats"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "videos" (
  "id" TEXT NOT NULL,
  "topicId" TEXT NOT NULL,
  "ideaId" TEXT NOT NULL,
  "contentFormatId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "status" "VideoStatus" NOT NULL DEFAULT 'IDEA_CREATED',
  "estimatedDurationSeconds" INTEGER NOT NULL,
  "captionText" TEXT,
  "hashtags" JSONB,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "videos_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "videos_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "topics"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "videos_ideaId_fkey" FOREIGN KEY ("ideaId") REFERENCES "ideas"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "videos_contentFormatId_fkey" FOREIGN KEY ("contentFormatId") REFERENCES "content_formats"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "scenes" (
  "id" TEXT NOT NULL,
  "videoId" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "role" "SceneRole" NOT NULL,
  "status" "SceneStatus" NOT NULL DEFAULT 'READY',
  "voiceLine" TEXT NOT NULL,
  "overlayText" TEXT NOT NULL,
  "visualDirection" TEXT NOT NULL,
  "estimatedDurationSeconds" INTEGER NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "scenes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "scenes_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "assets" (
  "id" TEXT NOT NULL,
  "videoId" TEXT NOT NULL,
  "sceneId" TEXT,
  "scope" "AssetScope" NOT NULL,
  "assetType" "AssetType" NOT NULL,
  "status" "AssetStatus" NOT NULL DEFAULT 'PENDING',
  "provider" TEXT NOT NULL,
  "storageProvider" TEXT,
  "uri" TEXT,
  "mimeType" TEXT,
  "versionNumber" INTEGER NOT NULL DEFAULT 1,
  "isActive" BOOLEAN NOT NULL DEFAULT false,
  "width" INTEGER,
  "height" INTEGER,
  "durationSeconds" INTEGER,
  "byteSizeBytes" BIGINT,
  "checksum" TEXT,
  "promptText" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "assets_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "assets_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "assets_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "scenes"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "schedules" (
  "id" TEXT NOT NULL,
  "videoId" TEXT NOT NULL,
  "channelType" "ChannelType" NOT NULL,
  "platformSlug" TEXT NOT NULL,
  "channelSlug" TEXT,
  "destinationRef" TEXT,
  "timezone" TEXT NOT NULL,
  "scheduledFor" TIMESTAMP(3) NOT NULL,
  "status" "ScheduleStatus" NOT NULL DEFAULT 'SCHEDULED',
  "publishedAt" TIMESTAMP(3),
  "lastErrorMessage" TEXT,
  "captionText" TEXT,
  "hashtags" JSONB,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "schedules_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "schedules_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "voice_jobs" (
  "id" TEXT NOT NULL,
  "videoId" TEXT NOT NULL,
  "sceneId" TEXT,
  "scope" "VoiceJobScope" NOT NULL,
  "scopeRef" TEXT NOT NULL,
  "attemptNumber" INTEGER NOT NULL DEFAULT 1,
  "status" "AsyncJobStatus" NOT NULL DEFAULT 'WAITING',
  "provider" TEXT NOT NULL,
  "generationMode" "VoiceGenerationMode" NOT NULL DEFAULT 'SCENE_PER_LINE',
  "voiceId" TEXT,
  "inputText" TEXT NOT NULL,
  "outputAssetId" TEXT,
  "providerRequestId" TEXT,
  "errorMessage" TEXT,
  "requestPayload" JSONB,
  "responsePayload" JSONB,
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "voice_jobs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "voice_jobs_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "voice_jobs_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "scenes"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "voice_jobs_outputAssetId_fkey" FOREIGN KEY ("outputAssetId") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "render_jobs" (
  "id" TEXT NOT NULL,
  "videoId" TEXT NOT NULL,
  "scheduleId" TEXT,
  "attemptNumber" INTEGER NOT NULL DEFAULT 1,
  "status" "AsyncJobStatus" NOT NULL DEFAULT 'WAITING',
  "provider" TEXT NOT NULL,
  "templateSlug" TEXT NOT NULL,
  "channelType" "ChannelType" NOT NULL,
  "targetPlatform" TEXT NOT NULL,
  "outputAssetId" TEXT,
  "providerJobId" TEXT,
  "errorMessage" TEXT,
  "requestPayload" JSONB,
  "responsePayload" JSONB,
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "render_jobs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "render_jobs_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "render_jobs_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "schedules"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "render_jobs_outputAssetId_fkey" FOREIGN KEY ("outputAssetId") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "publish_jobs" (
  "id" TEXT NOT NULL,
  "videoId" TEXT NOT NULL,
  "scheduleId" TEXT NOT NULL,
  "attemptNumber" INTEGER NOT NULL DEFAULT 1,
  "status" "AsyncJobStatus" NOT NULL DEFAULT 'WAITING',
  "channelType" "ChannelType" NOT NULL,
  "platformSlug" TEXT NOT NULL,
  "channelSlug" TEXT,
  "destinationRef" TEXT,
  "provider" TEXT NOT NULL,
  "remotePublicationId" TEXT,
  "errorMessage" TEXT,
  "requestPayload" JSONB,
  "responsePayload" JSONB,
  "metadata" JSONB,
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "publish_jobs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "publish_jobs_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "publish_jobs_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "subtitle_settings" (
  "id" TEXT NOT NULL,
  "ownerType" "SubtitleOwnerType" NOT NULL,
  "ownerId" TEXT NOT NULL,
  "videoId" TEXT NOT NULL,
  "sceneId" TEXT,
  "enabled" BOOLEAN NOT NULL,
  "mode" "SubtitleMode" NOT NULL,
  "stylePreset" TEXT NOT NULL,
  "maxWordsPerLine" INTEGER NOT NULL,
  "position" "SubtitlePosition" NOT NULL,
  "highlightKeywords" BOOLEAN NOT NULL DEFAULT true,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "subtitle_settings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "subtitle_settings_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "subtitle_settings_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "scenes"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "activity_logs" (
  "id" TEXT NOT NULL,
  "actorType" "ActivityActorType" NOT NULL,
  "actorId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "entityType" "TrackedEntityType" NOT NULL,
  "entityId" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "version_records" (
  "id" TEXT NOT NULL,
  "entityType" "TrackedEntityType" NOT NULL,
  "entityId" TEXT NOT NULL,
  "versionNumber" INTEGER NOT NULL,
  "sourceAction" TEXT NOT NULL,
  "serializedPayload" TEXT NOT NULL,
  "checksum" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "version_records_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "cost_logs" (
  "id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "category" "CostCategory" NOT NULL,
  "entityType" "TrackedEntityType" NOT NULL,
  "entityId" TEXT NOT NULL,
  "amount" DECIMAL(18, 6) NOT NULL,
  "currency" TEXT NOT NULL,
  "units" TEXT NOT NULL,
  "quantity" DECIMAL(18, 6) NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "cost_logs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "topics_slug_key" ON "topics"("slug");
CREATE UNIQUE INDEX "content_formats_slug_key" ON "content_formats"("slug");
CREATE UNIQUE INDEX "scenes_videoId_sequence_key" ON "scenes"("videoId", "sequence");
CREATE UNIQUE INDEX "assets_sceneId_assetType_versionNumber_key" ON "assets"("sceneId", "assetType", "versionNumber");
CREATE UNIQUE INDEX "voice_jobs_outputAssetId_key" ON "voice_jobs"("outputAssetId");
CREATE UNIQUE INDEX "voice_jobs_scope_scopeRef_attemptNumber_key" ON "voice_jobs"("scope", "scopeRef", "attemptNumber");
CREATE UNIQUE INDEX "render_jobs_outputAssetId_key" ON "render_jobs"("outputAssetId");
CREATE UNIQUE INDEX "render_jobs_videoId_attemptNumber_key" ON "render_jobs"("videoId", "attemptNumber");
CREATE UNIQUE INDEX "publish_jobs_scheduleId_attemptNumber_key" ON "publish_jobs"("scheduleId", "attemptNumber");
CREATE UNIQUE INDEX "subtitle_settings_ownerType_ownerId_key" ON "subtitle_settings"("ownerType", "ownerId");
CREATE UNIQUE INDEX "version_records_entityType_entityId_versionNumber_key" ON "version_records"("entityType", "entityId", "versionNumber");

CREATE INDEX "topics_status_idx" ON "topics"("status");
CREATE INDEX "content_formats_status_idx" ON "content_formats"("status");
CREATE INDEX "ideas_topicId_status_idx" ON "ideas"("topicId", "status");
CREATE INDEX "ideas_contentFormatId_status_idx" ON "ideas"("contentFormatId", "status");
CREATE INDEX "videos_topicId_status_idx" ON "videos"("topicId", "status");
CREATE INDEX "videos_ideaId_status_idx" ON "videos"("ideaId", "status");
CREATE INDEX "videos_contentFormatId_status_idx" ON "videos"("contentFormatId", "status");
CREATE INDEX "videos_status_updatedAt_idx" ON "videos"("status", "updatedAt");
CREATE INDEX "scenes_videoId_status_idx" ON "scenes"("videoId", "status");
CREATE INDEX "scenes_videoId_role_idx" ON "scenes"("videoId", "role");
CREATE INDEX "assets_videoId_assetType_status_idx" ON "assets"("videoId", "assetType", "status");
CREATE INDEX "assets_sceneId_assetType_isActive_idx" ON "assets"("sceneId", "assetType", "isActive");
CREATE INDEX "assets_scope_videoId_idx" ON "assets"("scope", "videoId");
CREATE INDEX "voice_jobs_videoId_status_idx" ON "voice_jobs"("videoId", "status");
CREATE INDEX "voice_jobs_sceneId_status_idx" ON "voice_jobs"("sceneId", "status");
CREATE INDEX "voice_jobs_status_createdAt_idx" ON "voice_jobs"("status", "createdAt");
CREATE INDEX "schedules_status_scheduledFor_idx" ON "schedules"("status", "scheduledFor");
CREATE INDEX "schedules_videoId_channelType_status_idx" ON "schedules"("videoId", "channelType", "status");
CREATE INDEX "schedules_platformSlug_channelSlug_scheduledFor_idx" ON "schedules"("platformSlug", "channelSlug", "scheduledFor");
CREATE INDEX "render_jobs_videoId_status_idx" ON "render_jobs"("videoId", "status");
CREATE INDEX "render_jobs_scheduleId_status_idx" ON "render_jobs"("scheduleId", "status");
CREATE INDEX "render_jobs_status_createdAt_idx" ON "render_jobs"("status", "createdAt");
CREATE INDEX "publish_jobs_videoId_status_idx" ON "publish_jobs"("videoId", "status");
CREATE INDEX "publish_jobs_status_createdAt_idx" ON "publish_jobs"("status", "createdAt");
CREATE INDEX "publish_jobs_channelType_platformSlug_status_idx" ON "publish_jobs"("channelType", "platformSlug", "status");
CREATE INDEX "subtitle_settings_videoId_ownerType_idx" ON "subtitle_settings"("videoId", "ownerType");
CREATE INDEX "subtitle_settings_sceneId_idx" ON "subtitle_settings"("sceneId");
CREATE INDEX "activity_logs_entityType_entityId_createdAt_idx" ON "activity_logs"("entityType", "entityId", "createdAt");
CREATE INDEX "activity_logs_action_createdAt_idx" ON "activity_logs"("action", "createdAt");
CREATE INDEX "version_records_entityType_entityId_createdAt_idx" ON "version_records"("entityType", "entityId", "createdAt");
CREATE INDEX "cost_logs_entityType_entityId_createdAt_idx" ON "cost_logs"("entityType", "entityId", "createdAt");
CREATE INDEX "cost_logs_category_createdAt_idx" ON "cost_logs"("category", "createdAt");
CREATE INDEX "cost_logs_provider_createdAt_idx" ON "cost_logs"("provider", "createdAt");

CREATE UNIQUE INDEX "assets_one_active_image_per_scene_idx"
ON "assets"("sceneId")
WHERE "assetType" = 'IMAGE' AND "isActive" = true;

ALTER TABLE "content_formats"
ADD CONSTRAINT "content_formats_defaultDurationSeconds_check" CHECK ("defaultDurationSeconds" > 0),
ADD CONSTRAINT "content_formats_defaultSceneCount_check" CHECK ("defaultSceneCount" > 0);

ALTER TABLE "videos"
ADD CONSTRAINT "videos_estimatedDurationSeconds_check" CHECK ("estimatedDurationSeconds" > 0);

ALTER TABLE "scenes"
ADD CONSTRAINT "scenes_estimatedDurationSeconds_check" CHECK ("estimatedDurationSeconds" > 0);

ALTER TABLE "assets"
ADD CONSTRAINT "assets_versionNumber_check" CHECK ("versionNumber" > 0),
ADD CONSTRAINT "assets_scope_scene_check" CHECK (
  ("scope" = 'SCENE' AND "sceneId" IS NOT NULL) OR
  ("scope" = 'VIDEO' AND "sceneId" IS NULL)
);

ALTER TABLE "voice_jobs"
ADD CONSTRAINT "voice_jobs_attemptNumber_check" CHECK ("attemptNumber" > 0),
ADD CONSTRAINT "voice_jobs_scope_scene_check" CHECK (
  ("scope" = 'SCENE' AND "sceneId" IS NOT NULL) OR
  ("scope" = 'VIDEO' AND "sceneId" IS NULL)
);

ALTER TABLE "render_jobs"
ADD CONSTRAINT "render_jobs_attemptNumber_check" CHECK ("attemptNumber" > 0);

ALTER TABLE "publish_jobs"
ADD CONSTRAINT "publish_jobs_attemptNumber_check" CHECK ("attemptNumber" > 0);

ALTER TABLE "subtitle_settings"
ADD CONSTRAINT "subtitle_settings_maxWordsPerLine_check" CHECK ("maxWordsPerLine" > 0),
ADD CONSTRAINT "subtitle_settings_owner_scope_check" CHECK (
  ("ownerType" = 'VIDEO' AND "sceneId" IS NULL AND "ownerId" = "videoId") OR
  ("ownerType" = 'SCENE' AND "sceneId" IS NOT NULL AND "ownerId" = "sceneId")
);
