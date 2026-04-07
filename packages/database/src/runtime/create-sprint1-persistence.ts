import type { Sprint1Repositories } from "@videotik/core";
import { createInMemorySprint1Repositories } from "../in-memory/in-memory-repositories";
import { PrismaActivityLogRepository } from "../prisma/prisma-activity-log-repository";
import { PrismaAssetRepository } from "../prisma/prisma-asset-repository";
import { PrismaCallbackReceiptRepository } from "../prisma/prisma-callback-receipt-repository";
import { createPrismaClient } from "../prisma/client";
import { PrismaContentFormatRepository } from "../prisma/prisma-content-format-repository";
import { PrismaCostRecordRepository } from "../prisma/prisma-cost-record-repository";
import { PrismaImagePromptPackRepository } from "../prisma/prisma-image-prompt-pack-repository";
import { PrismaIdeaRepository } from "../prisma/prisma-idea-repository";
import { PrismaPublishAttemptRepository } from "../prisma/prisma-publish-attempt-repository";
import { PrismaPublicationScheduleRepository } from "../prisma/prisma-publication-schedule-repository";
import { PrismaScriptRepository } from "../prisma/prisma-script-repository";
import { PrismaSubtitlePackRepository } from "../prisma/prisma-subtitle-pack-repository";
import { PrismaTopicRepository } from "../prisma/prisma-topic-repository";
import { PrismaVersionSnapshotRepository } from "../prisma/prisma-version-snapshot-repository";
import { PrismaVideoRepository } from "../prisma/prisma-video-repository";
import { PrismaVoiceJobRepository } from "../prisma/prisma-voice-job-repository";
import { PrismaWorkflowJobLogRepository } from "../prisma/prisma-workflow-job-log-repository";
import { PrismaWorkflowJobRepository } from "../prisma/prisma-workflow-job-repository";
import { seedPrismaContentFormats } from "../prisma/seed";

export type PersistenceMode = "in-memory" | "prisma-hybrid";

export interface Sprint1PersistenceRuntime {
  mode: PersistenceMode;
  repositories: Sprint1Repositories;
  onReady(): Promise<void>;
  onClose(): Promise<void>;
}

export const createSprint1PersistenceRuntime = (): Sprint1PersistenceRuntime => {
  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (!databaseUrl) {
    return {
      mode: "in-memory",
      repositories: createInMemorySprint1Repositories(),
      onReady: async () => {},
      onClose: async () => {}
    };
  }

  const prisma = createPrismaClient();
  const fallbackRepositories = createInMemorySprint1Repositories();
  let isReady = false;

  return {
    mode: "prisma-hybrid",
    repositories: {
      ...fallbackRepositories,
      topicRepository: new PrismaTopicRepository(prisma),
      contentFormatRepository: new PrismaContentFormatRepository(prisma),
      ideaRepository: new PrismaIdeaRepository(prisma),
      scriptRepository: new PrismaScriptRepository(prisma),
      videoRepository: new PrismaVideoRepository(prisma),
      assetRepository: new PrismaAssetRepository(prisma),
      imagePromptPackRepository: new PrismaImagePromptPackRepository(prisma),
      subtitlePackRepository: new PrismaSubtitlePackRepository(prisma),
      publicationScheduleRepository: new PrismaPublicationScheduleRepository(prisma),
      publishAttemptRepository: new PrismaPublishAttemptRepository(prisma),
      workflowJobRepository: new PrismaWorkflowJobRepository(prisma),
      workflowJobLogRepository: new PrismaWorkflowJobLogRepository(prisma),
      voiceJobRepository: new PrismaVoiceJobRepository(prisma),
      activityLogRepository: new PrismaActivityLogRepository(prisma),
      costRecordRepository: new PrismaCostRecordRepository(prisma),
      versionSnapshotRepository: new PrismaVersionSnapshotRepository(prisma),
      callbackReceiptRepository: new PrismaCallbackReceiptRepository(prisma)
    },
    onReady: async () => {
      if (isReady) {
        return;
      }

      await prisma.$connect();
      await seedPrismaContentFormats(prisma);
      isReady = true;
    },
    onClose: async () => {
      await prisma.$disconnect();
      isReady = false;
    }
  };
};
