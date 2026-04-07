-- CreateEnum
CREATE TYPE "ReferenceEntityType" AS ENUM ('TOPIC', 'CONTENT_FORMAT', 'IDEA', 'SCRIPT', 'CAPTION', 'VIDEO', 'IMAGE_PROMPT_PACK', 'SUBTITLE_PACK', 'PUBLICATION_SCHEDULE', 'WORKFLOW_JOB');

-- CreateEnum
CREATE TYPE "WorkflowJobType" AS ENUM ('IDEA_GENERATION', 'SCRIPT_GENERATION', 'CAPTION_GENERATION', 'IMAGE_PROMPT_GENERATION', 'SUBTITLE_PACK_GENERATION', 'VOICE_GENERATION', 'RENDER', 'PUBLISH');

-- CreateEnum
CREATE TYPE "WorkflowJobStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'RETRY_SCHEDULED', 'FAILED', 'CANCELED');

-- CreateEnum
CREATE TYPE "ImagePromptPackStatus" AS ENUM ('DRAFT', 'READY');

-- CreateEnum
CREATE TYPE "SubtitlePackStatus" AS ENUM ('DRAFT', 'READY');

-- CreateEnum
CREATE TYPE "PublicationScheduleStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'PUBLISHED', 'CANCELED');

-- CreateEnum
CREATE TYPE "ActivityActorType" AS ENUM ('SYSTEM', 'USER', 'WORKER');

-- CreateEnum
CREATE TYPE "CostCategory" AS ENUM ('TEXT_GENERATION', 'IMAGE_GENERATION', 'VOICE_GENERATION', 'SUBTITLE_GENERATION', 'RENDER', 'PUBLISHING');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "SceneRole" ADD VALUE 'SETUP';
ALTER TYPE "SceneRole" ADD VALUE 'PROOF';
ALTER TYPE "SceneRole" ADD VALUE 'TWIST';
ALTER TYPE "SceneRole" ADD VALUE 'PAYOFF';

-- AlterTable
ALTER TABLE "ContentFormat" ADD COLUMN     "deliveryOptions" JSONB;

-- AlterTable
ALTER TABLE "Video" ADD COLUMN     "formatSlug" TEXT;

-- Backfill content format delivery options for existing rows before enforcing NOT NULL.
UPDATE "ContentFormat"
SET "deliveryOptions" = CASE
    WHEN "slug" = 'quick_tip' THEN '{
      "subtitleModeSlugs":["phrase_highlight","karaoke_word"],
      "templateSlugs":["clean_vertical","kinetic_cards"],
      "imageProviderSlugs":["banana","template"],
      "voiceProviderSlugs":["elevenlabs","none"],
      "publishingPlatformSlugs":["tiktok"]
    }'::jsonb
    ELSE '{
      "subtitleModeSlugs":["phrase_highlight"],
      "templateSlugs":["clean_vertical"],
      "imageProviderSlugs":["template"],
      "voiceProviderSlugs":["none"],
      "publishingPlatformSlugs":["tiktok"]
    }'::jsonb
END
WHERE "deliveryOptions" IS NULL;

ALTER TABLE "ContentFormat"
ALTER COLUMN "deliveryOptions" SET NOT NULL;

-- Backfill video formatSlug from the related content format slug before enforcing NOT NULL.
UPDATE "Video" AS v
SET "formatSlug" = cf."slug"
FROM "ContentFormat" AS cf
WHERE v."contentFormatId" = cf."id"
  AND v."formatSlug" IS NULL;

ALTER TABLE "Video"
ALTER COLUMN "formatSlug" SET NOT NULL;

-- CreateTable
CREATE TABLE "ImagePromptPack" (
    "id" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "ideaId" TEXT NOT NULL,
    "scriptId" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "contentFormatId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" "ImagePromptPackStatus" NOT NULL DEFAULT 'READY',
    "prompts" JSONB NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImagePromptPack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubtitlePack" (
    "id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "scriptId" TEXT NOT NULL,
    "contentFormatId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "modeSlug" TEXT NOT NULL,
    "status" "SubtitlePackStatus" NOT NULL DEFAULT 'READY',
    "subtitleCues" JSONB NOT NULL,
    "overlayCues" JSONB NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubtitlePack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublicationSchedule" (
    "id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "platformSlug" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "caption" TEXT NOT NULL,
    "hashtags" JSONB NOT NULL,
    "status" "PublicationScheduleStatus" NOT NULL DEFAULT 'SCHEDULED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PublicationSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowJob" (
    "id" TEXT NOT NULL,
    "type" "WorkflowJobType" NOT NULL,
    "status" "WorkflowJobStatus" NOT NULL DEFAULT 'PENDING',
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

    CONSTRAINT "WorkflowJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowJobLog" (
    "id" TEXT NOT NULL,
    "workflowJobId" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "statusSnapshot" "WorkflowJobStatus" NOT NULL,
    "context" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowJobLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityLog" (
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

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostRecord" (
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

    CONSTRAINT "CostRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VersionSnapshot" (
    "id" TEXT NOT NULL,
    "referenceType" "ReferenceEntityType" NOT NULL,
    "referenceId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "sourceAction" TEXT NOT NULL,
    "serializedPayload" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VersionSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ImagePromptPack_videoId_key" ON "ImagePromptPack"("videoId");

-- CreateIndex
CREATE UNIQUE INDEX "SubtitlePack_videoId_key" ON "SubtitlePack"("videoId");

-- CreateIndex
CREATE UNIQUE INDEX "PublicationSchedule_videoId_key" ON "PublicationSchedule"("videoId");

-- CreateIndex
CREATE UNIQUE INDEX "VersionSnapshot_referenceType_referenceId_versionNumber_key" ON "VersionSnapshot"("referenceType", "referenceId", "versionNumber");

-- AddForeignKey
ALTER TABLE "ImagePromptPack" ADD CONSTRAINT "ImagePromptPack_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImagePromptPack" ADD CONSTRAINT "ImagePromptPack_ideaId_fkey" FOREIGN KEY ("ideaId") REFERENCES "ContentIdea"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImagePromptPack" ADD CONSTRAINT "ImagePromptPack_scriptId_fkey" FOREIGN KEY ("scriptId") REFERENCES "ContentScript"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImagePromptPack" ADD CONSTRAINT "ImagePromptPack_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImagePromptPack" ADD CONSTRAINT "ImagePromptPack_contentFormatId_fkey" FOREIGN KEY ("contentFormatId") REFERENCES "ContentFormat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubtitlePack" ADD CONSTRAINT "SubtitlePack_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubtitlePack" ADD CONSTRAINT "SubtitlePack_scriptId_fkey" FOREIGN KEY ("scriptId") REFERENCES "ContentScript"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubtitlePack" ADD CONSTRAINT "SubtitlePack_contentFormatId_fkey" FOREIGN KEY ("contentFormatId") REFERENCES "ContentFormat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicationSchedule" ADD CONSTRAINT "PublicationSchedule_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowJobLog" ADD CONSTRAINT "WorkflowJobLog_workflowJobId_fkey" FOREIGN KEY ("workflowJobId") REFERENCES "WorkflowJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

