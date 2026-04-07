export const textGenerationProviders = ["template", "banana", "openai", "custom"] as const;
export type TextGenerationProvider = (typeof textGenerationProviders)[number];

export const voiceoverProviders = ["none", "elevenlabs", "banana", "custom"] as const;
export type VoiceoverProvider = (typeof voiceoverProviders)[number];

export const activeVoiceoverProviders = ["elevenlabs", "banana", "custom"] as const;
export type ActiveVoiceoverProvider = (typeof activeVoiceoverProviders)[number];

export const imageGenerationProviders = ["template", "banana", "custom"] as const;
export type ImageGenerationProvider = (typeof imageGenerationProviders)[number];

export const subtitleGenerationProviders = ["template", "custom"] as const;
export type SubtitleGenerationProvider = (typeof subtitleGenerationProviders)[number];

export const renderProviders = ["template", "custom"] as const;
export type RenderProvider = (typeof renderProviders)[number];

export const publishingProviders = ["tiktok", "custom"] as const;
export type PublishingProvider = (typeof publishingProviders)[number];

export const isVoiceoverProvider = (value: string): value is VoiceoverProvider => {
  return (voiceoverProviders as readonly string[]).includes(value);
};

export const isActiveVoiceoverProvider = (value: string): value is ActiveVoiceoverProvider => {
  return (activeVoiceoverProviders as readonly string[]).includes(value);
};

export const isImageGenerationProvider = (value: string): value is ImageGenerationProvider => {
  return (imageGenerationProviders as readonly string[]).includes(value);
};

export const isRenderProvider = (value: string): value is RenderProvider => {
  return (renderProviders as readonly string[]).includes(value);
};

export const isPublishingProvider = (value: string): value is PublishingProvider => {
  return (publishingProviders as readonly string[]).includes(value);
};
