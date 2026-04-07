CREATE TYPE "PublishAttemptStatus" AS ENUM (
    'PENDING',
    'PROCESSING',
    'RETRYING',
    'MANUAL_ACTION_REQUIRED',
    'SUBMITTED',
    'PUBLISHED',
    'FAILED'
);

CREATE TYPE "PublishFailureStage" AS ENUM (
    'VALIDATION',
    'PROVIDER_EXECUTION',
    'WORKFLOW'
);

CREATE TABLE "publish_attempts" (
    "id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "publicationScheduleId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "platformSlug" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "sequenceNumber" INTEGER NOT NULL,
    "status" "PublishAttemptStatus" NOT NULL DEFAULT 'PENDING',
    "workflowAttemptCount" INTEGER NOT NULL DEFAULT 0,
    "maxWorkflowAttempts" INTEGER NOT NULL DEFAULT 3,
    "workflowJobId" TEXT,
    "providerStatus" TEXT,
    "providerPublicationId" TEXT,
    "externalUrl" TEXT,
    "checklist" JSONB NOT NULL,
    "validationIssues" JSONB NOT NULL,
    "lastError" TEXT,
    "failureStage" "PublishFailureStage",
    "publishedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "publish_attempts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "publish_attempts_videoId_sequenceNumber_key" ON "publish_attempts"("videoId", "sequenceNumber");
CREATE INDEX "publish_attempts_videoId_createdAt_idx" ON "publish_attempts"("videoId", "createdAt");
CREATE INDEX "publish_attempts_publicationScheduleId_createdAt_idx" ON "publish_attempts"("publicationScheduleId", "createdAt");
CREATE INDEX "publish_attempts_status_createdAt_idx" ON "publish_attempts"("status", "createdAt");
CREATE INDEX "publish_attempts_workflowJobId_idx" ON "publish_attempts"("workflowJobId");

ALTER TABLE "publish_attempts"
ADD CONSTRAINT "publish_attempts_videoId_fkey"
FOREIGN KEY ("videoId") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "publish_attempts"
ADD CONSTRAINT "publish_attempts_publicationScheduleId_fkey"
FOREIGN KEY ("publicationScheduleId") REFERENCES "publication_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "publish_attempts"
ADD CONSTRAINT "publish_attempts_workflowJobId_fkey"
FOREIGN KEY ("workflowJobId") REFERENCES "workflow_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
