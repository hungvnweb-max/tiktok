import type { TextGenerationProvider } from "../domain/common/providers";
import type { ContentFormat } from "../domain/content-format/content-format";
import type { ContentIdea } from "../domain/idea/idea";
import type { ContentScript } from "../domain/script/script";
import type { Topic } from "../domain/topic/topic";
import type { SceneRole } from "../domain/video/scene";

export interface IdeaGenerationRequest {
  topic: Topic;
  contentFormat: ContentFormat;
}

export interface GeneratedIdeaPayload {
  title: string;
  hook: string;
  angle: string;
  brief: string;
  callToAction: string;
  targetAudience: string;
  keywords: string[];
  formatRationale: string;
}

export interface ScriptSceneDraft {
  order: number;
  role: SceneRole;
  narration: string;
  visualDirection: string;
  onScreenText: string;
  estimatedDurationSeconds: number;
}

export interface ScriptGenerationRequest {
  topic: Topic;
  contentFormat: ContentFormat;
  idea: ContentIdea;
}

export interface GeneratedScriptPayload {
  title: string;
  summary: string;
  voiceover: string;
  scenes: ScriptSceneDraft[];
  estimatedDurationSeconds: number;
}

export interface CaptionGenerationRequest {
  topic: Topic;
  contentFormat: ContentFormat;
  idea: ContentIdea;
  script: ContentScript;
}

export interface GeneratedCaptionPayload {
  shortCaption: string;
  longCaption: string;
  hashtags: string[];
  callToAction: string;
}

export interface TextGenerationPort {
  readonly providerId: TextGenerationProvider;
  generateIdea(request: IdeaGenerationRequest): Promise<GeneratedIdeaPayload>;
  generateScript(request: ScriptGenerationRequest): Promise<GeneratedScriptPayload>;
  generateCaption(request: CaptionGenerationRequest): Promise<GeneratedCaptionPayload>;
}
