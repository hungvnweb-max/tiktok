export type TrackableEntityType =
  | "topic"
  | "content_format"
  | "idea"
  | "script"
  | "caption"
  | "video"
  | "image_prompt_pack"
  | "subtitle_pack"
  | "asset"
  | "voice_job"
  | "publication_schedule"
  | "publish_attempt"
  | "workflow_job";

export interface EntityReference {
  entityType: TrackableEntityType;
  entityId: string;
}
