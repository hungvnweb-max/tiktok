import {
  createEntityId,
  ensureNonEmptyString,
  now,
  type AuditableEntity,
  type MetadataRecord
} from "../common/entity";
import type { EntityReference } from "../common/reference";

export type ActivityActorType = "system" | "user" | "worker";

export interface ActivityLog extends AuditableEntity {
  actorType: ActivityActorType;
  actorId: string;
  action: string;
  reference: EntityReference;
  message: string;
  metadata?: MetadataRecord;
}

export interface CreateActivityLogInput {
  actorType: ActivityActorType;
  actorId: string;
  action: string;
  reference: EntityReference;
  message: string;
  metadata?: MetadataRecord;
}

export const createActivityLog = (input: CreateActivityLogInput): ActivityLog => {
  const timestamp = now();

  return {
    id: createEntityId("activity"),
    actorType: input.actorType,
    actorId: ensureNonEmptyString(input.actorId, "activity.actorId"),
    action: ensureNonEmptyString(input.action, "activity.action"),
    reference: input.reference,
    message: ensureNonEmptyString(input.message, "activity.message"),
    createdAt: timestamp,
    updatedAt: timestamp,
    ...(input.metadata ? { metadata: input.metadata } : {})
  };
};
