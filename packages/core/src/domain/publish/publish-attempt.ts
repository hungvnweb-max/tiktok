import {
  DomainError,
  createEntityId,
  ensureNonEmptyString,
  ensurePositiveInteger,
  now,
  type AuditableEntity,
  type MetadataRecord
} from "../common/entity";
import type { PublishMode } from "../common/media";
import type { PublishingProvider } from "../common/providers";

export type PublishAttemptStatus =
  | "pending"
  | "processing"
  | "retrying"
  | "manual_action_required"
  | "submitted"
  | "published"
  | "failed";

export type PublishFailureStage = "validation" | "provider_execution" | "workflow";

export interface PublishAttempt extends AuditableEntity {
  videoId: string;
  publicationScheduleId: string;
  provider: PublishingProvider;
  platformSlug: string;
  mode: PublishMode;
  sequenceNumber: number;
  status: PublishAttemptStatus;
  workflowAttemptCount: number;
  maxWorkflowAttempts: number;
  workflowJobId?: string;
  providerStatus?: string;
  providerPublicationId?: string;
  externalUrl?: string;
  checklist: string[];
  validationIssues: string[];
  lastError?: string;
  failureStage?: PublishFailureStage;
  publishedAt?: Date;
  startedAt?: Date;
  completedAt?: Date;
  metadata?: MetadataRecord;
}

export interface CreatePublishAttemptInput {
  videoId: string;
  publicationScheduleId: string;
  provider: PublishingProvider;
  platformSlug: string;
  mode: PublishMode;
  sequenceNumber: number;
  maxWorkflowAttempts?: number;
  metadata?: MetadataRecord;
}

export interface PublishAttemptOutcomeInput {
  providerStatus: string;
  publicationId?: string;
  externalUrl?: string;
  checklist?: string[];
  publishedAt?: Date;
  metadata?: MetadataRecord;
}

export const createPublishAttempt = (
  input: CreatePublishAttemptInput
): PublishAttempt => {
  const timestamp = now();

  return {
    id: createEntityId("publish"),
    videoId: ensureNonEmptyString(input.videoId, "publishAttempt.videoId"),
    publicationScheduleId: ensureNonEmptyString(
      input.publicationScheduleId,
      "publishAttempt.publicationScheduleId"
    ),
    provider: input.provider,
    platformSlug: ensureNonEmptyString(input.platformSlug, "publishAttempt.platformSlug"),
    mode: input.mode,
    sequenceNumber: ensurePositiveInteger(
      input.sequenceNumber,
      "publishAttempt.sequenceNumber"
    ),
    status: "pending",
    workflowAttemptCount: 0,
    maxWorkflowAttempts:
      input.maxWorkflowAttempts === undefined
        ? 3
        : ensurePositiveInteger(
            input.maxWorkflowAttempts,
            "publishAttempt.maxWorkflowAttempts"
          ),
    checklist: [],
    validationIssues: [],
    createdAt: timestamp,
    updatedAt: timestamp,
    ...(input.metadata ? { metadata: input.metadata } : {})
  };
};

export const startPublishAttempt = (
  publishAttempt: PublishAttempt,
  input: {
    workflowJobId: string;
    workflowAttemptCount: number;
  }
): PublishAttempt => {
  if (
    publishAttempt.status !== "pending" &&
    publishAttempt.status !== "retrying"
  ) {
    throw new DomainError(
      `Publish attempt "${publishAttempt.id}" cannot start from status "${publishAttempt.status}".`
    );
  }

  const {
    lastError: _lastError,
    failureStage: _failureStage,
    validationIssues: _validationIssues,
    ...rest
  } = publishAttempt;

  return {
    ...rest,
    status: "processing",
    workflowJobId: ensureNonEmptyString(input.workflowJobId, "publishAttempt.workflowJobId"),
    workflowAttemptCount: ensurePositiveInteger(
      input.workflowAttemptCount,
      "publishAttempt.workflowAttemptCount"
    ),
    startedAt: now(),
    updatedAt: now(),
    validationIssues: []
  };
};

export const markPublishAttemptRetrying = (
  publishAttempt: PublishAttempt,
  errorMessage: string
): PublishAttempt => {
  if (publishAttempt.status !== "processing") {
    throw new DomainError(
      `Publish attempt "${publishAttempt.id}" cannot retry from status "${publishAttempt.status}".`
    );
  }

  return {
    ...publishAttempt,
    status: "retrying",
    lastError: ensureNonEmptyString(errorMessage, "publishAttempt.errorMessage"),
    failureStage: "provider_execution",
    updatedAt: now()
  };
};

