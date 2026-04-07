# CONTENT_FORMATS

## 1. Purpose
This document defines how video content formats work in the system.

The goal is to ensure the product is not hardcoded to one single video style.
All video generation, validation, rendering, and publishing logic must be driven by content format configuration.

This system must support:
- quick_tip
- news_short
- horoscope_daily
- storytelling_short

The first MVP format is `quick_tip`, but the architecture must remain extensible.

---

## 2. Core Rule
A video must always be generated using a selected `content_format`.

The format determines:
- duration rules
- scene count rules
- voice line length rules
- hook/CTA requirements
- subtitle defaults
- visual style defaults
- voice style defaults
- render template defaults

No global business rule should override content format configuration unless explicitly documented.

---

## 3. Format Model

Each content format should support at least the following fields:

- `format_name`
- `content_type`
- `description`
- `duration_min`
- `duration_max`
- `default_duration_target`
- `scene_count_min`
- `scene_count_max`
- `min_words_per_scene`
- `max_words_per_scene`
- `hook_required`
- `cta_required`
- `subtitle_default_enabled`
- `subtitle_default_mode`
- `visual_style`
- `voice_style`
- `template_id`
- `is_active`

Optional future fields:
- `music_style`
- `default_cta_style`
- `overlay_style`
- `default_transition_style`
- `default_caption_style`

---

## 4. Format Definitions

## 4.1 quick_tip
### Description
Short, fast, practical content.
Best for tips, hacks, list-style content, platform tricks, and actionable advice.

### Recommended Behavior
- duration range: 20-25 seconds
- default target: 25 seconds
- scene count: 4-6
- words per scene: 6-14
- hook required: yes
- CTA required: yes
- subtitle default: enabled
- subtitle mode default: sentence
- visual style: clean, high-contrast, practical, easy to read
- voice style: fast_clear
- template: quick_tip_template_v1

### Scene Structure
Suggested structure:
1. hook
2. body_1
3. body_2
4. body_3
5. CTA

### Notes
- 1 scene = 1 idea
- 1 scene = 1 short voice line
- avoid long sentences
- prioritize clarity and speed

---

## 4.2 news_short
### Description
Short-form news explainer or current-event summary.

### Recommended Behavior
- duration range: 30-45 seconds
- default target: 40 seconds
- scene count: 5-8
- words per scene: 10-18
- hook required: yes
- CTA required: optional
- subtitle default: enabled
- subtitle mode default: phrase_highlight
- visual style: headline-focused, informative, strong hierarchy
- voice style: neutral_clear
- template: news_template_v1

### Scene Structure
Suggested structure:
1. headline hook
2. core fact
3. important detail
4. detail or context
5. impact
6. optional CTA

### Notes
- content should feel clear, not overly dramatic
- headlines and info-card layouts should be supported
- more context per scene than quick_tip

---

## 4.3 horoscope_daily
### Description
Short horoscope / astrology / guidance content.

### Recommended Behavior
- duration range: 40-60 seconds
- default target: 50 seconds
- scene count: 5-7
- words per scene: 10-16
- hook required: yes
- CTA required: yes
- subtitle default: enabled
- subtitle mode default: phrase_highlight
- visual style: mystical, soft contrast, symbolic
- voice style: calm_mystic
- template: horoscope_template_v1

### Scene Structure
Suggested structure:
1. sign/group hook
2. energy overview
3. challenge
4. opportunity
5. advice
6. CTA

### Notes
- slower pacing than quick_tip
- more emotional tone
- text should remain readable and not overcrowded

---

## 4.4 storytelling_short
### Description
Short storytelling format for emotional, dramatic, or narrative content.

### Recommended Behavior
- duration range: 60-90 seconds
- default target: 75 seconds
- scene count: 8-12
- words per scene: 10-20
- hook required: yes
- CTA required: optional
- subtitle default: enabled
- subtitle mode default: phrase_highlight
- visual style: cinematic, narrative-focused
- voice style: emotional_story
- template: storytelling_template_v1

### Scene Structure
Suggested structure:
1. hook
2. setup
3. setup detail
4. conflict
5. escalation
6. escalation
7. turning point
8. ending
9. optional CTA

### Notes
- do not make long videos by only increasing sentence length
- longer videos must have more beats, not just more words
- scene pacing should change more often

---

## 5. Subtitle Defaults by Format

| format_name | subtitle_default_enabled | subtitle_default_mode |
|---|---:|---|
| quick_tip | true | sentence |
| news_short | true | phrase_highlight |
| horoscope_daily | true | phrase_highlight |
| storytelling_short | true | phrase_highlight |

Supported modes:
- `off`
- `sentence`
- `phrase_highlight`
- `word_karaoke` (future-ready)

---

## 6. Hook and CTA Rules

### Hook Rules
If `hook_required = true`:
- the first scene must be marked as hook
- the first scene must contain hook-style wording
- the validation engine must fail if no hook exists

### CTA Rules
If `cta_required = true`:
- the last scene must be marked as CTA
- CTA may be one of:
  - follow
  - save
  - comment
  - share
  - watch_part_2
- the validation engine must fail if CTA is missing

---

## 7. Validation Rules by Format

Validation must use the selected content format, not global hardcoded assumptions.

Validation should check:
- duration target within format range
- scene count within format range
- words per scene roughly within allowed range
- hook present when required
- CTA present when required
- subtitle mode allowed
- render template compatible
- voice style compatible if enforced

---

## 8. Format Extensibility Rules

When adding a new content format:
1. define the format in DB or seed config
2. define validation rules
3. define default subtitle behavior
4. define voice style
5. define visual style
6. define template mapping
7. define suggested scene structure
8. test generation, validation, render, and CMS behavior

The system must not require major architecture rewrites to add a new format.

---

## 9. MVP Requirement

The MVP must:
- implement `quick_tip`
- seed it as an initial content format
- use format-driven generation and validation
- avoid hardcoding quick_tip as the only long-term format

This means:
- content format must already exist in schema
- videos must already reference a selected format
- validation must already use the selected format

---

## 10. Future Enhancements

Potential future format capabilities:
- multiple templates per format
- multiple default CTA variants
- format-level music defaults
- format-specific image prompt styles
- dynamic scene role generation
- per-format quality scoring
- per-format scheduling strategies
