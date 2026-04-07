CREATE TYPE "PublicationScheduleStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'PUBLISHED', 'CANCELED');

CREATE TABLE "publication_schedules" (
    "id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "platformSlug" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "caption" TEXT NOT NULL,
    "hashtags" JSONB NOT NULL,
    "status" "PublicationScheduleStatus" NOT NULL DEFAULT 'SCHEDULED',
    "publishedAt" TIMESTAMP(3),
    "externalPublicationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "publication_schedules_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "publication_schedules_videoId_key" ON "publication_schedules"("videoId");
CREATE INDEX "publication_schedules_scheduledFor_status_idx" ON "publication_schedules"("scheduledFor", "status");
CREATE INDEX "publication_schedules_provider_status_idx" ON "publication_schedules"("provider", "status");

ALTER TABLE "publication_schedules"
ADD CONSTRAINT "publication_schedules_videoId_fkey"
FOREIGN KEY ("videoId") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workflow_jobs"
ADD COLUMN "leaseOwner" TEXT,
ADD COLUMN "leaseToken" TEXT,
ADD COLUMN "leaseExpiresAt" TIMESTAMP(3);

CREATE INDEX "workflow_jobs_leaseExpiresAt_idx" ON "workflow_jobs"("leaseExpiresAt");
CREATE INDEX "workflow_jobs_leaseOwner_leaseExpiresAt_idx" ON "workflow_jobs"("leaseOwner", "leaseExpiresAt");
