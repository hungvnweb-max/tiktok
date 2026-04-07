import {
  createEntityId,
  dedupeStrings,
  ensureNonEmptyString,
  now,
  type AuditableEntity,
  type MetadataRecord
} from "../common/entity";
import type { TextGenerationProvider } from "../common/providers";

export type CaptionStatus = "draft" | "ready" | "archived";

export interface ContentCaption extends AuditableEntity {
  topicId: string;
  ideaId: string;
  scriptId: string;
  contentFormatId: string;
  shortCaption: string;
  longCaption: string;
  hashtags: string[];
  callToAction: string;
  generationProvider: TextGenerationProvider;
  sourceMetadata?: MetadataRecord;
  status: CaptionStatus;
}

export interface CreateContentCaptionInput {
  topicId: string;
  ideaId: string;
  scriptId: string;
  contentFormatId: string;
  shortCaption: string;
  longCaption: string;
  hashtags: string[];
  callToAction: string;
  generationProvider: TextGenerationProvider;
  sourceMetadata?: MetadataRecord;
}

const normalizeHashtag = (value: string): string => {
  const hashtag = value
    .trim()
    .replace(/^#+/, "")
    .replace(/[^a-zA-Z0-9_]+/g, "")
    .toLowerCase();

  if (!hashtag) {
    return "";
  }

  return `#${hashtag}`;
};

export const createContentCaption = (input: CreateContentCaptionInput): ContentCaption => {
  const timestamp = now();
  const hashtags = dedupeStrings(input.hashtags.map((hashtag) => normalizeHashtag(hashtag))).filter(
    (hashtag) => hashtag.length > 0
  );

  return {
    id: createEntityId("caption"),
    topicId: input.topicId,
    ideaId: input.ideaId,
    scriptId: input.scriptId,
    contentFormatId: input.contentFormatId,
    shortCaption: ensureNonEmptyString(input.shortCaption, "caption.shortCaption"),
    longCaption: ensureNonEmptyString(input.longCaption, "caption.longCaption"),
    hashtags,
    callToAction: ensureNonEmptyString(input.callToAction, "caption.callToAction"),
    generationProvider: input.generationProvider,
    status: "ready",
    createdAt: timestamp,
    updatedAt: timestamp,
    ...(input.sourceMetadata ? { sourceMetadata: input.sourceMetadata } : {})
  };
};
