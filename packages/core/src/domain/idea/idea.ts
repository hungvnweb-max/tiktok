import {
  createEntityId,
  dedupeStrings,
  ensureNonEmptyString,
  now,
  type AuditableEntity,
  type MetadataRecord
} from "../common/entity";
import type { TextGenerationProvider } from "../common/providers";

export type IdeaStatus = "draft" | "approved" | "rejected";

export interface ContentIdea extends AuditableEntity {
  topicId: string;
  contentFormatId: string;
  title: string;
  hook: string;
  angle: string;
  brief: string;
  callToAction: string;
  targetAudience: string;
  keywords: string[];
  formatRationale: string;
  generationProvider: TextGenerationProvider;
  sourceMetadata?: MetadataRecord;
  status: IdeaStatus;
}

export interface CreateContentIdeaInput {
  topicId: string;
  contentFormatId: string;
  title: string;
  hook: string;
  angle: string;
  brief: string;
  callToAction: string;
  targetAudience: string;
  keywords: string[];
  formatRationale: string;
  generationProvider: TextGenerationProvider;
  sourceMetadata?: MetadataRecord;
}

export const createContentIdea = (input: CreateContentIdeaInput): ContentIdea => {
  const timestamp = now();

  return {
    id: createEntityId("idea"),
    topicId: input.topicId,
    contentFormatId: input.contentFormatId,
    title: ensureNonEmptyString(input.title, "idea.title"),
    hook: ensureNonEmptyString(input.hook, "idea.hook"),
    angle: ensureNonEmptyString(input.angle, "idea.angle"),
    brief: ensureNonEmptyString(input.brief, "idea.brief"),
    callToAction: ensureNonEmptyString(input.callToAction, "idea.callToAction"),
    targetAudience: ensureNonEmptyString(input.targetAudience, "idea.targetAudience"),
    keywords: dedupeStrings(input.keywords),
    formatRationale: ensureNonEmptyString(input.formatRationale, "idea.formatRationale"),
    generationProvider: input.generationProvider,
    status: "draft",
    createdAt: timestamp,
    updatedAt: timestamp,
    ...(input.sourceMetadata ? { sourceMetadata: input.sourceMetadata } : {})
  };
};
