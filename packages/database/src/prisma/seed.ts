import type { ContentFormat } from "@videotik/core";
import type { PrismaClient } from "@prisma/client";
import {
  mapContentFormatToPrismaCreateData,
  mapContentFormatToPrismaUpdateData
} from "./mappers";
import { seedContentFormats } from "../seeds/content-formats";

export const seedPrismaContentFormats = async (
  prisma: PrismaClient,
  contentFormats: ContentFormat[] = seedContentFormats
): Promise<void> => {
  for (const contentFormat of contentFormats) {
    await prisma.contentFormat.upsert({
      where: {
        slug: contentFormat.slug
      },
      create: mapContentFormatToPrismaCreateData(contentFormat),
      update: mapContentFormatToPrismaUpdateData(contentFormat)
    });
  }
};
