-- Align persisted enums and JSON contracts with the backend guardrails.

CREATE TYPE "VideoStatus_new" AS ENUM (
  'IDEA_CREATED',
  'SCRIPT_READY',
  'IMAGE_READY',
  'VOICE_READY',
  'RENDER_READY',
  'RENDERED',
  'SCHEDULED',
  'PUBLISHED',
  'FAILED'
);

ALTER TABLE "Video"
ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "Video"
ALTER COLUMN "status" TYPE "VideoStatus_new"
USING (
  CASE "status"::text
    WHEN 'CONCEPT' THEN 'IDEA_CREATED'
    WHEN 'SCRIPTED' THEN 'SCRIPT_READY'
    WHEN 'RENDER_PENDING' THEN 'RENDER_READY'
    WHEN 'RENDERED' THEN 'RENDERED'
    WHEN 'PUBLISHED' THEN 'PUBLISHED'
    WHEN 'ARCHIVED' THEN 'FAILED'
  END
)::"VideoStatus_new";

DROP TYPE "VideoStatus";
ALTER TYPE "VideoStatus_new" RENAME TO "VideoStatus";
ALTER TABLE "Video"
ALTER COLUMN "status" SET DEFAULT 'SCRIPT_READY';

CREATE TYPE "WorkflowJobStatus_new" AS ENUM (
  'WAITING',
  'PROCESSING',
  'COMPLETED',
  'FAILED',
  'RETRYING'
);

ALTER TABLE "WorkflowJob"
ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "WorkflowJob"
ALTER COLUMN "status" TYPE "WorkflowJobStatus_new"
USING (
  CASE "status"::text
    WHEN 'PENDING' THEN 'WAITING'
    WHEN 'RUNNING' THEN 'PROCESSING'
    WHEN 'SUCCEEDED' THEN 'COMPLETED'
    WHEN 'FAILED' THEN 'FAILED'
    WHEN 'RETRY_SCHEDULED' THEN 'RETRYING'
    WHEN 'CANCELED' THEN 'FAILED'
  END
)::"WorkflowJobStatus_new";

ALTER TABLE "WorkflowJobLog"
ALTER COLUMN "statusSnapshot" TYPE "WorkflowJobStatus_new"
USING (
  CASE "statusSnapshot"::text
    WHEN 'PENDING' THEN 'WAITING'
    WHEN 'RUNNING' THEN 'PROCESSING'
    WHEN 'SUCCEEDED' THEN 'COMPLETED'
    WHEN 'FAILED' THEN 'FAILED'
    WHEN 'RETRY_SCHEDULED' THEN 'RETRYING'
    WHEN 'CANCELED' THEN 'FAILED'
  END
)::"WorkflowJobStatus_new";

DROP TYPE "WorkflowJobStatus";
ALTER TYPE "WorkflowJobStatus_new" RENAME TO "WorkflowJobStatus";
ALTER TABLE "WorkflowJob"
ALTER COLUMN "status" SET DEFAULT 'WAITING';

CREATE TYPE "ImageWorkflowMode" AS ENUM ('MANUAL_FIRST', 'PROVIDER_FIRST');

ALTER TABLE "Video"
ADD COLUMN "imageWorkflowConfig" JSONB,
ADD COLUMN "subtitleConfigVersion" JSONB;

UPDATE "Video"
SET "subtitleConfigVersion" = CASE
  WHEN "subtitleConfig" ? 'modeSlug' THEN jsonb_set(
    "subtitleConfig" - 'modeSlug',
    '{mode}',
    to_jsonb(CASE
      WHEN COALESCE(("subtitleConfig"->>'enabled')::boolean, false) = false THEN 'off'
      ELSE COALESCE("subtitleConfig"->>'modeSlug', 'phrase_highlight')
    END)
  )
  ELSE "subtitleConfig"
END;

UPDATE "Video"
SET "subtitleConfig" = "subtitleConfigVersion";

ALTER TABLE "Video"
DROP COLUMN "subtitleConfigVersion";

