import { createContentFormat, type ContentFormat } from "@videotik/core";

export const seedContentFormats: ContentFormat[] = [
  createContentFormat({
    slug: "quick_tip",
    name: "Quick Tip",
    description:
      "Short, fast, practical content for actionable advice, hacks, and platform tricks.",
    objective:
      "Deliver one practical takeaway in a short TikTok-ready format with one focused idea per scene.",
    defaultDurationSeconds: 25,
    defaultSceneCount: 5,
    promptGuidance: [
      "Lead with a strong hook in the first scene.",
      "Keep each scene focused on one idea and one short voice line.",
      "Prioritize clarity, speed, and practical value.",
      "End with a direct call to action."
    ],
    structure: {
      contentType: "educational",
      sceneCountRange: {
        min: 4,
        max: 6
      },
      durationSecondsRange: {
        min: 20,
        max: 25
      },
      voiceLineWordsRange: {
        min: 6,
        max: 14
      },
      hookRequired: true,
      ctaRequired: true,
      sceneRolePlan: {
        firstSceneRole: "hook",
        middleSceneRoles: ["body"],
        lastSceneRole: "cta"
      },
      suggestedSceneStructure: ["hook", "body_1", "body_2", "body_3", "cta"],
      sceneDeliverables: {
        imagesPerScene: 1,
        voiceLinesPerScene: 1,
        overlayTextsPerScene: 1
      },
      pacing: "fast",
      recommendedHookSeconds: 4
    },
    deliveryOptions: {
      subtitle: {
        enabledByDefault: true,
        supportedModes: ["off", "sentence", "phrase_highlight", "word_karaoke"],
        defaultMode: "sentence",
        allowVideoOverride: true,
        allowSceneOverride: true,
        defaultStylePreset: "clean-bold",
        defaultMaxWordsPerLine: 5,
        defaultPosition: "bottom",
        highlightKeywordsByDefault: true
      },
      imageWorkflow: {
        defaultMode: "manual_first",
        defaultProvider: "banana",
        providerSlugs: ["banana", "template"],
        requiresPromptApproval: true
      },
      voice: {
        defaultProvider: "none",
        providerSlugs: ["none", "elevenlabs"],
        defaultGenerationMode: "scene_per_line",
        generationModes: ["scene_per_line", "merged_narration"],
        voiceStyle: "fast_clear"
      },
      render: {
        defaultProvider: "template",
        providerSlugs: ["template", "custom"],
        defaultTargetPlatform: "tiktok",
        defaultTemplateSlug: "quick_tip_template_v1",
        templateSlugs: ["quick_tip_template_v1", "kinetic_cards"],
        aspectRatio: "9:16",
        resolution: "1080x1920",
        subtitleBurnInByDefault: true,
        visualStyle: "clean, high-contrast, practical, easy to read",
        overlayStyle: "clean-bold",
        defaultTransitionStyle: "quick-cut",
        defaultCaptionStyle: "short_practical"
      },
      publishing: {
        platformSlugs: ["tiktok"],
        providerSlugs: ["tiktok"],
        defaultProvider: "tiktok",
        supportedModes: ["manual", "semi_auto", "full_auto"],
        defaultMode: "manual",
        defaultCtaStyle: "follow"
      }
    }
  }),
  createContentFormat({
    slug: "news_short",
    name: "News Short",
    description:
      "Short-form news explainer or current-event summary with headline-first storytelling.",
    objective:
      "Explain a current event clearly with strong information hierarchy and concise scene progression.",
    defaultDurationSeconds: 40,
    defaultSceneCount: 6,
    promptGuidance: [
      "Open with a headline-style hook.",
      "Keep the tone clear and informative rather than dramatic.",
      "Add context through concise fact-based scenes.",
      "Use information hierarchy that remains easy to scan."
    ],
    structure: {
      contentType: "news",
      sceneCountRange: {
        min: 5,
        max: 8
      },
      durationSecondsRange: {
        min: 30,
        max: 45
      },
      voiceLineWordsRange: {
        min: 10,
        max: 18
      },
      hookRequired: true,
      ctaRequired: false,
      sceneRolePlan: {
        firstSceneRole: "hook",
        middleSceneRoles: ["body", "proof"],
        lastSceneRole: "payoff"
      },
      suggestedSceneStructure: [
        "headline_hook",
        "core_fact",
        "important_detail",
        "detail_or_context",
        "impact",
        "optional_cta"
      ],
      sceneDeliverables: {
        imagesPerScene: 1,
        voiceLinesPerScene: 1,
        overlayTextsPerScene: 1
      },
      pacing: "moderate",
      recommendedHookSeconds: 5
    },
    deliveryOptions: {
      subtitle: {
        enabledByDefault: true,
        supportedModes: ["off", "sentence", "phrase_highlight", "word_karaoke"],
        defaultMode: "phrase_highlight",
        allowVideoOverride: true,
        allowSceneOverride: true,
        defaultStylePreset: "news-lower-third",
        defaultMaxWordsPerLine: 6,
        defaultPosition: "bottom",
        highlightKeywordsByDefault: true
      },
      imageWorkflow: {
        defaultMode: "manual_first",
        defaultProvider: "banana",
        providerSlugs: ["banana", "template"],
        requiresPromptApproval: true
      },
      voice: {
        defaultProvider: "none",
        providerSlugs: ["none", "elevenlabs"],
        defaultGenerationMode: "scene_per_line",
        generationModes: ["scene_per_line", "merged_narration"],
        voiceStyle: "neutral_clear"
      },
      render: {
        defaultProvider: "template",
        providerSlugs: ["template", "custom"],
        defaultTargetPlatform: "tiktok",
        defaultTemplateSlug: "news_template_v1",
        templateSlugs: ["news_template_v1", "clean_vertical"],
        aspectRatio: "9:16",
        resolution: "1080x1920",
        subtitleBurnInByDefault: true,
        visualStyle: "headline-focused, informative, strong hierarchy",
        overlayStyle: "headline-card",
        defaultTransitionStyle: "info-swipe",
        defaultCaptionStyle: "news_summary"
      },
      publishing: {
        platformSlugs: ["tiktok"],
        providerSlugs: ["tiktok"],
        defaultProvider: "tiktok",
        supportedModes: ["manual", "semi_auto", "full_auto"],
        defaultMode: "manual"
      }
    }
  }),
  createContentFormat({
    slug: "horoscope_daily",
    name: "Horoscope Daily",
    description:
      "Short horoscope and daily guidance format with a softer pace and emotional tone.",
    objective:
      "Deliver daily astrological guidance with readable pacing, emotional tone, and a clear CTA.",
    defaultDurationSeconds: 50,
    defaultSceneCount: 6,
    promptGuidance: [
      "Start with a sign or group specific hook.",
      "Keep the tone calm, mystical, and readable.",
      "Progress from energy overview to advice without overcrowding scenes.",
      "Close with a soft but clear CTA."
    ],
    structure: {
      contentType: "guidance",
      sceneCountRange: {
        min: 5,
        max: 7
      },
      durationSecondsRange: {
        min: 40,
        max: 60
      },
      voiceLineWordsRange: {
        min: 10,
        max: 16
      },
      hookRequired: true,
      ctaRequired: true,
      sceneRolePlan: {
        firstSceneRole: "hook",
        middleSceneRoles: ["body", "proof", "payoff"],
        lastSceneRole: "cta"
      },
      suggestedSceneStructure: [
        "sign_hook",
        "energy_overview",
        "challenge",
        "opportunity",
        "advice",
        "cta"
      ],
      sceneDeliverables: {
        imagesPerScene: 1,
        voiceLinesPerScene: 1,
        overlayTextsPerScene: 1
      },
      pacing: "moderate",
      recommendedHookSeconds: 5
    },
    deliveryOptions: {
      subtitle: {
        enabledByDefault: true,
        supportedModes: ["off", "sentence", "phrase_highlight", "word_karaoke"],
        defaultMode: "phrase_highlight",
        allowVideoOverride: true,
        allowSceneOverride: true,
        defaultStylePreset: "mystic-glow",
        defaultMaxWordsPerLine: 5,
        defaultPosition: "bottom",
        highlightKeywordsByDefault: true
      },
      imageWorkflow: {
        defaultMode: "manual_first",
        defaultProvider: "banana",
        providerSlugs: ["banana", "template"],
        requiresPromptApproval: true
      },
      voice: {
        defaultProvider: "none",
        providerSlugs: ["none", "elevenlabs"],
        defaultGenerationMode: "scene_per_line",
        generationModes: ["scene_per_line", "merged_narration"],
        voiceStyle: "calm_mystic"
      },
      render: {
        defaultProvider: "template",
        providerSlugs: ["template", "custom"],
        defaultTargetPlatform: "tiktok",
        defaultTemplateSlug: "horoscope_template_v1",
        templateSlugs: ["horoscope_template_v1", "clean_vertical"],
        aspectRatio: "9:16",
        resolution: "1080x1920",
        subtitleBurnInByDefault: true,
        visualStyle: "mystical, soft contrast, symbolic",
        overlayStyle: "mystic-soft",
        defaultTransitionStyle: "soft-fade",
        defaultCaptionStyle: "daily_guidance"
      },
      publishing: {
        platformSlugs: ["tiktok"],
        providerSlugs: ["tiktok"],
        defaultProvider: "tiktok",
        supportedModes: ["manual", "semi_auto", "full_auto"],
        defaultMode: "manual",
        defaultCtaStyle: "comment"
      }
    }
  }),
  createContentFormat({
    slug: "storytelling_short",
    name: "Storytelling Short",
    description:
      "Narrative short-form video format for emotional, dramatic, or story-driven content.",
    objective:
      "Tell a short story through multiple beats, changing pace through scenes instead of overloading each line.",
    defaultDurationSeconds: 75,
    defaultSceneCount: 9,
    promptGuidance: [
      "Open with a high-curiosity hook.",
      "Use more beats instead of longer sentences.",
      "Escalate tension through scene progression.",
      "Land a strong ending, with CTA optional."
    ],
    structure: {
      contentType: "storytelling",
      sceneCountRange: {
        min: 8,
        max: 12
      },
      durationSecondsRange: {
        min: 60,
        max: 90
      },
      voiceLineWordsRange: {
        min: 10,
        max: 20
      },
      hookRequired: true,
      ctaRequired: false,
      sceneRolePlan: {
        firstSceneRole: "hook",
        middleSceneRoles: ["setup", "body", "twist"],
        lastSceneRole: "payoff"
      },
      suggestedSceneStructure: [
        "hook",
        "setup",
        "setup_detail",
        "conflict",
        "escalation",
        "escalation",
        "turning_point",
        "ending",
        "optional_cta"
      ],
      sceneDeliverables: {
        imagesPerScene: 1,
        voiceLinesPerScene: 1,
        overlayTextsPerScene: 1
      },
      pacing: "experimental",
      recommendedHookSeconds: 6
    },
    deliveryOptions: {
      subtitle: {
        enabledByDefault: true,
        supportedModes: ["off", "sentence", "phrase_highlight", "word_karaoke"],
        defaultMode: "phrase_highlight",
        allowVideoOverride: true,
        allowSceneOverride: true,
        defaultStylePreset: "cinematic-story",
        defaultMaxWordsPerLine: 6,
        defaultPosition: "bottom",
        highlightKeywordsByDefault: true
      },
      imageWorkflow: {
        defaultMode: "manual_first",
        defaultProvider: "banana",
        providerSlugs: ["banana", "template"],
        requiresPromptApproval: true
      },
      voice: {
        defaultProvider: "none",
        providerSlugs: ["none", "elevenlabs"],
        defaultGenerationMode: "scene_per_line",
        generationModes: ["scene_per_line", "merged_narration"],
        voiceStyle: "emotional_story"
      },
      render: {
        defaultProvider: "template",
        providerSlugs: ["template", "custom"],
        defaultTargetPlatform: "tiktok",
        defaultTemplateSlug: "storytelling_template_v1",
        templateSlugs: ["storytelling_template_v1", "clean_vertical"],
        aspectRatio: "9:16",
        resolution: "1080x1920",
        subtitleBurnInByDefault: true,
        visualStyle: "cinematic, narrative-focused",
        overlayStyle: "cinematic-minimal",
        defaultTransitionStyle: "dramatic-cut",
        defaultCaptionStyle: "story_recap"
      },
      publishing: {
        platformSlugs: ["tiktok"],
        providerSlugs: ["tiktok"],
        defaultProvider: "tiktok",
        supportedModes: ["manual", "semi_auto", "full_auto"],
        defaultMode: "manual"
      }
    }
  })
];
