import { DomainError, ValidationError, type TrackableEntityType } from "@videotik/core";

const readHeaderValue = (
  headers: Record<string, string | string[] | undefined>,
  key: string
): string | undefined => {
  const value = headers[key.toLowerCase()];

  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
};

export const ensureObject = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new DomainError("Request body must be a JSON object.", "invalid_request_body", {
      expectedType: "object"
    });
  }

  return value as Record<string, unknown>;
};

export const readString = (record: Record<string, unknown>, key: string): string => {
  const value = record[key];

  if (typeof value !== "string" || value.trim().length === 0) {
    throw new DomainError(`"${key}" must be a non-empty string.`, "invalid_string", {
      field: key
    });
  }

  return value.trim();
};

export const readOptionalString = (record: Record<string, unknown>, key: string): string | undefined => {
  const value = record[key];

  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string" || value.trim().length === 0) {
    throw new DomainError(`"${key}" must be a non-empty string when provided.`, "invalid_string", {
      field: key
    });
  }

  return value.trim();
};

export const readHeaderString = (
  headers: Record<string, string | string[] | undefined>,
  key: string
): string => {
  const value = readHeaderValue(headers, key);

  if (typeof value !== "string" || value.trim().length === 0) {
    throw new DomainError(`Header "${key}" must be a non-empty string.`, "invalid_header", {
      header: key
    });
  }

  return value.trim();
};

export const readBoolean = (record: Record<string, unknown>, key: string): boolean => {
  const value = record[key];

  if (typeof value !== "boolean") {
    throw new DomainError(`"${key}" must be a boolean.`, "invalid_boolean", {
      field: key
    });
  }

  return value;
};

export const readOptionalBoolean = (
  record: Record<string, unknown>,
  key: string
): boolean | undefined => {
  const value = record[key];

  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "boolean") {
    throw new DomainError(`"${key}" must be a boolean when provided.`, "invalid_boolean", {
      field: key
    });
  }

  return value;
};

export const readOptionalNumber = (
  record: Record<string, unknown>,
  key: string
): number | undefined => {
  const value = record[key];

  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new DomainError(`"${key}" must be a number when provided.`, "invalid_number", {
      field: key
    });
  }

  return value;
};

export const readOptionalStringArray = (
  record: Record<string, unknown>,
  key: string
): string[] | undefined => {
  const value = record[key];

  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new DomainError(`"${key}" must be an array of strings when provided.`, "invalid_string_array", {
      field: key
    });
  }

  return value.map((item) => item.trim()).filter((item) => item.length > 0);
};

export const readDate = (record: Record<string, unknown>, key: string): Date => {
  const value = readString(record, key);
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new DomainError(`"${key}" must be a valid ISO date string.`, "invalid_date", {
      field: key
    });
  }

  return date;
};

export const readEnumValue = <TValue extends string>(
  record: Record<string, unknown>,
  key: string,
  allowedValues: readonly TValue[]
): TValue => {
  const value = readString(record, key);

  if (!(allowedValues as readonly string[]).includes(value)) {
    throw new ValidationError(`"${key}" must be one of: ${allowedValues.join(", ")}.`, "invalid_enum_value", {
      field: key,
      allowedValues: [...allowedValues],
      received: value
    });
  }

  return value as TValue;
};

export const readOptionalEnumValue = <TValue extends string>(
  record: Record<string, unknown>,
  key: string,
  allowedValues: readonly TValue[]
): TValue | undefined => {
  const value = record[key];

  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string" || value.trim().length === 0) {
    throw new DomainError(`"${key}" must be a non-empty string when provided.`, "invalid_string", {
      field: key
    });
  }

  if (!(allowedValues as readonly string[]).includes(value.trim())) {
    throw new ValidationError(`"${key}" must be one of: ${allowedValues.join(", ")}.`, "invalid_enum_value", {
      field: key,
      allowedValues: [...allowedValues],
      received: value.trim()
    });
  }

  return value.trim() as TValue;
};

const trackableEntityTypes: TrackableEntityType[] = [
  "topic",
  "content_format",
  "idea",
  "script",
  "caption",
  "video",
  "image_prompt_pack",
  "subtitle_pack",
  "asset",
  "voice_job",
  "publication_schedule",
  "publish_attempt",
  "workflow_job"
];

export const readTrackableEntityType = (value: string): TrackableEntityType => {
  if (!trackableEntityTypes.includes(value as TrackableEntityType)) {
    throw new DomainError(`Unsupported entityType "${value}".`, "unsupported_entity_type", {
      entityType: value
    });
  }

  return value as TrackableEntityType;
};
