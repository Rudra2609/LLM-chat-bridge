import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "../../extension/options.css";
import { readSettings, saveSettings } from "../chromeApi";
import { PROVIDERS, type BridgeSettings } from "../providers";

function OptionsApp() {
  const [settings, setSettings] = useState<BridgeSettings | null>(null);
  const [status, setStatus] = useState("");

  useEffect(() => {
    readSettings().then(setSettings);
  }, []);

  async function toggleProvider(providerId: keyof BridgeSettings["enabledProviders"], enabled: boolean) {
    if (!settings) return;

    const next = {
      enabledProviders: {
        ...settings.enabledProviders,
        [providerId]: enabled
      }
    };

    setSettings(next);
    await saveSettings(next);
    showStatus("Provider settings saved.");
  }

  async function clearMetadata() {
    await chrome.storage.local.remove("lastTransfer");
    showStatus("Recent-transfer metadata cleared.");
  }

  function showStatus(message: string) {
    setStatus(message);
    window.setTimeout(() => {
      setStatus((current) => (current === message ? "" : current));
    }, 2500);
  }

  return (
    <main className="page">
      <header className="settings-hero">
        <div className="hero-left">
          <img src="icons/icon.svg" alt="" className="logo" />
          <div>
            <span className="eyebrow">Local-first extension</span>
            <h1>LLM Chat Bridge</h1>
            <p>Provider settings and privacy controls for the React build.</p>
          </div>
        </div>
        <a href="popup.html" className="ghost-link">Back to popup</a>
      </header>

      <section className="settings-panel">
        <div className="section-heading">
          <h2>Enabled providers</h2>
          <p>Turn providers on or off for capture and destination selection.</p>
        </div>
        <div id="providerToggles" className="toggle-list">
          {PROVIDERS.map((provider) => (
            <label className="toggle-row" key={provider.id}>
              <span className="provider-badge">{provider.name.slice(0, 1)}</span>
              <span className="provider-name">{provider.name}</span>
              <input
                type="checkbox"
                checked={settings?.enabledProviders[provider.id] ?? true}
                onChange={(event) => toggleProvider(provider.id, event.target.checked)}
              />
            </label>
          ))}
        </div>
      </section>

      <section className="settings-panel">
        <div className="section-heading">
          <h2>Privacy</h2>
          <span className="status-pill">No backend</span>
        </div>
        <p>
          Chat content is read only after you click capture. It is processed locally, never sent to an extension backend,
          and only copied or filled into another LLM after your action.
        </p>
        <button id="clearMetadataButton" onClick={clearMetadata}>Clear recent-transfer metadata</button>
      </section>

      <section className="settings-panel">
        <div className="section-heading">
          <h2>Permission rationale</h2>
          <span className="status-pill muted">Narrow hosts</span>
        </div>
        <p>
          The extension requests access only to supported LLM domains so content scripts can read the current chat and
          fill the destination composer. Clipboard permission is used for explicit copy and fallback flows.
        </p>
      </section>

      <p id="status" role="status" aria-live="polite">{status}</p>
    </main>
  );
}

createRoot(document.getElementById("root") || document.body).render(<OptionsApp />);
