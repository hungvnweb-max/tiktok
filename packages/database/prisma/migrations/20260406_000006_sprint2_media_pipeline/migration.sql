ALTER TYPE "ReferenceEntityType" ADD VALUE IF NOT EXISTS 'IMAGE_PROMPT_PACK';
ALTER TYPE "ReferenceEntityType" ADD VALUE IF NOT EXISTS 'SUBTITLE_PACK';
ALTER TYPE "ReferenceEntityType" ADD VALUE IF NOT EXISTS 'ASSET';
ALTER TYPE "ReferenceEntityType" ADD VALUE IF NOT EXISTS 'VOICE_JOB';
ALTER TYPE "ReferenceEntityType" ADD VALUE IF NOT EXISTS 'PUBLICATION_SCHEDULE';

ALTER TYPE "WorkflowJobType" ADD VALUE IF NOT EXISTS 'IMAGE_PROMPT_GENERATION';
ALTER TYPE "WorkflowJobType" ADD VALUE IF NOT EXISTS 'SUBTITLE_PACK_GENERATION';
ALTER TYPE "WorkflowJobType" ADD VALUE IF NOT EXISTS 'VOICE_GENERATION';

ALTER TYPE "CostCategory" ADD VALUE IF NOT EXISTS 'IMAGE_GENERATION';
ALTER TYPE "CostCategory" ADD VALUE IF NOT EXISTS 'VOICE_GENERATION';
ALTER TYPE "CostCategory" ADD VALUE IF NOT EXISTS 'SUBTITLE_GENERATION';

CREATE TYPE "ImagePromptPackStatus" AS ENUM ('DRAFT', 'READY');
CREATE TYPE "SubtitlePackStatus" AS ENUM ('DRAFT', 'READY');
CREATE TYPE "AssetType" AS ENUM ('IMAGE', 'AUDIO');
CREATE TYPE "AssetRole" AS ENUM ('SCENE_IMAGE', 'SCENE_VOICE');
CREATE TYPE "AssetStatus" AS ENUM ('READY', 'ARCHIVED');
CREATE TYPE "AssetSourceType" AS ENUM ('MANUAL_UPLOAD', 'PROVIDER_GENERATED');
CREATE TYPE "AssetStorageProvider" AS ENUM ('EXTERNAL_URL', 'S3', 'LOCAL');
CREATE TYPE "VoiceJobStatus" AS ENUM ('WAITING', 'PROCESSING', 'COMPLETED', 'FAILED', 'RETRYING');

