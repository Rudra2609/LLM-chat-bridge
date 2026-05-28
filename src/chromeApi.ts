import { DEFAULT_SETTINGS, type BridgeSettings } from "./providers";

export async function readSettings(): Promise<BridgeSettings> {
  const stored = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  return {
    enabledProviders: {
      ...DEFAULT_SETTINGS.enabledProviders,
      ...(stored.enabledProviders || {})
    }
  };
}

export async function saveSettings(settings: BridgeSettings): Promise<void> {
  await chrome.storage.sync.set(settings);
}

export async function getActiveTab(): Promise<chrome.tabs.Tab | null> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0] || null;
}
