import {
  resolveVideoSceneSubtitleConfig,
  type GeneratedImagePromptPackPayload,
  type GeneratedSubtitlePackPayload,
  type ImagePromptGenerationPort,
  type ImagePromptGenerationRequest,
  type SubtitleCompositionPort,
  type SubtitleCompositionRequest
} from "@videotik/core";

const fitWords = (value: string, maxWords: number): string => {
  return value
    .split(/\s+/)
    .filter((part) => part.length > 0)
    .slice(0, maxWords)
    .join(" ");
};

export class TemplateImagePromptGenerationAdapter implements ImagePromptGenerationPort {
  readonly providerId = "template" as const;

  async generateImagePromptPack(
    request: ImagePromptGenerationRequest
  ): Promise<GeneratedImagePromptPackPayload> {
    return {
      workflowMode: request.video.imageWorkflowConfig.mode,
      targetProvider: request.video.imageWorkflowConfig.provider,
      prompts: request.video.scenes.map((scene) => ({
        sceneId: scene.id,
        sceneOrder: scene.order,
        prompt: `Vertical 9:16 TikTok still, ${scene.role} scene, ${scene.visualDirection} Include visual cues for ${fitWords(request.idea.angle, 8)}.`,
        negativePrompt: "blurry, extra limbs, unreadable text, watermark, horizontal framing",
        aspectRatio: "9:16",
        styleSlug: request.video.renderConfig.templateSlug
      }))
    };
  }
}

export class TemplateSubtitleCompositionAdapter implements SubtitleCompositionPort {
  readonly providerId = "template" as const;

  async composeSubtitlePack(
    request: SubtitleCompositionRequest
  ): Promise<GeneratedSubtitlePackPayload> {
    let currentMs = 0;
    const subtitleCues = request.video.scenes.flatMap((scene) => {
      const effectiveSubtitleConfig = resolveVideoSceneSubtitleConfig(request.video, scene);
      const startMs = currentMs;
      const endMs = startMs + scene.estimatedDurationSeconds * 1000;
      currentMs = endMs;

      if (!effectiveSubtitleConfig.enabled) {
        return [];
      }

      return [
        {
          sceneId: scene.id,
          sceneOrder: scene.order,
          mode: effectiveSubtitleConfig.mode,
          text: scene.narration,
          startMs,
          endMs
        }
      ];
    });

    return {
      defaultMode: request.video.subtitleConfig.mode,
      subtitleCues,
      overlayCues: request.video.scenes.map((scene) => ({
        sceneId: scene.id,
        sceneOrder: scene.order,
        text: scene.onScreenText,
        position: request.video.subtitleConfig.position,
        styleSlug: request.video.subtitleConfig.stylePreset
      }))
    };
  }
}