UPDATE "Video"
SET "voiceoverConfig" = jsonb_set(
  COALESCE("voiceoverConfig", '{}'::jsonb),
  '{generationMode}',
  to_jsonb(COALESCE("voiceoverConfig"->>'generationMode', 'scene_per_line'))
)
WHERE "voiceoverConfig" IS NOT NULL;

UPDATE "Video"
SET "imageWorkflowConfig" = jsonb_build_object(
  'mode', 'manual_first',
  'provider', CASE
    WHEN "formatSlug" = 'quick_tip' THEN 'banana'
    ELSE 'template'
  END,
  'requiresPromptApproval', true
)
WHERE "imageWorkflowConfig" IS NULL;

ALTER TABLE "Video"
ALTER COLUMN "imageWorkflowConfig" SET NOT NULL;

ALTER TABLE "Scene"
ADD COLUMN "subtitleConfig" JSONB;

ALTER TABLE "ImagePromptPack"
ADD COLUMN "workflowMode" "ImageWorkflowMode";

UPDATE "ImagePromptPack"
SET "workflowMode" = 'MANUAL_FIRST'
WHERE "workflowMode" IS NULL;

ALTER TABLE "ImagePromptPack"
ALTER COLUMN "workflowMode" SET NOT NULL;

ALTER TABLE "SubtitlePack"
RENAME COLUMN "modeSlug" TO "defaultMode";

UPDATE "ContentFormat"
SET "deliveryOptions" = CASE
  WHEN "slug" = 'quick_tip' THEN '{
    "subtitle":{
      "enabledByDefault":true,
      "supportedModes":["off","sentence","phrase_highlight","word_karaoke"],
      "defaultMode":"phrase_highlight",
      "allowVideoOverride":true,
      "allowSceneOverride":true,
      "defaultStylePreset":"clean-bold",
      "defaultMaxWordsPerLine":5,
      "defaultPosition":"bottom",
      "highlightKeywordsByDefault":true
    },
    "imageWorkflow":{
      "defaultMode":"manual_first",
      "defaultProvider":"banana",
      "providerSlugs":["banana","template"],
      "requiresPromptApproval":true
    },
    "voice":{
      "defaultProvider":"none",
      "providerSlugs":["none","elevenlabs"],
      "defaultGenerationMode":"scene_per_line",
      "generationModes":["scene_per_line","merged_narration"]
    },
    "render":{
      "defaultTargetPlatform":"tiktok",
      "defaultTemplateSlug":"clean_vertical",
      "templateSlugs":["clean_vertical","kinetic_cards"],
      "aspectRatio":"9:16",
      "resolution":"1080x1920",
      "subtitleBurnInByDefault":true
    },
    "publishing":{
      "platformSlugs":["tiktok"]
    }
  }'::jsonb
  ELSE '{
    "subtitle":{
      "enabledByDefault":true,
      "supportedModes":["off","sentence","phrase_highlight","word_karaoke"],
      "defaultMode":"sentence",
      "allowVideoOverride":true,
      "allowSceneOverride":true,
      "defaultStylePreset":"clean-bold",
      "defaultMaxWordsPerLine":5,
      "defaultPosition":"bottom",
      "highlightKeywordsByDefault":true
    },
    "imageWorkflow":{
      "defaultMode":"manual_first",
      "defaultProvider":"template",
      "providerSlugs":["template"],
      "requiresPromptApproval":true
    },
    "voice":{
      "defaultProvider":"none",
      "providerSlugs":["none"],
      "defaultGenerationMode":"scene_per_line",
      "generationModes":["scene_per_line","merged_narration"]
    },
    "render":{
      "defaultTargetPlatform":"tiktok",
      "defaultTemplateSlug":"clean_vertical",
      "templateSlugs":["clean_vertical"],
      "aspectRatio":"9:16",
      "resolution":"1080x1920",
      "subtitleBurnInByDefault":true
    },
    "publishing":{
      "platformSlugs":["tiktok"]
    }
  }'::jsonb
END;
