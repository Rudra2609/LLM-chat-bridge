const PROVIDERS = {
  chatgpt: {
    id: "chatgpt",
    name: "ChatGPT",
    url: "https://chatgpt.com/"
  },
  gemini: {
    id: "gemini",
    name: "Gemini",
    url: "https://gemini.google.com/app"
  },
  claude: {
    id: "claude",
    name: "Claude",
    url: "https://claude.ai/new"
  },
  deepseek: {
    id: "deepseek",
    name: "DeepSeek",
    url: "https://chat.deepseek.com/"
  }
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "OPEN_AND_FILL") {
    openAndFill(message.payload)
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, reason: error.message || String(error) }));
    return true;
  }

  if (message?.type === "GET_PROVIDERS") {
    sendResponse({ ok: true, providers: Object.values(PROVIDERS) });
  }

  return false;
});

async function openAndFill(payload) {
  const provider = PROVIDERS[payload.destination];
  if (!provider) {
    return { ok: false, reason: "Unsupported destination provider." };
  }

  await chrome.storage.local.set({
    lastTransfer: {
      sourceProvider: payload.source?.providerName || "Unknown",
      destinationProvider: provider.name,
      capturedAt: payload.source?.capturedAt || new Date().toISOString(),
      messageCount: payload.source?.messages?.length || 0
    }
  });

  const tab = await chrome.tabs.create({ url: provider.url, active: true });
  const readyTab = await waitForTabComplete(tab.id);
  if (!readyTab?.id) {
    return { ok: false, reason: "Destination tab did not finish loading." };
  }

  await delay(900);

  try {
    const response = await chrome.tabs.sendMessage(readyTab.id, {
      type: "FILL_CONVERSATION",
      payload
    });

    if (response?.ok) {
      return { ok: true, tabId: readyTab.id };
    }

    return { ok: false, tabId: readyTab.id, reason: response?.reason || "Destination composer was not found." };
  } catch (error) {
    return { ok: false, tabId: readyTab.id, reason: "Could not contact the destination page content script." };
  }
}

function waitForTabComplete(tabId) {
  return new Promise((resolve) => {
    if (!tabId) {
      resolve(null);
      return;
    }

    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      chrome.tabs.get(tabId).then(resolve).catch(() => resolve(null));
    }, 15000);

    function listener(updatedTabId, changeInfo, tab) {
      if (updatedTabId === tabId && changeInfo.status === "complete") {
        clearTimeout(timeout);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve(tab);
      }
    }

    chrome.tabs.onUpdated.addListener(listener);
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
