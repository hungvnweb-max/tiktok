# Sprint 1 + 2 Database Schema

## Core Content Tables

- `topics`
- `content_formats`
- `ideas`
- `scripts`
- `captions`
- `videos`
- `scenes`

## Operational Tables

- `workflow_jobs`
- `workflow_job_logs`
- `callback_receipts`
- `activity_logs`
- `version_records`
- `cost_logs`
- `publication_schedules`
- `publish_attempts`

## Sprint 2 Media Tables

- `image_prompt_packs`
- `scene_image_prompts`
- `subtitle_packs`
- `subtitle_cues`
- `overlay_cues`
- `assets`
- `voice_jobs`

## Key Relationships

- One `topic` has many `ideas`
- One `content_format` has many `ideas`, `scripts`, `videos`, `image_prompt_packs`, `subtitle_packs`, and `voice_jobs`
- One `idea` can produce many `videos`
- One `video` has many `scenes`
- One `video` has at most one `publication_schedule`
- One `video` has many `publish_attempts` across retries
- One `video` has at most one active `image_prompt_pack`
- One `video` has at most one active `subtitle_pack`
- One `scene` can have many `assets`
- One `scene` can have many image asset versions
- One `scene` can have many voice jobs over time

## Why This Shape

- `quick_tip` stays a seeded row in `content_formats`, so rules remain data-driven instead of hardcoded globally
- `scripts.sceneBlueprints` keeps structured JSON output from Sprint 1
- `assets` is generic enough for manual Banana images today and future provider-generated media later
- `voice_jobs` stays scene-based first so ElevenLabs integration can start one line per scene without blocking future merged narration
- `subtitle_packs` separates subtitle cues from overlay cues so future subtitle modes can evolve without changing scene script storage

## Sprint 2 Extensibility Notes

- image provider choice lives in `content_formats.deliveryOptions.imageWorkflow`
- subtitle modes live in backend policy/config, not in route code
- active image selection is modeled on assets, not hidden in the UI
- asset storage is metadata-first: URL, storage provider, and storage key can map to external URLs, local storage, or object storage later
