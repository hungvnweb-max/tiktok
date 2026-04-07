import {
  createEntityId,
  ensureNonEmptyString,
  now,
  type AuditableEntity,
  type MetadataRecord
} from "../common/entity";
import type { EntityReference } from "../common/reference";

export type CallbackChannel = "render" | "publish";
export type CallbackReceiptStatus = "processing" | "completed" | "rejected";

export interface CallbackReceipt extends AuditableEntity {
  channel: CallbackChannel;
  operation: string;
  provider: string;
  idempotencyKey: string;
  reference: EntityReference;
  workflowJobId?: string;
  status: CallbackReceiptStatus;
  requestMetadata?: MetadataRecord;
  responsePayload?: string;
  processedAt?: Date;
}

export interface CreateCallbackReceiptInput {
  channel: CallbackChannel;
  operation: string;
  provider: string;
  idempotencyKey: string;
  reference: EntityReference;
  workflowJobId?: string;
  requestMetadata?: MetadataRecord;
}

export const createCallbackReceipt = (input: CreateCallbackReceiptInput): CallbackReceipt => {
  const timestamp = now();

  return {
    id: createEntityId("callback"),
    channel: input.channel,
    operation: ensureNonEmptyString(input.operation, "callbackReceipt.operation"),
    provider: ensureNonEmptyString(input.provider, "callbackReceipt.provider"),
    idempotencyKey: ensureNonEmptyString(input.idempotencyKey, "callbackReceipt.idempotencyKey"),
    reference: input.reference,
    status: "processing",
    createdAt: timestamp,
    updatedAt: timestamp,
    ...(input.workflowJobId ? { workflowJobId: input.workflowJobId } : {}),
    ...(input.requestMetadata ? { requestMetadata: input.requestMetadata } : {})
  };
};

export const completeCallbackReceipt = (
  receipt: CallbackReceipt,
  responsePayload: string
): CallbackReceipt => {
  return {
    ...receipt,
    status: "completed",
    responsePayload: ensureNonEmptyString(responsePayload, "callbackReceipt.responsePayload"),
    processedAt: now(),
    updatedAt: now()
  };
};

export const rejectCallbackReceipt = (
  receipt: CallbackReceipt,
  responsePayload: string
): CallbackReceipt => {
  return {
    ...receipt,
    status: "rejected",
    responsePayload: ensureNonEmptyString(responsePayload, "callbackReceipt.responsePayload"),
    processedAt: now(),
    updatedAt: now()
  };
};
