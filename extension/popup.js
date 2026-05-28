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

const els = {
  captureButton: document.getElementById("captureButton"),
  captureSummary: document.getElementById("captureSummary"),
  copyButton: document.getElementById("copyButton"),
  destinationSelect: document.getElementById("destinationSelect"),
  openFillButton: document.getElementById("openFillButton"),
  pageStatus: document.getElementById("pageStatus"),
  previewPanel: document.getElementById("previewPanel"),
  promptPreview: document.getElementById("promptPreview"),
  promptSize: document.getElementById("promptSize"),
  toast: document.getElementById("toast")
};

let activeTab = null;
let capturedConversation = null;
let enabledProviders = DEFAULT_SETTINGS.enabledProviders;

init();

async function init() {
  enabledProviders = await readEnabledProviders();
  populateDestinations();
  activeTab = await getActiveTab();
  els.pageStatus.textContent = activeTab?.url ? summarizeTab(activeTab.url) : "Open a supported LLM chat tab to begin.";

  els.captureButton.addEventListener("click", captureConversation);
  els.destinationSelect.addEventListener("change", refreshPromptPreview);
  els.copyButton.addEventListener("click", copyPrompt);
  els.openFillButton.addEventListener("click", openAndFill);
}

function populateDestinations() {
  const options = PROVIDERS.filter((provider) => enabledProviders[provider.id]).map((provider) => {
    const option = document.createElement("option");
    option.value = provider.id;
    option.textContent = provider.name;
    return option;
  });

  els.destinationSelect.replaceChildren(...options);
  if (!options.length) {
    els.openFillButton.disabled = true;
    els.copyButton.disabled = true;
    showToast("Enable at least one provider in Options.");
  }
}

async function captureConversation() {
  setBusy(true, "Capturing visible conversation...");

  try {
    activeTab = await getActiveTab();
    if (!activeTab?.id) throw new Error("No active tab found.");

    const response = await chrome.tabs.sendMessage(activeTab.id, { type: "CAPTURE_CONVERSATION" });
    if (!response?.ok) throw new Error(response?.reason || "Could not capture this page.");

    capturedConversation = response.conversation;
    if (!enabledProviders[capturedConversation.provider]) {
      throw new Error(`${capturedConversation.providerName} is disabled in Options.`);
    }

    els.captureSummary.hidden = false;
    els.captureSummary.textContent = globalThis.LLMBridgeFormatter.summarizeConversation(capturedConversation);
    refreshPromptPreview();
    showToast("Captured locally. Review the prompt before filling.");
  } catch (error) {
    showToast(error.message || String(error));
  } finally {
    setBusy(false);
  }
}

async function openAndFill() {
  const prompt = readPrompt();
  if (!capturedConversation || !prompt) return;

  setBusy(true, "Opening destination...");

  const payload = {
    source: capturedConversation,
    destination: els.destinationSelect.value,
    prompt
  };

  try {
    const response = await chrome.runtime.sendMessage({ type: "OPEN_AND_FILL", payload });
    if (response?.ok) {
      showToast("Filled the destination composer. Review it there before sending.");
      return;
    }

    await writeClipboard(prompt);
    showToast(`${response?.reason || "Auto-fill failed"} Copied prompt to clipboard instead.`);
  } catch (error) {
    await writeClipboard(prompt);
    showToast("Auto-fill failed. Copied prompt to clipboard instead.");
  } finally {
    setBusy(false);
  }
}

async function copyPrompt() {
  const prompt = readPrompt();
  if (!prompt) return;

  try {
    await writeClipboard(prompt);
    showToast("Prompt copied to clipboard.");
  } catch (error) {
    showToast("Clipboard write failed. Select the preview text and copy manually.");
  }
}

function refreshPromptPreview() {
  if (!capturedConversation) {
    els.openFillButton.disabled = true;
    els.copyButton.disabled = true;
    return;
  }

  const destination = PROVIDERS.find((provider) => provider.id === els.destinationSelect.value && enabledProviders[provider.id]);
  if (!destination) {
    els.openFillButton.disabled = true;
    els.copyButton.disabled = true;
    return;
  }

  const prompt = globalThis.LLMBridgeFormatter.formatTransferPrompt(capturedConversation, destination.name);
  els.promptPreview.value = prompt;
  els.promptSize.textContent = `${prompt.length.toLocaleString()} chars`;
  els.previewPanel.hidden = false;
  els.openFillButton.disabled = false;
  els.copyButton.disabled = false;
}

function readPrompt() {
  return els.promptPreview.value.trim();
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0] || null;
}

async function readEnabledProviders() {
  const stored = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  return {
    ...DEFAULT_SETTINGS.enabledProviders,
    ...(stored.enabledProviders || {})
  };
}

function summarizeTab(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return `Current tab: ${host}`;
  } catch {
    return "Current tab ready.";
  }
}

function setBusy(isBusy, message) {
  els.captureButton.disabled = isBusy;
  els.openFillButton.disabled = isBusy || !capturedConversation;
  if (message) showToast(message);
}

function showToast(message) {
  els.toast.textContent = message || "";
}

async function writeClipboard(text) {
  await navigator.clipboard.writeText(text);
}
