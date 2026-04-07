import {
  createEntityId,
  dedupeSlugs,
  dedupeStrings,
  ensureNonEmptyString,
  normalizeSlug,
  now,
  type AuditableEntity
} from "../common/entity";

export type TopicStatus = "active" | "archived";

export interface Topic extends AuditableEntity {
  slug: string;
  name: string;
  description: string;
  audience: string;
  contentPillars: string[];
  keywords: string[];
  preferredFormatSlugs: string[];
  status: TopicStatus;
}

export interface CreateTopicInput {
  name: string;
  slug?: string;
  description: string;
  audience: string;
  contentPillars?: string[];
  keywords?: string[];
  preferredFormatSlugs?: string[];
}

export interface UpdateTopicInput {
  name?: string;
  slug?: string;
  description?: string;
  audience?: string;
  contentPillars?: string[];
  keywords?: string[];
  preferredFormatSlugs?: string[];
}

export const createTopic = (input: CreateTopicInput): Topic => {
  const timestamp = now();
  const name = ensureNonEmptyString(input.name, "topic.name");

  return {
    id: createEntityId("topic"),
    slug: normalizeSlug(input.slug ?? name, "topic.slug"),
    name,
    description: ensureNonEmptyString(input.description, "topic.description"),
    audience: ensureNonEmptyString(input.audience, "topic.audience"),
    contentPillars: dedupeStrings(input.contentPillars ?? []),
    keywords: dedupeStrings(input.keywords ?? []),
    preferredFormatSlugs: dedupeSlugs(input.preferredFormatSlugs ?? []),
    status: "active",
    createdAt: timestamp,
    updatedAt: timestamp
  };
};

export const updateTopic = (topic: Topic, input: UpdateTopicInput): Topic => {
  const name = input.name === undefined ? topic.name : ensureNonEmptyString(input.name, "topic.name");

  return {
    ...topic,
    slug: input.slug === undefined ? topic.slug : normalizeSlug(input.slug, "topic.slug"),
    name,
    description:
      input.description === undefined
        ? topic.description
        : ensureNonEmptyString(input.description, "topic.description"),
    audience:
      input.audience === undefined ? topic.audience : ensureNonEmptyString(input.audience, "topic.audience"),
    contentPillars:
      input.contentPillars === undefined ? topic.contentPillars : dedupeStrings(input.contentPillars),
    keywords: input.keywords === undefined ? topic.keywords : dedupeStrings(input.keywords),
    preferredFormatSlugs:
      input.preferredFormatSlugs === undefined
        ? topic.preferredFormatSlugs
        : dedupeSlugs(input.preferredFormatSlugs),
    updatedAt: now()
  };
};

export const archiveTopic = (topic: Topic): Topic => {
  return {
    ...topic,
    status: "archived",
    updatedAt: now()
  };
};
