import type { Topic, TopicRepository } from "@videotik/core";
import type { PrismaClient } from "@prisma/client";
import {
  mapPrismaTopicToDomain,
  mapTopicToPrismaCreateData,
  mapTopicToPrismaUpdateData
} from "./mappers";

export class PrismaTopicRepository implements TopicRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async save(topic: Topic): Promise<void> {
    await this.prisma.topic.upsert({
      where: {
        id: topic.id
      },
      create: mapTopicToPrismaCreateData(topic),
      update: mapTopicToPrismaUpdateData(topic)
    });
  }

  async findById(topicId: string): Promise<Topic | undefined> {
    const topic = await this.prisma.topic.findUnique({
      where: {
        id: topicId
      }
    });

    return topic ? mapPrismaTopicToDomain(topic) : undefined;
  }

  async findBySlug(slug: string): Promise<Topic | undefined> {
    const topic = await this.prisma.topic.findUnique({
      where: {
        slug
      }
    });

    return topic ? mapPrismaTopicToDomain(topic) : undefined;
  }

  async list(): Promise<Topic[]> {
    const topics = await this.prisma.topic.findMany({
      orderBy: {
        createdAt: "asc"
      }
    });

    return topics.map(mapPrismaTopicToDomain);
  }
}
