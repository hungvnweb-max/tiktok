import type { ContentScript } from "../domain/script/script";
import type { VoiceoverConfig } from "../domain/common/media";

export interface VoiceSynthesisRequest {
  script: ContentScript;
  voiceoverConfig: VoiceoverConfig;
}

export interface VoiceSynthesisResult {
  assetUrl: string;
  durationSeconds: number;
}

export interface VoiceSynthesisPort {
  readonly providerId: string;
  synthesize(request: VoiceSynthesisRequest): Promise<VoiceSynthesisResult>;
}
