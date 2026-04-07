-- Align the database back to the Sprint 1 foundation schema.
-- This migration is intentionally reset-style for pre-production use.

DROP TABLE IF EXISTS "publish_jobs" CASCADE;
DROP TABLE IF EXISTS "render_jobs" CASCADE;
DROP TABLE IF EXISTS "voice_jobs" CASCADE;
DROP TABLE IF EXISTS "subtitle_settings" CASCADE;
DROP TABLE IF EXISTS "assets" CASCADE;
DROP TABLE IF EXISTS "schedules" CASCADE;
DROP TABLE IF EXISTS "workflow_job_logs" CASCADE;
DROP TABLE IF EXISTS "workflow_jobs" CASCADE;
DROP TABLE IF EXISTS "captions" CASCADE;
DROP TABLE IF EXISTS "scripts" CASCADE;
DROP TABLE IF EXISTS "scenes" CASCADE;
DROP TABLE IF EXISTS "videos" CASCADE;
DROP TABLE IF EXISTS "ideas" CASCADE;
DROP TABLE IF EXISTS "content_formats" CASCADE;
DROP TABLE IF EXISTS "topics" CASCADE;
DROP TABLE IF EXISTS "activity_logs" CASCADE;
DROP TABLE IF EXISTS "cost_logs" CASCADE;
DROP TABLE IF EXISTS "version_records" CASCADE;

DROP TYPE IF EXISTS "TrackedEntityType" CASCADE;
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

DROP TYPE IF EXISTS "ReferenceEntityType" CASCADE;
DROP TYPE IF EXISTS "WorkflowJobType" CASCADE;
DROP TYPE IF EXISTS "WorkflowJobStatus" CASCADE;
DROP TYPE IF EXISTS "SceneRole" CASCADE;
DROP TYPE IF EXISTS "VideoStatus" CASCADE;
DROP TYPE IF EXISTS "CaptionStatus" CASCADE;
DROP TYPE IF EXISTS "ScriptStatus" CASCADE;
DROP TYPE IF EXISTS "IdeaStatus" CASCADE;
DROP TYPE IF EXISTS "ContentFormatStatus" CASCADE;
DROP TYPE IF EXISTS "TopicStatus" CASCADE;
DROP TYPE IF EXISTS "ActivityActorType" CASCADE;
DROP TYPE IF EXISTS "CostCategory" CASCADE;

CREATE TYPE "TopicStatus" AS ENUM ('ACTIVE', 'ARCHIVED');
CREATE TYPE "ContentFormatStatus" AS ENUM ('ACTIVE', 'DEPRECATED');
CREATE TYPE "IdeaStatus" AS ENUM ('DRAFT', 'APPROVED', 'REJECTED');
CREATE TYPE "ScriptStatus" AS ENUM ('DRAFT', 'READY', 'ARCHIVED');
CREATE TYPE "CaptionStatus" AS ENUM ('DRAFT', 'READY', 'ARCHIVED');
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
CREATE TYPE "ReferenceEntityType" AS ENUM (
  'TOPIC',
  'CONTENT_FORMAT',
  'IDEA',
  'SCRIPT',
  'CAPTION',
  'VIDEO',
  'WORKFLOW_JOB'
);
CREATE TYPE "WorkflowJobType" AS ENUM (
  'IDEA_GENERATION',
  'SCRIPT_GENERATION',
  'CAPTION_GENERATION'
);
CREATE TYPE "WorkflowJobStatus" AS ENUM ('WAITING', 'PROCESSING', 'COMPLETED', 'FAILED', 'RETRYING');
CREATE TYPE "ActivityActorType" AS ENUM ('SYSTEM', 'USER', 'WORKER');
CREATE TYPE "CostCategory" AS ENUM ('TEXT_GENERATION');

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

