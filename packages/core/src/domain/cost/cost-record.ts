import {
  DomainError,
  createEntityId,
  ensureNonEmptyString,
  now,
  type AuditableEntity,
  type MetadataRecord
} from "../common/entity";
import type { EntityReference } from "../common/reference";

export type CostCategory =
  | "text_generation"
  | "image_generation"
  | "voice_generation"
  | "subtitle_generation"
  | "render"
  | "publishing";

export interface CostRecord extends AuditableEntity {
  provider: string;
  category: CostCategory;
  reference: EntityReference;
  amount: number;
  currency: string;
  units: string;
  quantity: number;
  metadata?: MetadataRecord;
}

export interface CreateCostRecordInput {
  provider: string;
  category: CostCategory;
  reference: EntityReference;
  amount: number;
  currency: string;
  units: string;
  quantity: number;
  metadata?: MetadataRecord;
}

export const createCostRecord = (input: CreateCostRecordInput): CostRecord => {
  if (input.amount < 0) {
    throw new DomainError("cost.amount must be >= 0.");
  }

  if (input.quantity < 0) {
    throw new DomainError("cost.quantity must be >= 0.");
  }

  const timestamp = now();

  return {
    id: createEntityId("cost"),
    provider: ensureNonEmptyString(input.provider, "cost.provider"),
    category: input.category,
    reference: input.reference,
    amount: input.amount,
    currency: ensureNonEmptyString(input.currency, "cost.currency").toUpperCase(),
    units: ensureNonEmptyString(input.units, "cost.units"),
    quantity: input.quantity,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...(input.metadata ? { metadata: input.metadata } : {})
  };
};
