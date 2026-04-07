import { createActivityLog, type ActivityActorType } from "../domain/activity/activity-log";
import { DomainError, createEntityId, ensurePositiveInteger, type MetadataRecord } from "../domain/common/entity";
import { type EntityReference, type TrackableEntityType } from "../domain/common/reference";
import { createCostRecord, type CostCategory } from "../domain/cost/cost-record";
import {
  completeWorkflowJob,
  createWorkflowJob,
  createWorkflowJobLog,
  failWorkflowJob,
  markWorkflowJobRetrying,
  startWorkflowJob,
  updateWorkflowJobResultMetadata,
  type WorkflowJob,
  type WorkflowJobLog,
  type WorkflowJobStatus,
  type WorkflowJobType
} from "../domain/job/workflow-job";
import { createVersionSnapshot } from "../domain/version/version-snapshot";
import { type PlatformRepositories } from "../ports/repositories";

export interface RunWorkflowJobInput<T> {
  type: WorkflowJobType;
  reference: EntityReference;
  payload?: MetadataRecord;
  maxAttempts?: number;
  executor(job: WorkflowJob): Promise<T>;
}

export interface WorkflowExecutionResult<T> {
  job: WorkflowJob;
  logs: WorkflowJobLog[];
  result: T;
}

export interface AcquireWorkflowJobLeaseInput {
  ownerId: string;
  leaseMs: number;
  expectedStatuses?: WorkflowJobStatus[];
}

export class WorkflowJobService {
  constructor(private readonly repositories: PlatformRepositories) {}

  async createJob(input: Omit<RunWorkflowJobInput<never>, "executor">): Promise<{
    job: WorkflowJob;
    log: WorkflowJobLog;
  }> {
    const job = createWorkflowJob({
      type: input.type,
      reference: input.reference,
      ...(input.payload ? { payload: input.payload } : {}),
      ...(input.maxAttempts === undefined ? {} : { maxAttempts: input.maxAttempts })
    });

    await this.repositories.workflowJobRepository.save(job);
    const log = await this.appendLog(job, "info", `Queued ${input.type} workflow.`, input.payload);

    return {
      job,
      log
    };
  }

  async logJob(
    job: WorkflowJob,
    level: "info" | "warn" | "error",
    message: string,
    context?: MetadataRecord
  ) {
    return this.appendLog(job, level, message, context);
  }

  async startJob(job: WorkflowJob): Promise<{
    job: WorkflowJob;
    log: WorkflowJobLog;
  }> {
    const startedJob = startWorkflowJob(job);
    await this.repositories.workflowJobRepository.save(startedJob);
    const log = await this.appendLog(
      startedJob,
      "info",
      startedJob.attemptCount === 1
        ? `Started ${startedJob.type} workflow.`
        : `Retry attempt ${startedJob.attemptCount} started for ${startedJob.type} workflow.`
    );

    return {
      job: startedJob,
      log
    };
  }

  async setResultMetadata(job: WorkflowJob, resultMetadata: MetadataRecord): Promise<WorkflowJob> {
    const updatedJob = updateWorkflowJobResultMetadata(job, resultMetadata);
    await this.repositories.workflowJobRepository.save(updatedJob);
    return updatedJob;
  }

  async markJobRetrying(job: WorkflowJob, errorMessage: string): Promise<{
    job: WorkflowJob;
    log: WorkflowJobLog;
  }> {
    const retryingJob = markWorkflowJobRetrying(job, errorMessage);
    await this.repositories.workflowJobRepository.save(retryingJob);
    const log = await this.appendLog(
      retryingJob,
      "warn",
      `Retrying ${retryingJob.type} workflow after attempt ${retryingJob.attemptCount}: ${errorMessage}`
    );

    return {
      job: retryingJob,
      log
    };
  }

  async completeJob(job: WorkflowJob, resultMetadata?: MetadataRecord): Promise<{
    job: WorkflowJob;
    log: WorkflowJobLog;
  }> {
    const completedJob = completeWorkflowJob(job, resultMetadata);
    await this.repositories.workflowJobRepository.save(completedJob);
    const log = await this.appendLog(completedJob, "info", `Completed ${completedJob.type} workflow.`);

    return {
      job: completedJob,
      log
    };
  }

  async failJob(
    job: WorkflowJob,
    errorMessage: string,
    context?: MetadataRecord
  ): Promise<{
    job: WorkflowJob;
    log: WorkflowJobLog;
  }> {
    const failedJob = failWorkflowJob(job, errorMessage);
    await this.repositories.workflowJobRepository.save(failedJob);
    const log = await this.appendLog(failedJob, "error", errorMessage, context);

    return {
      job: failedJob,
      log
    };
  }

  async getJob(jobId: string) {
    return this.repositories.workflowJobRepository.findById(jobId);
  }

