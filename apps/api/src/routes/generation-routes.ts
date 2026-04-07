import type { FastifyInstance } from "fastify";
import type {
  CaptionGenerationService,
  IdeaGenerationService,
  ScriptGenerationService,
  Sprint1Services
} from "@videotik/core";
import { ensureObject, readString } from "./http-utils";

type GenerateIdeaResponse = Awaited<ReturnType<IdeaGenerationService["generateIdea"]>>;
type GenerateScriptResponse = Awaited<ReturnType<ScriptGenerationService["generateScript"]>>;
type GenerateCaptionResponse = Awaited<ReturnType<CaptionGenerationService["generateCaption"]>>;

export const registerGenerationRoutes = (
  app: FastifyInstance,
  services: Sprint1Services
): void => {
  app.post("/ideas/generate", async (request, reply): Promise<GenerateIdeaResponse> => {
    const body = ensureObject(request.body);
    const idea = await services.ideaGenerationService.generateIdea({
      topicId: readString(body, "topicId"),
      contentFormatSlug: readString(body, "contentFormatSlug")
    });

    reply.code(201);
    return idea;
  });

  app.post("/scripts/generate", async (request, reply): Promise<GenerateScriptResponse> => {
    const body = ensureObject(request.body);
    const bundle = await services.scriptGenerationService.generateScript({
      ideaId: readString(body, "ideaId")
    });

    reply.code(201);
    return bundle;
  });

  app.post("/captions/generate", async (request, reply): Promise<GenerateCaptionResponse> => {
    const body = ensureObject(request.body);
    const caption = await services.captionGenerationService.generateCaption({
      scriptId: readString(body, "scriptId")
    });

    reply.code(201);
    return caption;
  });
};
