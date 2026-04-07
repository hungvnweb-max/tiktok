import type { AssetStorageProvider } from "../domain/asset/asset";
import type { MetadataRecord } from "../domain/common/entity";
import type { VoiceoverConfig } from "../domain/common/media";
import type { VoiceoverProvider } from "../domain/common/providers";
import type { ContentFormat } from "../domain/content-format/content-format";
import type { ContentScript } from "../domain/script/script";
import type { SceneDirection } from "../domain/video/scene";
import type { Video } from "../domain/video/video";

export interface SceneVoiceGenerationRequest {
  contentFormat: ContentFormat;
  script: ContentScript;
  video: Video;
  scene: SceneDirection;
  voiceoverConfig: VoiceoverConfig;
}

export interface GeneratedSceneVoicePayload {
  sceneId: string;
  assetUrl: string;
  durationSeconds: number;
  storageProvider?: AssetStorageProvider;
  storageKey?: string;
  mimeType?: string;
  metadata?: MetadataRecord;
}

export interface SceneVoiceGenerationPort {
  readonly providerId: Exclude<VoiceoverProvider, "none">;
  generateSceneVoice(
    request: SceneVoiceGenerationRequest
  ): Promise<GeneratedSceneVoicePayload>;
}
