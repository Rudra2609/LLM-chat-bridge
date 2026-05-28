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
    if (!conversation || !prompt.trim()) return;
    setBusy(true);
    setToast("Opening destination...");

    const payload: TransferPayload = {
      source: conversation,
      destination,
      prompt
    };

    try {
      const response = await chrome.runtime.sendMessage({ type: "OPEN_AND_FILL", payload });
      if (response?.ok) {
        setToast("Filled the destination composer. Review it there before sending.");
        return;
      }

      await navigator.clipboard.writeText(prompt);
      setToast(`${response?.reason || "Auto-fill failed"} Copied prompt to clipboard instead.`);
    } catch {
      await navigator.clipboard.writeText(prompt);
      setToast("Auto-fill failed. Copied prompt to clipboard instead.");
    } finally {
      setBusy(false);
    }
  }

  async function copyPrompt() {
    if (!prompt.trim()) return;
    try {
      await navigator.clipboard.writeText(prompt);
      setToast("Prompt copied to clipboard.");
    } catch {
      setToast("Clipboard write failed. Select the preview text and copy manually.");
    }
  }

  const hasEnabledProvider = enabledProviders.length > 0;
  const canTransfer = Boolean(conversation && prompt.trim() && hasEnabledProvider && !busy);

  return (
    <main className="popup-shell">
      <header className="topbar">
        <img src="icons/icon.svg" alt="" className="logo" />
        <div>
          <h1>LLM Chat Bridge</h1>
          <p id="pageStatus">{activeTab?.url ? `Current tab: ${summarizeTab(activeTab.url)}` : toast}</p>
        </div>
      </header>

      <section className="panel">
        <button id="captureButton" className="primary" disabled={busy} onClick={captureConversation}>
          Capture current chat
        </button>
        {conversation ? <div id="captureSummary" className="summary">{summarizeConversation(conversation)}</div> : null}
      </section>

      <section className="panel">
        <label htmlFor="destinationSelect">Destination</label>
        <select
          id="destinationSelect"
          value={destination}
          disabled={!hasEnabledProvider}
          onChange={(event) => setDestination(event.target.value as ProviderId)}
        >
          {enabledProviders.map((provider) => (
            <option key={provider.id} value={provider.id}>{provider.name}</option>
          ))}
        </select>
        <div className="actions">
          <button id="openFillButton" className="primary" disabled={!canTransfer} onClick={openAndFill}>
            Open and fill
          </button>
          <button id="copyButton" disabled={!prompt.trim() || busy} onClick={copyPrompt}>
            Copy prompt
          </button>
        </div>
      </section>

      {conversation ? (
        <section className="preview" id="previewPanel">
          <div className="preview-header">
            <span>Prompt preview</span>
            <span id="promptSize">{prompt.length.toLocaleString()} chars</span>
          </div>
          <textarea id="promptPreview" spellCheck={false} value={prompt} onChange={() => undefined} readOnly />
        </section>
      ) : null}

      <p id="toast" className="toast" role="status" aria-live="polite">
        {hasEnabledProvider ? toast : "Enable at least one provider in Options."}
      </p>
      <a className="options-link" href="options.html" target="_blank" rel="noreferrer">Options and privacy</a>
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