CREATE TABLE "scripts" (
  "id" TEXT NOT NULL,
  "topicId" TEXT NOT NULL,
  "ideaId" TEXT NOT NULL,
  "contentFormatId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "voiceover" TEXT NOT NULL,
  "sceneBlueprints" JSONB NOT NULL,
  "estimatedDurationSeconds" INTEGER NOT NULL,
  "generationProvider" TEXT NOT NULL,
  "sourceMetadata" JSONB,
  "status" "ScriptStatus" NOT NULL DEFAULT 'READY',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "scripts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "scripts_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "topics"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "scripts_ideaId_fkey" FOREIGN KEY ("ideaId") REFERENCES "ideas"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "scripts_contentFormatId_fkey" FOREIGN KEY ("contentFormatId") REFERENCES "content_formats"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "captions" (
  "id" TEXT NOT NULL,
  "topicId" TEXT NOT NULL,
  "ideaId" TEXT NOT NULL,
  "scriptId" TEXT NOT NULL,
  "contentFormatId" TEXT NOT NULL,
  "shortCaption" TEXT NOT NULL,
  "longCaption" TEXT NOT NULL,
  "hashtags" JSONB NOT NULL,
  "callToAction" TEXT NOT NULL,
  "generationProvider" TEXT NOT NULL,
  "sourceMetadata" JSONB,
  "status" "CaptionStatus" NOT NULL DEFAULT 'READY',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "captions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "captions_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "topics"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "captions_ideaId_fkey" FOREIGN KEY ("ideaId") REFERENCES "ideas"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "captions_scriptId_fkey" FOREIGN KEY ("scriptId") REFERENCES "scripts"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "captions_contentFormatId_fkey" FOREIGN KEY ("contentFormatId") REFERENCES "content_formats"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "videos" (
  "id" TEXT NOT NULL,
  "topicId" TEXT NOT NULL,
  "ideaId" TEXT NOT NULL,
  "scriptId" TEXT NOT NULL,
  "contentFormatId" TEXT NOT NULL,
  "formatSlug" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "status" "VideoStatus" NOT NULL DEFAULT 'SCRIPT_READY',
  "estimatedDurationSeconds" INTEGER NOT NULL,
  "subtitleConfig" JSONB NOT NULL,
  "imageWorkflowConfig" JSONB NOT NULL,
  "voiceoverConfig" JSONB NOT NULL,
  "renderConfig" JSONB NOT NULL,
  "publishingConfig" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "videos_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "videos_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "topics"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "videos_ideaId_fkey" FOREIGN KEY ("ideaId") REFERENCES "ideas"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "videos_scriptId_fkey" FOREIGN KEY ("scriptId") REFERENCES "scripts"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "videos_contentFormatId_fkey" FOREIGN KEY ("contentFormatId") REFERENCES "content_formats"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "scenes" (
  "id" TEXT NOT NULL,
  "videoId" TEXT NOT NULL,
  "scriptId" TEXT,
  "sequence" INTEGER NOT NULL,
  "role" "SceneRole" NOT NULL,
  "narration" TEXT NOT NULL,
  "visualDirection" TEXT NOT NULL,
  "onScreenText" TEXT NOT NULL,
  "estimatedDurationSeconds" INTEGER NOT NULL,
  "subtitleConfig" JSONB,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "scenes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "scenes_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "scenes_scriptId_fkey" FOREIGN KEY ("scriptId") REFERENCES "scripts"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "workflow_jobs" (
  "id" TEXT NOT NULL,
  "type" "WorkflowJobType" NOT NULL,
  "status" "WorkflowJobStatus" NOT NULL DEFAULT 'WAITING',
  "referenceType" "ReferenceEntityType" NOT NULL,
  "referenceId" TEXT NOT NULL,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 3,
  "payload" JSONB,
  "resultMetadata" JSONB,
  "lastError" TEXT,
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "workflow_jobs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "workflow_job_logs" (
  "id" TEXT NOT NULL,
  "workflowJobId" TEXT NOT NULL,
  "level" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "statusSnapshot" "WorkflowJobStatus" NOT NULL,
  "context" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "workflow_job_logs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "workflow_job_logs_workflowJobId_fkey" FOREIGN KEY ("workflowJobId") REFERENCES "workflow_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "activity_logs" (
  "id" TEXT NOT NULL,
  "actorType" "ActivityActorType" NOT NULL,
  "actorId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "referenceType" "ReferenceEntityType" NOT NULL,
  "referenceId" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "cost_logs" (
  "id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "category" "CostCategory" NOT NULL,
  "referenceType" "ReferenceEntityType" NOT NULL,
  "referenceId" TEXT NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "currency" TEXT NOT NULL,
  "units" TEXT NOT NULL,
  "quantity" DOUBLE PRECISION NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "cost_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "version_records" (
  "id" TEXT NOT NULL,
  "referenceType" "ReferenceEntityType" NOT NULL,
  "referenceId" TEXT NOT NULL,
  "versionNumber" INTEGER NOT NULL,
  "sourceAction" TEXT NOT NULL,
  "serializedPayload" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "version_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "topics_slug_key" ON "topics"("slug");
CREATE UNIQUE INDEX "content_formats_slug_key" ON "content_formats"("slug");
CREATE UNIQUE INDEX "scenes_videoId_sequence_key" ON "scenes"("videoId", "sequence");
CREATE UNIQUE INDEX "version_records_referenceType_referenceId_versionNumber_key" ON "version_records"("referenceType", "referenceId", "versionNumber");

CREATE INDEX "topics_status_idx" ON "topics"("status");
CREATE INDEX "content_formats_status_idx" ON "content_formats"("status");
CREATE INDEX "ideas_topicId_status_idx" ON "ideas"("topicId", "status");
CREATE INDEX "ideas_contentFormatId_status_idx" ON "ideas"("contentFormatId", "status");
CREATE INDEX "scripts_topicId_status_idx" ON "scripts"("topicId", "status");
CREATE INDEX "scripts_ideaId_status_idx" ON "scripts"("ideaId", "status");
CREATE INDEX "scripts_contentFormatId_status_idx" ON "scripts"("contentFormatId", "status");
CREATE INDEX "captions_scriptId_status_idx" ON "captions"("scriptId", "status");
CREATE INDEX "captions_ideaId_status_idx" ON "captions"("ideaId", "status");
CREATE INDEX "captions_contentFormatId_status_idx" ON "captions"("contentFormatId", "status");
CREATE INDEX "videos_topicId_status_idx" ON "videos"("topicId", "status");
CREATE INDEX "videos_ideaId_status_idx" ON "videos"("ideaId", "status");
CREATE INDEX "videos_scriptId_idx" ON "videos"("scriptId");
CREATE INDEX "videos_contentFormatId_status_idx" ON "videos"("contentFormatId", "status");
CREATE INDEX "scenes_videoId_role_idx" ON "scenes"("videoId", "role");
CREATE INDEX "workflow_jobs_type_status_idx" ON "workflow_jobs"("type", "status");
CREATE INDEX "workflow_jobs_referenceType_referenceId_idx" ON "workflow_jobs"("referenceType", "referenceId");
CREATE INDEX "workflow_job_logs_workflowJobId_createdAt_idx" ON "workflow_job_logs"("workflowJobId", "createdAt");
CREATE INDEX "activity_logs_referenceType_referenceId_createdAt_idx" ON "activity_logs"("referenceType", "referenceId", "createdAt");
CREATE INDEX "activity_logs_action_createdAt_idx" ON "activity_logs"("action", "createdAt");
CREATE INDEX "cost_logs_referenceType_referenceId_createdAt_idx" ON "cost_logs"("referenceType", "referenceId", "createdAt");
CREATE INDEX "cost_logs_category_createdAt_idx" ON "cost_logs"("category", "createdAt");
CREATE INDEX "version_records_referenceType_referenceId_createdAt_idx" ON "version_records"("referenceType", "referenceId", "createdAt");
