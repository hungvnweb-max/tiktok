import type { FastifyInstance } from "fastify";
import type { ContentFormat, Sprint1Services } from "@videotik/core";
import type { ApiListResponse } from "./api-contracts";

export const registerFormatRoutes = (app: FastifyInstance, services: Sprint1Services): void => {
  app.get("/formats", async (): Promise<ApiListResponse<ContentFormat>> => {
    const items = await services.contentFormatService.listFormats();

    return {
      items
    };
  });
};
