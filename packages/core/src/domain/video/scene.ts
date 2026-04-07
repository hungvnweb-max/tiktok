import {
  createEntityId,
  ensureNonEmptyString,
  ensurePositiveInteger,
  now,
  type AuditableEntity
} from "../common/entity";
import {
  normalizeSceneSubtitleConfigOverride,
  type SceneSubtitleConfigOverride
} from "../common/media";

export type SceneRole = "hook" | "setup" | "body" | "proof" | "twist" | "payoff" | "cta";

export interface SceneDirection extends AuditableEntity {
  order: number;
  role: SceneRole;
  narration: string;
  visualDirection: string;
  onScreenText: string;
  estimatedDurationSeconds: number;
  subtitleConfig?: SceneSubtitleConfigOverride | null;
}

export interface CreateSceneDirectionInput {
  order: number;
  role: SceneRole;
  narration: string;
  visualDirection: string;
  onScreenText: string;
  estimatedDurationSeconds: number;
  subtitleConfig?: SceneSubtitleConfigOverride | null;
}

export const createSceneDirection = (input: CreateSceneDirectionInput): SceneDirection => {
  const timestamp = now();

  return {
    id: createEntityId("scene"),
    order: ensurePositiveInteger(input.order, "scene.order"),
    role: input.role,
    narration: ensureNonEmptyString(input.narration, "scene.narration"),
    visualDirection: ensureNonEmptyString(input.visualDirection, "scene.visualDirection"),
    onScreenText: ensureNonEmptyString(input.onScreenText, "scene.onScreenText"),
    estimatedDurationSeconds: ensurePositiveInteger(
      input.estimatedDurationSeconds,
      "scene.estimatedDurationSeconds"
    ),
    createdAt: timestamp,
    updatedAt: timestamp,
    ...(input.subtitleConfig
      ? {
          subtitleConfig: normalizeSceneSubtitleConfigOverride(input.subtitleConfig)
        }
      : {})
  };
};
