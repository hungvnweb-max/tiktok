import type { WorkflowJobLog, WorkflowJobLogRepository } from "@videotik/core";
import { WorkflowJobStatus as PrismaWorkflowJobStatus, type PrismaClient } from "@prisma/client";
import {
  readMetadataRecord,
  toNullableJsonValue
} from "./shared-operational-mappers";

const mapWorkflowJobStatusToPrisma = (
  status: WorkflowJobLog["statusSnapshot"]
): PrismaWorkflowJobStatus => {
  switch (status) {
    case "waiting":
      return PrismaWorkflowJobStatus.WAITING;
    case "processing":
      return PrismaWorkflowJobStatus.PROCESSING;
    case "completed":
      return PrismaWorkflowJobStatus.COMPLETED;
    case "failed":
      return PrismaWorkflowJobStatus.FAILED;
    case "retrying":
      return PrismaWorkflowJobStatus.RETRYING;
  }
};

const mapWorkflowJobStatusFromPrisma = (
  status: PrismaWorkflowJobStatus
): WorkflowJobLog["statusSnapshot"] => {
  switch (status) {
    case PrismaWorkflowJobStatus.WAITING:
      return "waiting";
    case PrismaWorkflowJobStatus.PROCESSING:
      return "processing";
    case PrismaWorkflowJobStatus.COMPLETED:
      return "completed";
    case PrismaWorkflowJobStatus.FAILED:
      return "failed";
    case PrismaWorkflowJobStatus.RETRYING:
      return "retrying";
  }
};

const mapPrismaWorkflowJobLogToDomain = (record: {
  id: string;
  workflowJobId: string;
  level: string;
  message: string;
  statusSnapshot: PrismaWorkflowJobStatus;
  context: unknown;
  createdAt: Date;
  updatedAt: Date;
}): WorkflowJobLog => {
  const log: WorkflowJobLog = {
    id: record.id,
    workflowJobId: record.workflowJobId,
    level: record.level as WorkflowJobLog["level"],
    message: record.message,
    statusSnapshot: mapWorkflowJobStatusFromPrisma(record.statusSnapshot),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
  const context = readMetadataRecord(record.context as never);

  if (context) {
    log.context = context;
  }

  return log;
};

const mapWorkflowJobLogToPrismaCreateData = (log: WorkflowJobLog) => {
  return {
    id: log.id,
    workflowJobId: log.workflowJobId,
    level: log.level,
    message: log.message,
    statusSnapshot: mapWorkflowJobStatusToPrisma(log.statusSnapshot),
    context: toNullableJsonValue(log.context),
    createdAt: log.createdAt
  };
};

export class PrismaWorkflowJobLogRepository implements WorkflowJobLogRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async append(log: WorkflowJobLog): Promise<void> {
    await this.prisma.workflowJobLog.create({
      data: mapWorkflowJobLogToPrismaCreateData(log)
    });
  }

  async listByJobId(jobId: string): Promise<WorkflowJobLog[]> {
    const logs = await this.prisma.workflowJobLog.findMany({
      where: {
        workflowJobId: jobId
      },
      orderBy: {
        createdAt: "asc"
      }
    });

    return logs.map(mapPrismaWorkflowJobLogToDomain);
  }
}
