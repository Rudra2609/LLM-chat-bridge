import type { ProviderId } from "./types";

export interface ProviderInfo {
  id: ProviderId;
  name: string;
}

export const PROVIDERS: ProviderInfo[] = [
  { id: "chatgpt", name: "ChatGPT" },
  { id: "gemini", name: "Gemini" },
  { id: "claude", name: "Claude" },
  { id: "deepseek", name: "DeepSeek" }
];

export const DEFAULT_SETTINGS = {
  enabledProviders: {
    chatgpt: true,
    gemini: true,
    claude: true,
    deepseek: true
  } satisfies Record<ProviderId, boolean>
};

export type BridgeSettings = typeof DEFAULT_SETTINGS;

export function providerName(providerId: ProviderId): string {
  return PROVIDERS.find((provider) => provider.id === providerId)?.name || providerId;
}
