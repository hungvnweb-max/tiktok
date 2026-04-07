import {
  createEntityId,
  ensureNonEmptyString,
  ensurePositiveInteger,
  now,
  type AuditableEntity
} from "../common/entity";
import type { EntityReference } from "../common/reference";

export interface VersionSnapshot extends AuditableEntity {
  reference: EntityReference;
  versionNumber: number;
  sourceAction: string;
  serializedPayload: string;
}

export interface CreateVersionSnapshotInput {
  reference: EntityReference;
  versionNumber: number;
  sourceAction: string;
  serializedPayload: string;
}

export const createVersionSnapshot = (input: CreateVersionSnapshotInput): VersionSnapshot => {
  const timestamp = now();

  return {
    id: createEntityId("version"),
    reference: input.reference,
    versionNumber: ensurePositiveInteger(input.versionNumber, "version.versionNumber"),
    sourceAction: ensureNonEmptyString(input.sourceAction, "version.sourceAction"),
    serializedPayload: ensureNonEmptyString(input.serializedPayload, "version.serializedPayload"),
    createdAt: timestamp,
    updatedAt: timestamp
  };
};
