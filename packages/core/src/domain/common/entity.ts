import { randomUUID } from "node:crypto";

export type EntityId = string;
export type MetadataValue = string | number | boolean | null;
export type MetadataRecord = Record<string, MetadataValue>;
export type ErrorDetails = Record<string, unknown>;

export interface AuditableEntity {
  id: EntityId;
  createdAt: Date;
  updatedAt: Date;
}

export class DomainError extends Error {
  readonly code: string;
  readonly details: ErrorDetails | undefined;
  readonly statusCode: number;

  constructor(
    message: string,
    code: string = "domain_error",
    details?: ErrorDetails,
    statusCode: number = 400
  ) {
    super(message);
    this.name = "DomainError";
    this.code = code;
    this.details = details;
    this.statusCode = statusCode;
  }
}

export class ValidationError extends DomainError {
  constructor(message: string, code: string = "validation_error", details?: ErrorDetails) {
    super(message, code, details, 400);
    this.name = "ValidationError";
  }
}

export class NotFoundError extends DomainError {
  constructor(message: string, details?: ErrorDetails) {
    super(message, "not_found", details, 404);
    this.name = "NotFoundError";
  }
}

export class ConflictError extends DomainError {
  constructor(message: string, details?: ErrorDetails) {
    super(message, "conflict", details, 409);
    this.name = "ConflictError";
  }
}

export class InvalidStateError extends DomainError {
  constructor(message: string, details?: ErrorDetails) {
    super(message, "invalid_state", details, 409);
    this.name = "InvalidStateError";
  }
}

export const now = (): Date => new Date();

export const createEntityId = (prefix: string): EntityId => {
  return `${prefix}_${randomUUID()}`;
};

export const ensureNonEmptyString = (value: string, fieldName: string): string => {
  const normalized = value.trim();

  if (!normalized) {
    throw new DomainError(`${fieldName} is required.`);
  }

  return normalized;
};

export const ensurePositiveInteger = (value: number, fieldName: string): number => {
  if (!Number.isInteger(value) || value <= 0) {
    throw new DomainError(`${fieldName} must be a positive integer.`);
  }

  return value;
};

export const normalizeSlug = (value: string, fieldName: string): string => {
  const slug = ensureNonEmptyString(value, fieldName)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (!slug) {
    throw new DomainError(`${fieldName} must contain letters or numbers.`);
  }

  return slug;
};

export const dedupeStrings = (values: string[]): string[] => {
  const normalizedValues = values
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  return [...new Set(normalizedValues)];
};

export const dedupeSlugs = (values: string[]): string[] => {
  return [...new Set(values.map((value) => normalizeSlug(value, "slug")))];
};
