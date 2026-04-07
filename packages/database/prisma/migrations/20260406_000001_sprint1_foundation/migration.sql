-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "TopicStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ContentFormatStatus" AS ENUM ('ACTIVE', 'DEPRECATED');

-- CreateEnum
CREATE TYPE "IdeaStatus" AS ENUM ('DRAFT', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ScriptStatus" AS ENUM ('DRAFT', 'READY', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "CaptionStatus" AS ENUM ('DRAFT', 'READY', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "VideoStatus" AS ENUM ('CONCEPT', 'SCRIPTED', 'RENDER_PENDING', 'RENDERED', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "SceneRole" AS ENUM ('HOOK', 'BODY', 'CTA');

-- CreateTable
CREATE TABLE "Topic" (
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

    CONSTRAINT "Topic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentFormat" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "defaultDurationSeconds" INTEGER NOT NULL,
    "defaultSceneCount" INTEGER NOT NULL,
    "promptGuidance" JSONB NOT NULL,
    "structure" JSONB NOT NULL,
    "capabilities" JSONB NOT NULL,
    "status" "ContentFormatStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentFormat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentIdea" (
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

    CONSTRAINT "ContentIdea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentScript" (
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

    CONSTRAINT "ContentScript_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentCaption" (
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

    CONSTRAINT "ContentCaption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Video" (
    "id" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "ideaId" TEXT NOT NULL,
    "scriptId" TEXT NOT NULL,
    "contentFormatId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "VideoStatus" NOT NULL DEFAULT 'SCRIPTED',
    "estimatedDurationSeconds" INTEGER NOT NULL,
    "subtitleConfig" JSONB NOT NULL,
    "voiceoverConfig" JSONB NOT NULL,
    "renderConfig" JSONB NOT NULL,
    "publishingConfig" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Video_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Scene" (
    "id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "scriptId" TEXT,
    "sequence" INTEGER NOT NULL,
    "role" "SceneRole" NOT NULL,
    "narration" TEXT NOT NULL,
    "visualDirection" TEXT NOT NULL,
    "onScreenText" TEXT NOT NULL,
    "estimatedDurationSeconds" INTEGER NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Scene_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Topic_slug_key" ON "Topic"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "ContentFormat_slug_key" ON "ContentFormat"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Scene_videoId_sequence_key" ON "Scene"("videoId", "sequence");

-- AddForeignKey
ALTER TABLE "ContentIdea" ADD CONSTRAINT "ContentIdea_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentIdea" ADD CONSTRAINT "ContentIdea_contentFormatId_fkey" FOREIGN KEY ("contentFormatId") REFERENCES "ContentFormat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentScript" ADD CONSTRAINT "ContentScript_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentScript" ADD CONSTRAINT "ContentScript_ideaId_fkey" FOREIGN KEY ("ideaId") REFERENCES "ContentIdea"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentScript" ADD CONSTRAINT "ContentScript_contentFormatId_fkey" FOREIGN KEY ("contentFormatId") REFERENCES "ContentFormat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentCaption" ADD CONSTRAINT "ContentCaption_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentCaption" ADD CONSTRAINT "ContentCaption_ideaId_fkey" FOREIGN KEY ("ideaId") REFERENCES "ContentIdea"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentCaption" ADD CONSTRAINT "ContentCaption_scriptId_fkey" FOREIGN KEY ("scriptId") REFERENCES "ContentScript"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentCaption" ADD CONSTRAINT "ContentCaption_contentFormatId_fkey" FOREIGN KEY ("contentFormatId") REFERENCES "ContentFormat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Video" ADD CONSTRAINT "Video_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Video" ADD CONSTRAINT "Video_ideaId_fkey" FOREIGN KEY ("ideaId") REFERENCES "ContentIdea"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Video" ADD CONSTRAINT "Video_scriptId_fkey" FOREIGN KEY ("scriptId") REFERENCES "ContentScript"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Video" ADD CONSTRAINT "Video_contentFormatId_fkey" FOREIGN KEY ("contentFormatId") REFERENCES "ContentFormat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scene" ADD CONSTRAINT "Scene_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scene" ADD CONSTRAINT "Scene_scriptId_fkey" FOREIGN KEY ("scriptId") REFERENCES "ContentScript"("id") ON DELETE SET NULL ON UPDATE CASCADE;

