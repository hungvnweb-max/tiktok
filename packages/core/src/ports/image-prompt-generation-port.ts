import type { ImageWorkflowMode } from "../domain/common/media";
import type { ImageGenerationProvider } from "../domain/common/providers";
import type { ContentFormat } from "../domain/content-format/content-format";
import type { ContentIdea } from "../domain/idea/idea";
import type { ContentScript } from "../domain/script/script";
import type { Topic } from "../domain/topic/topic";
import type { Video } from "../domain/video/video";

export interface ImagePromptGenerationRequest {
  topic: Topic;
  contentFormat: ContentFormat;
  idea: ContentIdea;
  script: ContentScript;
  video: Video;
}

export interface GeneratedSceneImagePromptPayload {
  sceneId: string;
  sceneOrder: number;
  prompt: string;
  negativePrompt?: string;
  aspectRatio?: "9:16";
  styleSlug: string;
}

export interface GeneratedImagePromptPackPayload {
  workflowMode?: ImageWorkflowMode;
  targetProvider?: ImageGenerationProvider;
  prompts: GeneratedSceneImagePromptPayload[];
}

export interface ImagePromptGenerationPort {
  readonly providerId: ImageGenerationProvider;
  generateImagePromptPack(
    request: ImagePromptGenerationRequest
  ): Promise<GeneratedImagePromptPackPayload>;
}
