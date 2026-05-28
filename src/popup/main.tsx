import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "../../extension/popup.css";
import { formatTransferPrompt, summarizeConversation } from "../formatter";
import { getActiveTab, readSettings } from "../chromeApi";
import { PROVIDERS, providerName, type BridgeSettings } from "../providers";
import type { NormalizedConversation, ProviderId, TransferPayload } from "../types";

function PopupApp() {
  const [activeTab, setActiveTab] = useState<chrome.tabs.Tab | null>(null);
  const [settings, setSettings] = useState<BridgeSettings | null>(null);
  const [conversation, setConversation] = useState<NormalizedConversation | null>(null);
  const [destination, setDestination] = useState<ProviderId>("chatgpt");
  const [promptDraft, setPromptDraft] = useState("");
  const [toast, setToast] = useState("Checking current tab...");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([getActiveTab(), readSettings()]).then(([tab, loadedSettings]) => {
      setActiveTab(tab);
      setSettings(loadedSettings);
      const firstEnabled = PROVIDERS.find((provider) => loadedSettings.enabledProviders[provider.id]);
      if (firstEnabled) setDestination(firstEnabled.id);
      setToast(tab?.url ? `Current tab: ${summarizeTab(tab.url)}` : "Open a supported LLM chat tab to begin.");
    });
  }, []);

  const enabledProviders = useMemo(
    () => PROVIDERS.filter((provider) => settings?.enabledProviders[provider.id] ?? true),
    [settings]
  );

  const prompt = useMemo(() => {
    if (!conversation) return "";
    return formatTransferPrompt(conversation, providerName(destination));
  }, [conversation, destination]);

  useEffect(() => {
    setPromptDraft(prompt);
  }, [prompt]);

  async function captureConversation() {
    setBusy(true);
    setToast("Capturing visible conversation...");

    try {
      const tab = await getActiveTab();
      setActiveTab(tab);
      if (!tab?.id) throw new Error("No active tab found.");

      const response = await chrome.tabs.sendMessage(tab.id, { type: "CAPTURE_CONVERSATION" });
      if (!response?.ok) throw new Error(response?.reason || "Could not capture this page.");

      const captured = response.conversation as NormalizedConversation;
      if (settings && !settings.enabledProviders[captured.provider]) {
        throw new Error(`${captured.providerName} is disabled in Options.`);
      }

      setConversation(captured);
      setToast("Captured locally. Review the prompt before filling.");
    } catch (error) {
      setToast(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function openAndFill() {
    if (!conversation || !promptDraft.trim()) return;
    setBusy(true);
    setToast("Opening destination...");

    const payload: TransferPayload = {
      source: conversation,
      destination,
      prompt: promptDraft
    };

    try {
      const response = await chrome.runtime.sendMessage({ type: "OPEN_AND_FILL", payload });
      if (response?.ok) {
        setToast("Filled the destination composer. Review it there before sending.");
        return;
      }

      await navigator.clipboard.writeText(promptDraft);
      setToast(`${response?.reason || "Auto-fill failed"} Copied prompt to clipboard instead.`);
    } catch {
      await navigator.clipboard.writeText(promptDraft);
      setToast("Auto-fill failed. Copied prompt to clipboard instead.");
    } finally {
      setBusy(false);
    }
  }

  async function copyPrompt() {
    if (!promptDraft.trim()) return;
    try {
      await navigator.clipboard.writeText(promptDraft);
      setToast("Prompt copied to clipboard.");
    } catch {
      setToast("Clipboard write failed. Select the preview text and copy manually.");
    }
  }

  const hasEnabledProvider = enabledProviders.length > 0;
  const canTransfer = Boolean(conversation && promptDraft.trim() && hasEnabledProvider && !busy);

  return (
    <main className="popup-shell bridge-app">
      <header className="hero">
        <div className="hero-mark">
          <img src="icons/icon.svg" alt="" className="logo" />
        </div>
        <div className="hero-copy">
          <h1>LLM Chat Bridge</h1>
          <p id="pageStatus">{activeTab?.url ? summarizeTab(activeTab.url) : "No supported tab detected yet"}</p>
        </div>
        <a className="settings-button" href="options.html" target="_blank" rel="noreferrer" aria-label="Open settings">
          Settings
        </a>
      </header>

      <section className="transfer-board">
        <div className="endpoint">
          <span className="endpoint-label">Source</span>
          <strong>{conversation?.providerName || "Current tab"}</strong>
          <small>{conversation ? `${conversation.messages.length} messages captured` : "Ready to scan visible chat"}</small>
        </div>
        <div className="bridge-line" aria-hidden="true">
          <span />
        </div>
        <div className="endpoint">
          <span className="endpoint-label">Destination</span>
          <strong>{providerName(destination)}</strong>
          <small>Fill only, never auto-send</small>
        </div>
      </section>

      <section className="action-panel">
        <div className="action-header">
          <div>
            <span className="eyebrow">Step 1</span>
            <h2>Capture this chat</h2>
          </div>
          <button id="captureButton" className="primary" disabled={busy} onClick={captureConversation}>
            {busy ? "Working..." : "Capture"}
          </button>
        </div>
        {conversation ? <div id="captureSummary" className="summary">{summarizeConversation(conversation)}</div> : null}
      </section>

      <section className="action-panel">
        <div className="action-header compact">
          <div>
            <span className="eyebrow">Step 2</span>
            <h2>Choose destination</h2>
          </div>
        </div>
        <div className="provider-grid" role="radiogroup" aria-label="Destination provider">
          {enabledProviders.map((provider) => (
            <button
              key={provider.id}
              type="button"
              className={provider.id === destination ? "provider-chip active" : "provider-chip"}
              onClick={() => setDestination(provider.id)}
              disabled={!hasEnabledProvider}
              aria-pressed={provider.id === destination}
            >
              <span>{provider.name.slice(0, 1)}</span>
              {provider.name}
            </button>
          ))}
        </div>
        <div className="actions">
          <button id="openFillButton" className="primary wide" disabled={!canTransfer} onClick={openAndFill}>
            Open and fill composer
          </button>
          <button id="copyButton" className="secondary" disabled={!promptDraft.trim() || busy} onClick={copyPrompt}>
            Copy
          </button>
        </div>
      </section>

      {conversation ? (
        <section className="preview" id="previewPanel">
          <div className="preview-header">
            <span>Prompt preview</span>
            <span id="promptSize">{promptDraft.length.toLocaleString()} chars</span>
          </div>
          <textarea
            id="promptPreview"
            spellCheck={false}
            value={promptDraft}
            onChange={(event) => setPromptDraft(event.target.value)}
          />
        </section>
      ) : null}

      <footer className="status-bar">
        <p id="toast" className="toast" role="status" aria-live="polite">
          {hasEnabledProvider ? toast : "Enable at least one provider in Options."}
        </p>
      </footer>
    </main>
  );
}

function summarizeTab(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Current tab ready.";
  }
}

createRoot(document.getElementById("root") || document.body).render(<PopupApp />);
