import { ValidationError } from "../common/entity";
import type { ContentFormat } from "../content-format/content-format";
import type { SceneDirection } from "../video/scene";

const countWords = (value: string): number => {
  return value
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0).length;
};

export const validateScenesAgainstContentFormat = (
  scenes: SceneDirection[],
  contentFormat: ContentFormat
): void => {
  if (
    scenes.length < contentFormat.structure.sceneCountRange.min ||
    scenes.length > contentFormat.structure.sceneCountRange.max
  ) {
    throw new ValidationError(
      `Scene count must be between ${contentFormat.structure.sceneCountRange.min} and ${contentFormat.structure.sceneCountRange.max} for format "${contentFormat.slug}".`,
      "scene_count_invalid",
      {
        contentFormatSlug: contentFormat.slug,
        actualSceneCount: scenes.length,
        minSceneCount: contentFormat.structure.sceneCountRange.min,
        maxSceneCount: contentFormat.structure.sceneCountRange.max
      }
    );
  }

  const firstScene = scenes[0];
  const lastScene = scenes[scenes.length - 1];

  if (contentFormat.structure.hookRequired && firstScene?.role !== "hook") {
    throw new ValidationError(`Format "${contentFormat.slug}" requires the first scene to be a hook.`, "hook_required_missing", {
      contentFormatSlug: contentFormat.slug,
      sceneOrder: firstScene?.order ?? 1,
      actualRole: firstScene?.role ?? null
    });
  }

  if (contentFormat.structure.ctaRequired && lastScene?.role !== "cta") {
    throw new ValidationError(`Format "${contentFormat.slug}" requires the last scene to be a CTA.`, "cta_required_missing", {
      contentFormatSlug: contentFormat.slug,
      sceneOrder: lastScene?.order ?? scenes.length,
      actualRole: lastScene?.role ?? null
    });
  }

  if (firstScene?.role !== contentFormat.structure.sceneRolePlan.firstSceneRole) {
    throw new ValidationError(
      `First scene must use role "${contentFormat.structure.sceneRolePlan.firstSceneRole}".`,
      "first_scene_role_invalid",
      {
        contentFormatSlug: contentFormat.slug,
        expectedRole: contentFormat.structure.sceneRolePlan.firstSceneRole,
        actualRole: firstScene?.role ?? null
      }
    );
  }

  if (lastScene?.role !== contentFormat.structure.sceneRolePlan.lastSceneRole) {
    throw new ValidationError(
      `Last scene must use role "${contentFormat.structure.sceneRolePlan.lastSceneRole}".`,
      "last_scene_role_invalid",
      {
        contentFormatSlug: contentFormat.slug,
        expectedRole: contentFormat.structure.sceneRolePlan.lastSceneRole,
        actualRole: lastScene?.role ?? null
      }
    );
  }

  const allowedMiddleRoles = new Set(contentFormat.structure.sceneRolePlan.middleSceneRoles);

  for (const scene of scenes.slice(1, -1)) {
    if (!allowedMiddleRoles.has(scene.role)) {
      throw new ValidationError(`Scene role "${scene.role}" is not allowed for middle scenes.`, "middle_scene_role_invalid", {
        sceneId: scene.id,
        sceneOrder: scene.order,
        actualRole: scene.role,
        allowedRoles: contentFormat.structure.sceneRolePlan.middleSceneRoles
      });
    }

    const wordCount = countWords(scene.narration);

    if (
      wordCount < contentFormat.structure.voiceLineWordsRange.min ||
      wordCount > contentFormat.structure.voiceLineWordsRange.max
    ) {
      throw new ValidationError(
        `Scene ${scene.order} narration must contain between ${contentFormat.structure.voiceLineWordsRange.min} and ${contentFormat.structure.voiceLineWordsRange.max} words.`,
        "scene_voice_line_word_count_invalid",
        {
          sceneId: scene.id,
          sceneOrder: scene.order,
          actualWordCount: wordCount,
          minWords: contentFormat.structure.voiceLineWordsRange.min,
          maxWords: contentFormat.structure.voiceLineWordsRange.max
        }
      );
    }

    if (!scene.onScreenText.trim()) {
      throw new ValidationError(`Scene ${scene.order} must include overlay text.`, "scene_overlay_text_missing", {
        sceneId: scene.id,
        sceneOrder: scene.order
      });
    }
  }

  for (const scene of [firstScene, lastScene].filter(Boolean) as SceneDirection[]) {
    const wordCount = countWords(scene.narration);

    if (
      wordCount < contentFormat.structure.voiceLineWordsRange.min ||
      wordCount > contentFormat.structure.voiceLineWordsRange.max
    ) {
      throw new ValidationError(
        `Scene ${scene.order} narration must contain between ${contentFormat.structure.voiceLineWordsRange.min} and ${contentFormat.structure.voiceLineWordsRange.max} words.`,
        "scene_voice_line_word_count_invalid",
        {
          sceneId: scene.id,
          sceneOrder: scene.order,
          actualWordCount: wordCount,
          minWords: contentFormat.structure.voiceLineWordsRange.min,
          maxWords: contentFormat.structure.voiceLineWordsRange.max
        }
      );
    }

    if (!scene.onScreenText.trim()) {
      throw new ValidationError(`Scene ${scene.order} must include overlay text.`, "scene_overlay_text_missing", {
        sceneId: scene.id,
        sceneOrder: scene.order
      });
    }
  }
};

export const validateScriptDurationAgainstContentFormat = (
  estimatedDurationSeconds: number,
  contentFormat: ContentFormat
): void => {
  if (
    estimatedDurationSeconds < contentFormat.structure.durationSecondsRange.min ||
    estimatedDurationSeconds > contentFormat.structure.durationSecondsRange.max
  ) {
    throw new ValidationError(
      `Script duration must be between ${contentFormat.structure.durationSecondsRange.min} and ${contentFormat.structure.durationSecondsRange.max} seconds for format "${contentFormat.slug}".`,
      "script_duration_invalid",
      {
        contentFormatSlug: contentFormat.slug,
        estimatedDurationSeconds,
        minDurationSeconds: contentFormat.structure.durationSecondsRange.min,
        maxDurationSeconds: contentFormat.structure.durationSecondsRange.max
      }
    );
  }
};
