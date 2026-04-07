import {
  DomainError,
  createEntityId,
  ensureNonEmptyString,
  ensurePositiveInteger,
  now,
  type AuditableEntity,
  type MetadataRecord
} from "../common/entity";
import type { EntityReference } from "../common/reference";

export type WorkflowJobType =
  | "idea_generation"
  | "script_generation"
  | "caption_generation"
  | "image_prompt_generation"
  | "subtitle_pack_generation"
  | "voice_generation"
  | "render"
  | "publish";

export type WorkflowJobStatus =
  | "waiting"
  | "processing"
  | "completed"
  | "failed"
  | "retrying";

export type WorkflowJobLogLevel = "info" | "warn" | "error";

export interface WorkflowJobLease {
  ownerId: string;
  token: string;
  expiresAt: Date;
}

export interface WorkflowJob extends AuditableEntity {
  type: WorkflowJobType;
  status: WorkflowJobStatus;
  reference: EntityReference;
  attemptCount: number;
  maxAttempts: number;
  payload?: MetadataRecord;
  resultMetadata?: MetadataRecord;
  lastError?: string;
  startedAt?: Date;
  finishedAt?: Date;
  lease?: WorkflowJobLease;
}

export interface WorkflowJobLog extends AuditableEntity {
  workflowJobId: string;
  level: WorkflowJobLogLevel;
  message: string;
  statusSnapshot: WorkflowJobStatus;
  context?: MetadataRecord;
}

export interface CreateWorkflowJobInput {
  type: WorkflowJobType;
  reference: EntityReference;
  maxAttempts?: number;
  payload?: MetadataRecord;
}

export const createWorkflowJob = (input: CreateWorkflowJobInput): WorkflowJob => {
  const timestamp = now();

  return {
    id: createEntityId("job"),
    type: input.type,
    status: "waiting",
    reference: input.reference,
    attemptCount: 0,
    maxAttempts: input.maxAttempts === undefined ? 3 : ensurePositiveInteger(input.maxAttempts, "job.maxAttempts"),
    createdAt: timestamp,
    updatedAt: timestamp,
    ...(input.payload ? { payload: input.payload } : {})
  };
};

export const withWorkflowJobLease = (
  job: WorkflowJob,
  input: WorkflowJobLease
): WorkflowJob => {
  if (input.expiresAt.getTime() <= now().getTime()) {
    throw new DomainError(`Job "${job.id}" lease expiry must be in the future.`);
  }

  return {
    ...job,
    lease: {
      ownerId: ensureNonEmptyString(input.ownerId, "job.lease.ownerId"),
      token: ensureNonEmptyString(input.token, "job.lease.token"),
      expiresAt: input.expiresAt
    },
    updatedAt: now()
  };
};

export const clearWorkflowJobLease = (job: WorkflowJob): WorkflowJob => {
  if (!job.lease) {
    return job;
  }

  const { lease: _lease, ...rest } = job;

  return {
    ...rest,
    updatedAt: now()
  };
};

export const startWorkflowJob = (job: WorkflowJob): WorkflowJob => {
  if (job.status !== "waiting" && job.status !== "retrying") {
    throw new DomainError(`Job "${job.id}" cannot start from status "${job.status}".`);
  }

  const clearedJob = clearWorkflowJobLease(job);
  const {
    lastError: _lastError,
    finishedAt: _finishedAt,
    resultMetadata: _resultMetadata,
    ...rest
  } = clearedJob;

  return {
    ...rest,
    status: "processing",
    attemptCount: job.attemptCount + 1,
    startedAt: now(),
    updatedAt: now()
  };
};

export const completeWorkflowJob = (
  job: WorkflowJob,
  resultMetadata?: MetadataRecord
): WorkflowJob => {
  if (job.status !== "processing") {
    throw new DomainError(`Job "${job.id}" cannot complete from status "${job.status}".`);
  }

  const clearedJob = clearWorkflowJobLease(job);
  const { lastError: _lastError, ...rest } = clearedJob;

  return {
    ...rest,
    status: "completed",
    finishedAt: now(),
    updatedAt: now(),
    ...(resultMetadata || job.resultMetadata
      ? {
          resultMetadata: {
            ...(job.resultMetadata ?? {}),
            ...(resultMetadata ?? {})
          }
        }
      : {})
  };
};

export const updateWorkflowJobResultMetadata = (
  job: WorkflowJob,
  resultMetadata: MetadataRecord
): WorkflowJob => {
  return {
    ...job,
    resultMetadata: {
      ...(job.resultMetadata ?? {}),
      ...resultMetadata
    },
    updatedAt: now()
  };
};

export const markWorkflowJobRetrying = (
  job: WorkflowJob,
  errorMessage: string
): WorkflowJob => {
  if (job.status !== "processing") {
    throw new DomainError(`Job "${job.id}" cannot retry from status "${job.status}".`);
  }

  if (job.attemptCount >= job.maxAttempts) {
    throw new DomainError(`Job "${job.id}" has no retries remaining.`);
  }

  const clearedJob = clearWorkflowJobLease(job);
  const { finishedAt: _finishedAt, ...rest } = clearedJob;

  return {
    ...rest,
    status: "retrying",
    lastError: ensureNonEmptyString(errorMessage, "job.errorMessage"),
    updatedAt: now()
  };
};

export const failWorkflowJob = (job: WorkflowJob, errorMessage: string): WorkflowJob => {
  if (job.status !== "processing" && job.status !== "retrying") {
    throw new DomainError(`Job "${job.id}" cannot fail from status "${job.status}".`);
  }

  const clearedJob = clearWorkflowJobLease(job);

  return {
    ...clearedJob,
    status: "failed",
    lastError: ensureNonEmptyString(errorMessage, "job.errorMessage"),
    updatedAt: now(),
    finishedAt: now()
  };
};

export interface CreateWorkflowJobLogInput {
  workflowJobId: string;
  level: WorkflowJobLogLevel;
  message: string;
  statusSnapshot: WorkflowJobStatus;
  context?: MetadataRecord;
}

export const createWorkflowJobLog = (input: CreateWorkflowJobLogInput): WorkflowJobLog => {
  const timestamp = now();

  return {
    id: createEntityId("joblog"),
    workflowJobId: ensureNonEmptyString(input.workflowJobId, "jobLog.workflowJobId"),
    level: input.level,
    message: ensureNonEmptyString(input.message, "jobLog.message"),
    statusSnapshot: input.statusSnapshot,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...(input.context ? { context: input.context } : {})
  };
};
