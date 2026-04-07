import type { ContentIdea, IdeaRepository } from "@videotik/core";
import { IdeaStatus as PrismaIdeaStatus, type PrismaClient } from "@prisma/client";
import {
  readMetadataRecord,
  readStringArray,
  toInputJsonValue,
  toNullableJsonValue
} from "./shared-operational-mappers";

const mapIdeaStatusToPrisma = (status: ContentIdea["status"]): PrismaIdeaStatus => {
  switch (status) {
    case "draft":
      return PrismaIdeaStatus.DRAFT;
    case "approved":
      return PrismaIdeaStatus.APPROVED;
    case "rejected":
      return PrismaIdeaStatus.REJECTED;
  }
};

const mapIdeaStatusFromPrisma = (status: PrismaIdeaStatus): ContentIdea["status"] => {
  switch (status) {
    case PrismaIdeaStatus.DRAFT:
      return "draft";
    case PrismaIdeaStatus.APPROVED:
      return "approved";
    case PrismaIdeaStatus.REJECTED:
      return "rejected";
  }
};

const mapPrismaIdeaToDomain = (record: {
  id: string;
  topicId: string;
  contentFormatId: string;
  title: string;
  hook: string;
  angle: string;
  brief: string;
  callToAction: string;
  targetAudience: string;
  keywords: unknown;
  formatRationale: string;
  generationProvider: string;
  sourceMetadata: unknown;
  status: PrismaIdeaStatus;
  createdAt: Date;
  updatedAt: Date;
}): ContentIdea => {
  const idea: ContentIdea = {
    id: record.id,
    topicId: record.topicId,
    contentFormatId: record.contentFormatId,
    title: record.title,
    hook: record.hook,
    angle: record.angle,
    brief: record.brief,
    callToAction: record.callToAction,
    targetAudience: record.targetAudience,
    keywords: readStringArray(record.keywords as never),
    formatRationale: record.formatRationale,
    generationProvider: record.generationProvider as ContentIdea["generationProvider"],
    status: mapIdeaStatusFromPrisma(record.status),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
  const sourceMetadata = readMetadataRecord(record.sourceMetadata as never);

  if (sourceMetadata) {
    idea.sourceMetadata = sourceMetadata;
  }

  return idea;
};

const mapIdeaToPrismaCreateData = (idea: ContentIdea) => {
  return {
    id: idea.id,
    topicId: idea.topicId,
    contentFormatId: idea.contentFormatId,
    title: idea.title,
    hook: idea.hook,
    angle: idea.angle,
    brief: idea.brief,
    callToAction: idea.callToAction,
    targetAudience: idea.targetAudience,
    keywords: toInputJsonValue(idea.keywords),
    formatRationale: idea.formatRationale,
    generationProvider: idea.generationProvider,
    sourceMetadata: toNullableJsonValue(idea.sourceMetadata),
    status: mapIdeaStatusToPrisma(idea.status),
    createdAt: idea.createdAt
  };
};

const mapIdeaToPrismaUpdateData = (idea: ContentIdea) => {
  return {
    topicId: idea.topicId,
    contentFormatId: idea.contentFormatId,
    title: idea.title,
    hook: idea.hook,
    angle: idea.angle,
    brief: idea.brief,
    callToAction: idea.callToAction,
    targetAudience: idea.targetAudience,
    keywords: toInputJsonValue(idea.keywords),
    formatRationale: idea.formatRationale,
    generationProvider: idea.generationProvider,
    sourceMetadata: toNullableJsonValue(idea.sourceMetadata),
    status: mapIdeaStatusToPrisma(idea.status)
  };
};

export class PrismaIdeaRepository implements IdeaRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async save(idea: ContentIdea): Promise<void> {
    await this.prisma.contentIdea.upsert({
      where: {
        id: idea.id
      },
      create: mapIdeaToPrismaCreateData(idea),
      update: mapIdeaToPrismaUpdateData(idea)
    });
  }

  async findById(ideaId: string): Promise<ContentIdea | undefined> {
    const idea = await this.prisma.contentIdea.findUnique({
      where: {
        id: ideaId
      }
    });

    return idea ? mapPrismaIdeaToDomain(idea) : undefined;
  }

  async list(): Promise<ContentIdea[]> {
    const ideas = await this.prisma.contentIdea.findMany({
      orderBy: {
        createdAt: "asc"
      }
    });

    return ideas.map(mapPrismaIdeaToDomain);
  }
}