CREATE TABLE "image_prompt_packs" (
  "id" TEXT NOT NULL,
  "topicId" TEXT NOT NULL,
  "ideaId" TEXT NOT NULL,
  "scriptId" TEXT NOT NULL,
  "videoId" TEXT NOT NULL,
  "contentFormatId" TEXT NOT NULL,
  "workflowMode" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "status" "ImagePromptPackStatus" NOT NULL DEFAULT 'READY',
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "image_prompt_packs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "scene_image_prompts" (
  "id" TEXT NOT NULL,
  "imagePromptPackId" TEXT NOT NULL,
  "sceneId" TEXT NOT NULL,
  "sceneOrder" INTEGER NOT NULL,
  "prompt" TEXT NOT NULL,
  "negativePrompt" TEXT,
  "aspectRatio" TEXT NOT NULL,
  "styleSlug" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "scene_image_prompts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "subtitle_packs" (
  "id" TEXT NOT NULL,
  "videoId" TEXT NOT NULL,
  "scriptId" TEXT NOT NULL,
  "contentFormatId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "defaultMode" TEXT NOT NULL,
  "status" "SubtitlePackStatus" NOT NULL DEFAULT 'READY',
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "subtitle_packs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "subtitle_cues" (
  "id" TEXT NOT NULL,
  "subtitlePackId" TEXT NOT NULL,
  "sceneId" TEXT NOT NULL,
  "sceneOrder" INTEGER NOT NULL,
  "mode" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "startMs" INTEGER NOT NULL,
  "endMs" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "subtitle_cues_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "overlay_cues" (
  "id" TEXT NOT NULL,
  "subtitlePackId" TEXT NOT NULL,
  "sceneId" TEXT NOT NULL,
  "sceneOrder" INTEGER NOT NULL,
  "text" TEXT NOT NULL,
  "position" TEXT NOT NULL,
  "styleSlug" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "overlay_cues_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "assets" (
  "id" TEXT NOT NULL,
  "videoId" TEXT NOT NULL,
  "sceneId" TEXT,
  "type" "AssetType" NOT NULL,
  "role" "AssetRole" NOT NULL,
  "provider" TEXT NOT NULL,
  "sourceType" "AssetSourceType" NOT NULL,
  "status" "AssetStatus" NOT NULL DEFAULT 'READY',
  "versionNumber" INTEGER NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT false,
  "storageProvider" "AssetStorageProvider" NOT NULL,
  "assetUrl" TEXT NOT NULL,
  "storageKey" TEXT,
  "mimeType" TEXT,
  "bytes" INTEGER,
  "width" INTEGER,
  "height" INTEGER,
  "durationSeconds" INTEGER,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "voice_jobs" (
  "id" TEXT NOT NULL,
  "videoId" TEXT NOT NULL,
  "sceneId" TEXT NOT NULL,
  "contentFormatId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "generationMode" TEXT NOT NULL,
  "sourceLine" TEXT NOT NULL,
  "voiceId" TEXT,
  "status" "VoiceJobStatus" NOT NULL DEFAULT 'WAITING',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 3,
  "outputAssetId" TEXT,
  "durationSeconds" INTEGER,
  "lastError" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "voice_jobs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "image_prompt_packs_videoId_key" ON "image_prompt_packs"("videoId");
CREATE UNIQUE INDEX "scene_image_prompts_imagePromptPackId_sceneId_key" ON "scene_image_prompts"("imagePromptPackId", "sceneId");
CREATE UNIQUE INDEX "subtitle_packs_videoId_key" ON "subtitle_packs"("videoId");
CREATE UNIQUE INDEX "subtitle_cues_subtitlePackId_sceneId_key" ON "subtitle_cues"("subtitlePackId", "sceneId");
CREATE UNIQUE INDEX "overlay_cues_subtitlePackId_sceneId_key" ON "overlay_cues"("subtitlePackId", "sceneId");
CREATE UNIQUE INDEX "assets_videoId_sceneId_role_versionNumber_key" ON "assets"("videoId", "sceneId", "role", "versionNumber");
CREATE UNIQUE INDEX "assets_one_active_image_per_scene_idx" ON "assets"("sceneId") WHERE "type" = 'IMAGE' AND "role" = 'SCENE_IMAGE' AND "isActive" = true;

CREATE INDEX "image_prompt_packs_topicId_idx" ON "image_prompt_packs"("topicId");
CREATE INDEX "image_prompt_packs_ideaId_idx" ON "image_prompt_packs"("ideaId");
CREATE INDEX "image_prompt_packs_scriptId_idx" ON "image_prompt_packs"("scriptId");
CREATE INDEX "image_prompt_packs_contentFormatId_idx" ON "image_prompt_packs"("contentFormatId");
CREATE INDEX "scene_image_prompts_sceneId_sceneOrder_idx" ON "scene_image_prompts"("sceneId", "sceneOrder");
CREATE INDEX "subtitle_packs_scriptId_idx" ON "subtitle_packs"("scriptId");
CREATE INDEX "subtitle_packs_contentFormatId_idx" ON "subtitle_packs"("contentFormatId");
CREATE INDEX "subtitle_cues_sceneId_sceneOrder_idx" ON "subtitle_cues"("sceneId", "sceneOrder");
CREATE INDEX "overlay_cues_sceneId_sceneOrder_idx" ON "overlay_cues"("sceneId", "sceneOrder");
CREATE INDEX "assets_videoId_type_role_idx" ON "assets"("videoId", "type", "role");
CREATE INDEX "assets_sceneId_type_role_idx" ON "assets"("sceneId", "type", "role");
CREATE INDEX "voice_jobs_videoId_status_idx" ON "voice_jobs"("videoId", "status");
CREATE INDEX "voice_jobs_sceneId_status_idx" ON "voice_jobs"("sceneId", "status");
CREATE INDEX "voice_jobs_contentFormatId_status_idx" ON "voice_jobs"("contentFormatId", "status");

ALTER TABLE "image_prompt_packs"
  ADD CONSTRAINT "image_prompt_packs_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "topics"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "image_prompt_packs_ideaId_fkey" FOREIGN KEY ("ideaId") REFERENCES "ideas"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "image_prompt_packs_scriptId_fkey" FOREIGN KEY ("scriptId") REFERENCES "scripts"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "image_prompt_packs_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "image_prompt_packs_contentFormatId_fkey" FOREIGN KEY ("contentFormatId") REFERENCES "content_formats"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "scene_image_prompts"
  ADD CONSTRAINT "scene_image_prompts_imagePromptPackId_fkey" FOREIGN KEY ("imagePromptPackId") REFERENCES "image_prompt_packs"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "scene_image_prompts_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "scenes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "subtitle_packs"
  ADD CONSTRAINT "subtitle_packs_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "subtitle_packs_scriptId_fkey" FOREIGN KEY ("scriptId") REFERENCES "scripts"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "subtitle_packs_contentFormatId_fkey" FOREIGN KEY ("contentFormatId") REFERENCES "content_formats"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "subtitle_cues"
  ADD CONSTRAINT "subtitle_cues_subtitlePackId_fkey" FOREIGN KEY ("subtitlePackId") REFERENCES "subtitle_packs"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "subtitle_cues_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "scenes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "overlay_cues"
  ADD CONSTRAINT "overlay_cues_subtitlePackId_fkey" FOREIGN KEY ("subtitlePackId") REFERENCES "subtitle_packs"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "overlay_cues_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "scenes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "assets"
  ADD CONSTRAINT "assets_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "assets_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "scenes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "voice_jobs"
  ADD CONSTRAINT "voice_jobs_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "voice_jobs_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "scenes"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "voice_jobs_contentFormatId_fkey" FOREIGN KEY ("contentFormatId") REFERENCES "content_formats"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "voice_jobs_outputAssetId_fkey" FOREIGN KEY ("outputAssetId") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