export const markPublishAttemptManualActionRequired = (
  publishAttempt: PublishAttempt,
  outcome: PublishAttemptOutcomeInput
): PublishAttempt => {
  if (
    publishAttempt.status !== "processing" &&
    publishAttempt.status !== "submitted"
  ) {
    throw new DomainError(
      `Publish attempt "${publishAttempt.id}" cannot require manual action from status "${publishAttempt.status}".`
    );
  }

  const { lastError: _lastError, failureStage: _failureStage, ...rest } = publishAttempt;

  return {
    ...rest,
    status: "manual_action_required",
    providerStatus: ensureNonEmptyString(outcome.providerStatus, "publishAttempt.providerStatus"),
    checklist: outcome.checklist ? [...outcome.checklist] : [],
    completedAt: now(),
    updatedAt: now(),
    ...(outcome.publicationId ? { providerPublicationId: outcome.publicationId } : {}),
    ...(outcome.externalUrl ? { externalUrl: outcome.externalUrl } : {}),
    ...(outcome.metadata ? { metadata: outcome.metadata } : {})
  };
};

export const markPublishAttemptSubmitted = (
  publishAttempt: PublishAttempt,
  outcome: PublishAttemptOutcomeInput
): PublishAttempt => {
  if (publishAttempt.status !== "processing") {
    throw new DomainError(
      `Publish attempt "${publishAttempt.id}" cannot be submitted from status "${publishAttempt.status}".`
    );
  }

  const { lastError: _lastError, failureStage: _failureStage, ...rest } = publishAttempt;

  return {
    ...rest,
    status: "submitted",
    providerStatus: ensureNonEmptyString(outcome.providerStatus, "publishAttempt.providerStatus"),
    checklist: outcome.checklist ? [...outcome.checklist] : [],
    completedAt: now(),
    updatedAt: now(),
    ...(outcome.publicationId ? { providerPublicationId: outcome.publicationId } : {}),
    ...(outcome.externalUrl ? { externalUrl: outcome.externalUrl } : {}),
    ...(outcome.metadata ? { metadata: outcome.metadata } : {})
  };
};

export const completePublishAttempt = (
  publishAttempt: PublishAttempt,
  outcome: PublishAttemptOutcomeInput
): PublishAttempt => {
  if (
    publishAttempt.status !== "processing" &&
    publishAttempt.status !== "submitted" &&
    publishAttempt.status !== "manual_action_required"
  ) {
    throw new DomainError(
      `Publish attempt "${publishAttempt.id}" cannot complete from status "${publishAttempt.status}".`
    );
  }

  const { lastError: _lastError, failureStage: _failureStage, ...rest } = publishAttempt;

  return {
    ...rest,
    status: "published",
    providerStatus: ensureNonEmptyString(outcome.providerStatus, "publishAttempt.providerStatus"),
    publishedAt: outcome.publishedAt ?? now(),
    completedAt: now(),
    updatedAt: now(),
    checklist: outcome.checklist ? [...outcome.checklist] : [],
    ...(outcome.publicationId ? { providerPublicationId: outcome.publicationId } : {}),
    ...(outcome.externalUrl ? { externalUrl: outcome.externalUrl } : {}),
    ...(outcome.metadata ? { metadata: outcome.metadata } : {})
  };
};

export const failPublishAttempt = (
  publishAttempt: PublishAttempt,
  input: {
    errorMessage: string;
    failureStage: PublishFailureStage;
    validationIssues?: string[];
  }
): PublishAttempt => {
  if (
    publishAttempt.status !== "processing" &&
    publishAttempt.status !== "retrying" &&
    publishAttempt.status !== "pending" &&
    publishAttempt.status !== "submitted" &&
    publishAttempt.status !== "manual_action_required"
  ) {
    throw new DomainError(
      `Publish attempt "${publishAttempt.id}" cannot fail from status "${publishAttempt.status}".`
    );
  }

  return {
    ...publishAttempt,
    status: "failed",
    lastError: ensureNonEmptyString(input.errorMessage, "publishAttempt.errorMessage"),
    failureStage: input.failureStage,
    validationIssues: input.validationIssues ? [...input.validationIssues] : [],
    completedAt: now(),
    updatedAt: now()
  };
};
