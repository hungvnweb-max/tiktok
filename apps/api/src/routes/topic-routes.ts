import type {
  CreateTopicInput,
  Sprint1Services,
  Topic,
  UpdateTopicInput
} from "@videotik/core";
import type { FastifyInstance } from "fastify";
import type { ApiListResponse } from "./api-contracts";
import { ensureObject, readOptionalString, readOptionalStringArray, readString } from "./http-utils";

export const registerTopicRoutes = (app: FastifyInstance, services: Sprint1Services): void => {
  app.get("/topics", async (): Promise<ApiListResponse<Topic>> => {
    const items = await services.topicService.listTopics();

    return {
      items
    };
  });

  app.post("/topics", async (request, reply): Promise<Topic> => {
    const body = ensureObject(request.body);
    const slug = readOptionalString(body, "slug");
    const contentPillars = readOptionalStringArray(body, "contentPillars");
    const keywords = readOptionalStringArray(body, "keywords");
    const preferredFormatSlugs = readOptionalStringArray(body, "preferredFormatSlugs");
    const topicInput: CreateTopicInput = {
      name: readString(body, "name"),
      description: readString(body, "description"),
      audience: readString(body, "audience")
    };

    if (slug) {
      topicInput.slug = slug;
    }

    if (contentPillars) {
      topicInput.contentPillars = contentPillars;
    }

    if (keywords) {
      topicInput.keywords = keywords;
    }

    if (preferredFormatSlugs) {
      topicInput.preferredFormatSlugs = preferredFormatSlugs;
    }

    const topic = await services.topicService.createTopic(topicInput);

    reply.code(201);
    return topic;
  });

  app.patch<{ Params: { topicId: string } }>("/topics/:topicId", async (request): Promise<Topic> => {
    const body = ensureObject(request.body);
    const name = readOptionalString(body, "name");
    const slug = readOptionalString(body, "slug");
    const description = readOptionalString(body, "description");
    const audience = readOptionalString(body, "audience");
    const contentPillars = readOptionalStringArray(body, "contentPillars");
    const keywords = readOptionalStringArray(body, "keywords");
    const preferredFormatSlugs = readOptionalStringArray(body, "preferredFormatSlugs");
    const updateInput: UpdateTopicInput = {};

    if (name) {
      updateInput.name = name;
    }

    if (slug) {
      updateInput.slug = slug;
    }

    if (description) {
      updateInput.description = description;
    }

    if (audience) {
      updateInput.audience = audience;
    }

    if (contentPillars) {
      updateInput.contentPillars = contentPillars;
    }

    if (keywords) {
      updateInput.keywords = keywords;
    }

    if (preferredFormatSlugs) {
      updateInput.preferredFormatSlugs = preferredFormatSlugs;
    }

    return services.topicService.updateTopic(request.params.topicId, updateInput);
  });

  app.post<{ Params: { topicId: string } }>("/topics/:topicId/archive", async (request): Promise<Topic> => {
    return services.topicService.archiveTopic(request.params.topicId);
  });
};
