import type { SubtitleMode } from "../domain/common/media";
import type { SubtitleGenerationProvider } from "../domain/common/providers";
import type { ContentFormat } from "../domain/content-format/content-format";
import type { ContentScript } from "../domain/script/script";
import type { Video } from "../domain/video/video";

export interface SubtitleCompositionRequest {
  contentFormat: ContentFormat;
  script: ContentScript;
  video: Video;
}

export interface GeneratedSubtitleCuePayload {
  sceneId: string;
  sceneOrder: number;
  mode: SubtitleMode;
  text: string;
  startMs: number;
  endMs: number;
}

export interface GeneratedOverlayCuePayload {
  sceneId: string;
  sceneOrder: number;
  text: string;
  position?: "bottom" | "center";
  styleSlug: string;
}

export interface GeneratedSubtitlePackPayload {
  defaultMode: SubtitleMode;
  subtitleCues: GeneratedSubtitleCuePayload[];
  overlayCues: GeneratedOverlayCuePayload[];
}

export interface SubtitleCompositionPort {
  readonly providerId: SubtitleGenerationProvider;
  composeSubtitlePack(
    request: SubtitleCompositionRequest
  ): Promise<GeneratedSubtitlePackPayload>;
}
