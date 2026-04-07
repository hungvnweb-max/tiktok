import {
  buildSceneRolesForCount,
  type CaptionGenerationRequest,
  type GeneratedCaptionPayload,
  type GeneratedIdeaPayload,
  type GeneratedScriptPayload,
  type IdeaGenerationRequest,
  type ScriptGenerationRequest,
  type SceneRole,
  type TextGenerationPort
} from "@videotik/core";

const toTitleCase = (value: string): string => {
  return value
    .split(/\s+/)
    .filter((part) => part.length > 0)
    .map((part) => part[0]!.toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
};

const sanitizeTag = (value: string): string => {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
};

const buildHashtag = (value: string): string => {
  const normalized = sanitizeTag(value);
  return normalized ? `#${normalized}` : "";
};

const firstNonEmpty = (values: string[], fallback: string): string => {
  return values.find((value) => value.trim().length > 0) ?? fallback;
};

const fitWordRange = (
  seedText: string,
  minWords: number,
  maxWords: number,
  fillerWords: string[]
): string => {
  const words = seedText
    .replace(/[^\w\s'-]+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 0);

  const trimmed = words.slice(0, maxWords);
  let index = 0;

  while (trimmed.length < minWords) {
    trimmed.push(fillerWords[index % fillerWords.length] ?? "today");
    index += 1;
  }

  return trimmed.join(" ");
};

const allocateDurations = (sceneCount: number, totalDurationSeconds: number, hookSeconds: number): number[] => {
  if (sceneCount === 1) {
    return [totalDurationSeconds];
  }

  const safeHookSeconds = Math.min(hookSeconds, totalDurationSeconds - (sceneCount - 1));
  const remaining = totalDurationSeconds - safeHookSeconds;
  const trailingScenes = sceneCount - 1;
  const baseTrailingDuration = Math.max(1, Math.floor(remaining / trailingScenes));
  const durations = [safeHookSeconds];
  let consumed = safeHookSeconds;

  for (let index = 1; index < sceneCount; index += 1) {
    const scenesLeft = sceneCount - index;
    const duration = scenesLeft === 1 ? totalDurationSeconds - consumed : baseTrailingDuration;
    durations.push(duration);
    consumed += duration;
  }

  return durations;
};

const buildBodyLine = (
  bodyIndex: number,
  primaryPillar: string,
  primaryKeyword: string
): string => {
  const library = [
    `Pick one ${primaryPillar.toLowerCase()} problem your audience asks every week`,
    `Answer it with one ${primaryKeyword.toLowerCase()} step they can use today`,
    `Show the move clearly so the lesson feels instant and useful`,
    `Keep each screen focused on one benefit and one action`,
    `End the tip with a result viewers can picture immediately`
  ];

  return library[(bodyIndex - 1) % library.length]!;
};

const buildVisualDirection = (role: SceneRole, keyword: string, bodyIndex: number): string => {
  if (role === "hook") {
    return `Fast vertical opener with bold text, tight framing, and a visual pain point around ${keyword}.`;
  }

  if (role === "cta") {
    return "Clean CTA frame with clear typography, subtle motion, and room for caption-safe subtitles.";
  }

  return `Show one concrete ${keyword} step in action with a simple vertical composition, scene ${bodyIndex}.`;
};

export class TemplateTextGenerationAdapter implements TextGenerationPort {
  readonly providerId = "template" as const;

  async generateIdea(request: IdeaGenerationRequest): Promise<GeneratedIdeaPayload> {
    const primaryPillar = firstNonEmpty(request.topic.contentPillars, request.topic.name);
    const primaryKeyword = firstNonEmpty(request.topic.keywords, primaryPillar);
    const audience = request.topic.audience.toLowerCase();

    return {
      title: `${toTitleCase(primaryPillar)} quick tip for ${audience}`,
      hook: fitWordRange(
        `Still stuck with ${primaryKeyword.toLowerCase()} slowing your content down today`,
        request.contentFormat.structure.voiceLineWordsRange.min,
        request.contentFormat.structure.voiceLineWordsRange.max,
        ["right", "now"]
      ),
      angle: `Show ${audience} one practical way to improve ${primaryPillar.toLowerCase()} fast.`,
      brief: `Move scene by scene from hook to one clear takeaway to a CTA.`,
      callToAction: fitWordRange(
        `Follow for more ${request.topic.name.toLowerCase()} shortcuts this week`,
        request.contentFormat.structure.voiceLineWordsRange.min,
        request.contentFormat.structure.voiceLineWordsRange.max,
        ["today"]
      ),
      targetAudience: request.topic.audience,
      keywords: [primaryPillar, primaryKeyword, request.topic.name, request.contentFormat.slug],
      formatRationale: `${request.contentFormat.name} fits because it compresses one strong lesson into fast visual scenes with clean voice lines and overlays.`
    };
  }

  async generateScript(request: ScriptGenerationRequest): Promise<GeneratedScriptPayload> {
    const roles = buildSceneRolesForCount(request.contentFormat);
    const durations = allocateDurations(
      roles.length,
      request.contentFormat.defaultDurationSeconds,
      request.contentFormat.structure.recommendedHookSeconds
    );
    const primaryPillar = firstNonEmpty(request.topic.contentPillars, request.topic.name);
    const primaryKeyword = firstNonEmpty(request.idea.keywords, primaryPillar);
    let bodyIndex = 0;

    const scenes = roles.map((role, index) => {
      const duration = durations[index] ?? 4;

      if (role === "hook") {
        const narration = fitWordRange(
          request.idea.hook,
          request.contentFormat.structure.voiceLineWordsRange.min,
          request.contentFormat.structure.voiceLineWordsRange.max,
          ["right", "now"]
        );

        return {
          order: index + 1,
          role,
          narration,
          visualDirection: buildVisualDirection(role, primaryKeyword, bodyIndex),
          onScreenText: narration,
          estimatedDurationSeconds: duration
        };
      }

      if (role === "cta") {
        const narration = fitWordRange(
          request.idea.callToAction,
          request.contentFormat.structure.voiceLineWordsRange.min,
          request.contentFormat.structure.voiceLineWordsRange.max,
          ["today"]
        );

        return {
          order: index + 1,
          role,
          narration,
          visualDirection: buildVisualDirection(role, primaryKeyword, bodyIndex),
          onScreenText: narration,
          estimatedDurationSeconds: duration
        };
      }

      bodyIndex += 1;
      const narration = fitWordRange(
        buildBodyLine(bodyIndex, primaryPillar, primaryKeyword),
        request.contentFormat.structure.voiceLineWordsRange.min,
        request.contentFormat.structure.voiceLineWordsRange.max,
        ["for", "results"]
      );

      return {
        order: index + 1,
        role,
        narration,
        visualDirection: buildVisualDirection(role, primaryKeyword, bodyIndex),
        onScreenText: `Tip ${bodyIndex}: ${fitWordRange(
          buildBodyLine(bodyIndex, primaryPillar, primaryKeyword),
          3,
          8,
          ["now"]
        )}`,
        estimatedDurationSeconds: duration
      };
    });

    return {
      title: request.idea.title,
      summary: request.idea.brief,
      voiceover: scenes.map((scene) => scene.narration).join(" "),
      scenes,
      estimatedDurationSeconds: scenes.reduce(
        (total, scene) => total + scene.estimatedDurationSeconds,
        0
      )
    };
  }

  async generateCaption(request: CaptionGenerationRequest): Promise<GeneratedCaptionPayload> {
    const tags = [
      buildHashtag(request.topic.slug),
      buildHashtag(request.contentFormat.slug),
      ...request.idea.keywords.map((keyword) => buildHashtag(keyword))
    ].filter((tag) => tag.length > 0);

    return {
      shortCaption: `${request.idea.hook} ${request.idea.callToAction}`,
      longCaption: `${request.script.summary} ${request.idea.callToAction} Save this if you want the workflow later.`,
      hashtags: tags.slice(0, 6),
      callToAction: request.idea.callToAction
    };
  }
}
