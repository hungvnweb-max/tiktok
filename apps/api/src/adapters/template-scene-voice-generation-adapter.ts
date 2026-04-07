import {
  type GeneratedSceneVoicePayload,
  type SceneVoiceGenerationPort,
  type SceneVoiceGenerationRequest
} from "@videotik/core";

const slugify = (value: string): string => {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
};

export class TemplateSceneVoiceGenerationAdapter implements SceneVoiceGenerationPort {
  readonly providerId = "elevenlabs" as const;

  async generateSceneVoice(
    request: SceneVoiceGenerationRequest
  ): Promise<GeneratedSceneVoicePayload> {
    const voiceSlug = slugify(request.voiceoverConfig.voiceId ?? "default-voice");
    const storageKey = `videos/${request.video.id}/scenes/${request.scene.id}/voice-${voiceSlug}.mp3`;

    return {
      sceneId: request.scene.id,
      assetUrl: `local:///${storageKey}`,
      durationSeconds: request.scene.estimatedDurationSeconds,
      storageProvider: "local",
      storageKey,
      mimeType: "audio/mpeg",
      metadata: {
        provider: this.providerId,
        sceneOrder: request.scene.order,
        voiceId: request.voiceoverConfig.voiceId ?? null,
        generationMode: request.voiceoverConfig.generationMode,
        sourceLine: request.scene.narration
      }
    };
  }
}