  async tryAcquireLease(
    jobId: string,
    input: AcquireWorkflowJobLeaseInput
  ): Promise<WorkflowJob | undefined> {
    const leaseMs = ensurePositiveInteger(input.leaseMs, "workflowJobLease.leaseMs");

    return this.repositories.workflowJobRepository.tryAcquireLease(jobId, {
      ownerId: input.ownerId,
      leaseToken: createEntityId("joblease"),
      leaseExpiresAt: new Date(Date.now() + leaseMs),
      ...(input.expectedStatuses ? { expectedStatuses: input.expectedStatuses } : {})
    });
  }

  async releaseLease(job: WorkflowJob): Promise<boolean> {
    if (!job.lease) {
      return false;
    }

    return this.repositories.workflowJobRepository.releaseLease(job.id, job.lease.token);
  }

  async listJobsByReference(reference: EntityReference, type?: WorkflowJobType) {
    return this.repositories.workflowJobRepository.listByReference(reference, type);
  }

  async runJob<T>(input: RunWorkflowJobInput<T>): Promise<WorkflowExecutionResult<T>> {
    const queued = await this.createJob({
      type: input.type,
      reference: input.reference,
      ...(input.payload ? { payload: input.payload } : {}),
      ...(input.maxAttempts === undefined ? {} : { maxAttempts: input.maxAttempts })
    });
    let job = queued.job;
    const logs: WorkflowJobLog[] = [];

    logs.push(queued.log);

    while (true) {
      const started = await this.startJob(job);
      job = started.job;
      logs.push(started.log);

      try {
        const result = await input.executor(job);
        const completed = await this.completeJob(job);
        job = completed.job;
        logs.push(completed.log);

        return {
          job,
          logs,
          result
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        if (!(error instanceof DomainError) && job.attemptCount < job.maxAttempts) {
          const retrying = await this.markJobRetrying(job, message);
          job = retrying.job;
          logs.push(retrying.log);
          continue;
        }

        const failed = await this.failJob(job, message);
        job = failed.job;
        logs.push(failed.log);
        throw error;
      }
    }
  }

  async listJobs() {
    return this.repositories.workflowJobRepository.list();
  }

  async listLogs(jobId: string) {
    return this.repositories.workflowJobLogRepository.listByJobId(jobId);
  }

  private async appendLog(
    job: WorkflowJob,
    level: "info" | "warn" | "error",
    message: string,
    context?: MetadataRecord
  ) {
    const log = createWorkflowJobLog({
      workflowJobId: job.id,
      level,
      message,
      statusSnapshot: job.status,
      ...(context ? { context } : {})
    });
    await this.repositories.workflowJobLogRepository.append(log);
    return log;
  }
}

export interface RecordActivityInput {
  actorType?: ActivityActorType;
  actorId?: string;
  action: string;
  reference: EntityReference;
  message: string;
  metadata?: MetadataRecord;
}

export interface RecordCostInput {
  provider: string;
  category: CostCategory;
  reference: EntityReference;
  amount: number;
  currency?: string;
  units: string;
  quantity: number;
  metadata?: MetadataRecord;
}

export class AuditTrailService {
  constructor(private readonly repositories: PlatformRepositories) {}

  async recordActivity(input: RecordActivityInput) {
    const activityLog = createActivityLog({
      actorType: input.actorType ?? "system",
      actorId: input.actorId ?? "system",
      action: input.action,
      reference: input.reference,
      message: input.message,
      ...(input.metadata ? { metadata: input.metadata } : {})
    });
    await this.repositories.activityLogRepository.save(activityLog);
    return activityLog;
  }

  async snapshot(reference: EntityReference, sourceAction: string, payload: unknown) {
    const previousVersions = await this.repositories.versionSnapshotRepository.listByReference(reference);
    const versionSnapshot = createVersionSnapshot({
      reference,
      versionNumber: previousVersions.length + 1,
      sourceAction,
      serializedPayload: JSON.stringify(payload)
    });
    await this.repositories.versionSnapshotRepository.save(versionSnapshot);
    return versionSnapshot;
  }

  async recordCost(input: RecordCostInput) {
    const costRecord = createCostRecord({
      provider: input.provider,
      category: input.category,
      reference: input.reference,
      amount: input.amount,
      currency: input.currency ?? "USD",
      units: input.units,
      quantity: input.quantity,
      ...(input.metadata ? { metadata: input.metadata } : {})
    });
    await this.repositories.costRecordRepository.save(costRecord);
    return costRecord;
  }

  async listActivity() {
    return this.repositories.activityLogRepository.list();
  }

  async listCosts() {
    return this.repositories.costRecordRepository.list();
  }

  async listVersions(reference: EntityReference) {
    return this.repositories.versionSnapshotRepository.listByReference(reference);
  }
}

export const createReference = (
  entityType: TrackableEntityType,
  entityId: string
): EntityReference => {
  return {
    entityType,
    entityId
  };
};
