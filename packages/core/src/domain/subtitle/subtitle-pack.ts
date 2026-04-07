import {
  DomainError,
  createEntityId,
  ensureNonEmptyString,
  ensurePositiveInteger,
  now,
  type AuditableEntity,
  type MetadataRecord
} from "../common/entity";
import {
  normalizeSubtitleMode,
  type SubtitleMode
} from "../common/media";
import type { SubtitleGenerationProvider } from "../common/providers";

export type SubtitlePackStatus = "draft" | "ready";
export type OverlayPosition = "bottom" | "center";

export interface SubtitleCue extends AuditableEntity {
  sceneId: string;
  sceneOrder: number;
  mode: SubtitleMode;
  text: string;
  startMs: number;
  endMs: number;
}

export interface OverlayCue extends AuditableEntity {
  sceneId: string;
  sceneOrder: number;
  text: string;
  position: OverlayPosition;
  styleSlug: string;
}

export interface SubtitlePack extends AuditableEntity {
  videoId: string;
  scriptId: string;
  contentFormatId: string;
  provider: SubtitleGenerationProvider;
  defaultMode: SubtitleMode;
  status: SubtitlePackStatus;
  subtitleCues: SubtitleCue[];
  overlayCues: OverlayCue[];
  metadata?: MetadataRecord;
}

export interface CreateSubtitleCueInput {
  sceneId: string;
  sceneOrder: number;
  mode: SubtitleMode;
  text: string;
  startMs: number;
  endMs: number;
}

export interface CreateOverlayCueInput {
  sceneId: string;
  sceneOrder: number;
  text: string;
  position?: OverlayPosition;
  styleSlug: string;
}

export interface CreateSubtitlePackInput {
  videoId: string;
  scriptId: string;
  contentFormatId: string;
  provider: SubtitleGenerationProvider;
  defaultMode: SubtitleMode;
  subtitleCues: CreateSubtitleCueInput[];
  overlayCues: CreateOverlayCueInput[];
  metadata?: MetadataRecord;
}

const createSubtitleCue = (input: CreateSubtitleCueInput): SubtitleCue => {
  const timestamp = now();

  if (input.startMs < 0 || input.endMs <= input.startMs) {
    throw new DomainError("subtitleCue timing must be non-negative and end after start.");
  }

  return {
    id: createEntityId("subtitlecue"),
    sceneId: ensureNonEmptyString(input.sceneId, "subtitleCue.sceneId"),
    sceneOrder: ensurePositiveInteger(input.sceneOrder, "subtitleCue.sceneOrder"),
    mode: normalizeSubtitleMode(input.mode, "subtitleCue.mode"),
    text: ensureNonEmptyString(input.text, "subtitleCue.text"),
    startMs: input.startMs,
    endMs: input.endMs,
    createdAt: timestamp,
    updatedAt: timestamp
  };
};

const createOverlayCue = (input: CreateOverlayCueInput): OverlayCue => {
  const timestamp = now();

  return {
    id: createEntityId("overlaycue"),
    sceneId: ensureNonEmptyString(input.sceneId, "overlayCue.sceneId"),
    sceneOrder: ensurePositiveInteger(input.sceneOrder, "overlayCue.sceneOrder"),
    text: ensureNonEmptyString(input.text, "overlayCue.text"),
    position: input.position ?? "bottom",
    styleSlug: ensureNonEmptyString(input.styleSlug, "overlayCue.styleSlug"),
    createdAt: timestamp,
    updatedAt: timestamp
  };
};

export const createSubtitlePack = (input: CreateSubtitlePackInput): SubtitlePack => {
  const timestamp = now();
  const subtitleCues = input.subtitleCues.map((item) => createSubtitleCue(item));
  const overlayCues = input.overlayCues.map((item) => createOverlayCue(item));

  const defaultMode = normalizeSubtitleMode(input.defaultMode, "subtitlePack.defaultMode");

  if (defaultMode !== "off" && subtitleCues.length === 0) {
    throw new DomainError("subtitlePack.subtitleCues must contain at least one cue when subtitles are enabled.");
  }

  if (overlayCues.length === 0) {
    throw new DomainError("subtitlePack.overlayCues must contain at least one cue.");
  }

  return {
    id: createEntityId("subtitlepack"),
    videoId: input.videoId,
    scriptId: input.scriptId,
    contentFormatId: input.contentFormatId,
    provider: input.provider,
    defaultMode,
    status: "ready",
    subtitleCues,
    overlayCues,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...(input.metadata ? { metadata: input.metadata } : {})
  };
};
