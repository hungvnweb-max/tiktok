import type { ContentFormat, ContentFormatRepository } from "@videotik/core";
import type { PrismaClient } from "@prisma/client";
import {
  mapContentFormatToPrismaCreateData,
  mapContentFormatToPrismaUpdateData,
  mapPrismaContentFormatToDomain
} from "./mappers";

export class PrismaContentFormatRepository implements ContentFormatRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async save(contentFormat: ContentFormat): Promise<void> {
    await this.prisma.contentFormat.upsert({
      where: {
        slug: contentFormat.slug
      },
      create: mapContentFormatToPrismaCreateData(contentFormat),
      update: mapContentFormatToPrismaUpdateData(contentFormat)
    });
  }

  async findById(contentFormatId: string): Promise<ContentFormat | undefined> {
    const contentFormat = await this.prisma.contentFormat.findUnique({
      where: {
        id: contentFormatId
      }
    });

    return contentFormat ? mapPrismaContentFormatToDomain(contentFormat) : undefined;
  }

  async findBySlug(slug: string): Promise<ContentFormat | undefined> {
    const contentFormat = await this.prisma.contentFormat.findUnique({
      where: {
        slug
      }
    });

    return contentFormat ? mapPrismaContentFormatToDomain(contentFormat) : undefined;
  }

  async list(): Promise<ContentFormat[]> {
    const contentFormats = await this.prisma.contentFormat.findMany({
      orderBy: {
        createdAt: "asc"
      }
    });

    return contentFormats.map(mapPrismaContentFormatToDomain);
  }
}
