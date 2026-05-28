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
      <header>
        <img src="icons/icon.svg" alt="" className="logo" />
        <div>
          <h1>LLM Chat Bridge</h1>
          <p>Provider settings and local privacy controls.</p>
        </div>
      </header>

      <section>
        <h2>Enabled providers</h2>
        <div id="providerToggles" className="toggle-list">
          {PROVIDERS.map((provider) => (
            <label className="toggle-row" key={provider.id}>
              <span>{provider.name}</span>
              <input
                type="checkbox"
                checked={settings?.enabledProviders[provider.id] ?? true}
                onChange={(event) => toggleProvider(provider.id, event.target.checked)}
              />
            </label>
          ))}
        </div>
      </section>

      <section>
        <h2>Privacy</h2>
        <p>
          Chat content is read only after you click capture. It is processed locally, never sent to an extension backend,
          and only copied or filled into another LLM after your action.
        </p>
        <button id="clearMetadataButton" onClick={clearMetadata}>Clear recent-transfer metadata</button>
      </section>

      <section>
        <h2>Permission rationale</h2>
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
