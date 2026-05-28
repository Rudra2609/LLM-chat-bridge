const PROVIDERS = [
  { id: "chatgpt", name: "ChatGPT" },
  { id: "gemini", name: "Gemini" },
  { id: "claude", name: "Claude" },
  { id: "deepseek", name: "DeepSeek" }
];

const DEFAULT_SETTINGS = {
  enabledProviders: {
    chatgpt: true,
    gemini: true,
    claude: true,
    deepseek: true
  }
};

const toggles = document.getElementById("providerToggles");
const statusEl = document.getElementById("status");
const clearMetadataButton = document.getElementById("clearMetadataButton");

init();

async function init() {
  const settings = await readSettings();
  renderProviderToggles(settings.enabledProviders);
  clearMetadataButton.addEventListener("click", clearMetadata);
}

async function readSettings() {
  const stored = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  return {
    enabledProviders: {
      ...DEFAULT_SETTINGS.enabledProviders,
      ...(stored.enabledProviders || {})
    }
  };
}

function renderProviderToggles(enabledProviders) {
  toggles.replaceChildren(...PROVIDERS.map((provider) => {
    const label = document.createElement("label");
    label.className = "toggle-row";

    const text = document.createElement("span");
    text.textContent = provider.name;

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = Boolean(enabledProviders[provider.id]);
    checkbox.addEventListener("change", async () => {
      const next = await readSettings();
      next.enabledProviders[provider.id] = checkbox.checked;
      await chrome.storage.sync.set(next);
      showStatus("Provider settings saved.");
    });

    label.append(text, checkbox);
    return label;
  }));
}

async function clearMetadata() {
  await chrome.storage.local.remove("lastTransfer");
  showStatus("Recent-transfer metadata cleared.");
}

function showStatus(message) {
  statusEl.textContent = message;
  setTimeout(() => {
    if (statusEl.textContent === message) statusEl.textContent = "";
  }, 2500);
}
