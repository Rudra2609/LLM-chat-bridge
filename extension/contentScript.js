(function bootContentScript() {
  const PROVIDERS = {
    chatgpt: {
      id: "chatgpt",
      name: "ChatGPT",
      hosts: ["chatgpt.com", "chat.openai.com"],
      messageSelectors: [
        { selector: "[data-message-author-role]", role: (el) => normalizeRole(el.getAttribute("data-message-author-role")) },
        { selector: "article[data-testid^='conversation-turn-']", role: inferRoleFromText }
      ],
      composerSelectors: ["#prompt-textarea", "textarea[data-id='root']", "textarea", "[contenteditable='true']"]
    },
    gemini: {
      id: "gemini",
      name: "Gemini",
      hosts: ["gemini.google.com"],
      messageSelectors: [
        { selector: "user-query", role: () => "user" },
        { selector: ".user-query", role: () => "user" },
        { selector: "model-response", role: () => "assistant" },
        { selector: ".model-response", role: () => "assistant" },
        { selector: "[data-test-id='user-query']", role: () => "user" },
        { selector: "[data-test-id='model-response']", role: () => "assistant" }
      ],
      composerSelectors: ["rich-textarea [contenteditable='true']", "textarea", "[contenteditable='true']"]
    },
    claude: {
      id: "claude",
      name: "Claude",
      hosts: ["claude.ai"],
      messageSelectors: [
        { selector: "[data-testid='user-message']", role: () => "user" },
        { selector: "[data-testid='assistant-message']", role: () => "assistant" },
        { selector: ".font-user-message", role: () => "user" },
        { selector: ".font-claude-message", role: () => "assistant" }
      ],
      composerSelectors: ["div.ProseMirror[contenteditable='true']", "[contenteditable='true']", "textarea"]
    },
    deepseek: {
      id: "deepseek",
      name: "DeepSeek",
      hosts: ["chat.deepseek.com"],
      messageSelectors: [
        { selector: "[data-role='user']", role: () => "user" },
        { selector: "[data-role='assistant']", role: () => "assistant" },
        { selector: "[class*='user-message']", role: () => "user" },
        { selector: "[class*='assistant-message']", role: () => "assistant" },
        { selector: "[class*='ds-markdown']", role: () => "assistant" }
      ],
      composerSelectors: ["textarea", "[contenteditable='true']"]
    }
  };

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === "CAPTURE_CONVERSATION") {
      try {
        const adapter = getCurrentAdapter();
        if (!adapter) {
          sendResponse({ ok: false, reason: "This page is not a supported LLM chat site." });
          return false;
        }

        const conversation = extractConversation(adapter);
        sendResponse({ ok: true, conversation });
      } catch (error) {
        sendResponse({ ok: false, reason: error.message || String(error) });
      }
      return false;
    }

    if (message?.type === "FILL_CONVERSATION") {
      try {
        const adapter = getCurrentAdapter();
        if (!adapter) {
          sendResponse({ ok: false, reason: "Destination page is not a supported LLM chat site." });
          return false;
        }

        const result = fillComposer(adapter, message.payload);
        sendResponse(result);
      } catch (error) {
        sendResponse({ ok: false, reason: error.message || String(error) });
      }
      return false;
    }

    return false;
  });

  function getCurrentAdapter() {
    const host = location.hostname.replace(/^www\./, "");
    return Object.values(PROVIDERS).find((provider) => provider.hosts.some((candidate) => host === candidate || host.endsWith(`.${candidate}`))) || null;
  }

  function extractConversation(adapter) {
    const seen = new Set();
    const messageElements = [];

    for (const config of adapter.messageSelectors) {
      document.querySelectorAll(config.selector).forEach((element) => {
        if (!(element instanceof HTMLElement) || seen.has(element)) return;
        if (hasOverlappingMessage(messageElements, element)) return;
        const text = normalizedInnerText(element);
        if (!text && !element.querySelector("img, table, pre, code, a")) return;
        seen.add(element);
        messageElements.push({ element, role: config.role(element) });
      });
    }

    const ordered = messageElements
      .filter((item) => isVisible(item.element))
      .sort((a, b) => compareDocumentPosition(a.element, b.element));

    const fallback = ordered.length ? ordered : extractFallbackMessages();

    return {
      provider: adapter.id,
      providerName: adapter.name,
      sourceUrl: location.href,
      title: readConversationTitle(),
      capturedAt: new Date().toISOString(),
      messages: fallback.map((item, index) => ({
        id: `${adapter.id}-${index + 1}`,
        role: normalizeRole(item.role),
        blocks: extractBlocks(item.element)
      }))
    };
  }

  function extractFallbackMessages() {
    const main = document.querySelector("main") || document.body;
    const candidates = Array.from(main.querySelectorAll("article, [role='article'], section"))
      .filter((element) => element instanceof HTMLElement && normalizedInnerText(element).length > 20 && isVisible(element))
      .slice(-30);

    return candidates.map((element, index) => ({
      element,
      role: index % 2 === 0 ? "user" : "assistant"
    }));
  }

  function hasOverlappingMessage(messageElements, element) {
    return messageElements.some((item) => item.element.contains(element) || element.contains(item.element));
  }

  function extractBlocks(root) {
    const blocks = [];
    const codeElements = new Set(Array.from(root.querySelectorAll("pre, pre code, code")));
    const tableElements = Array.from(root.querySelectorAll("table"));

    tableElements.forEach((table) => {
      const markdown = tableToMarkdown(table);
      if (markdown) blocks.push({ type: "table", markdown });
    });

    root.querySelectorAll("pre").forEach((pre) => {
      const code = pre.querySelector("code") || pre;
      const text = normalizedInnerText(code);
      if (text) {
        blocks.push({ type: "code", text, language: detectCodeLanguage(code) });
      }
    });

    const text = cloneTextWithout(root, "pre, code, table, script, style, button, svg");
    if (text) {
      blocks.unshift({ type: "text", text });
    }

    root.querySelectorAll("a[href]").forEach((anchor) => {
      const href = anchor.href;
      if (!href || href.startsWith("javascript:")) return;
      const label = normalizedInnerText(anchor) || href;
      blocks.push({ type: "link", text: label, href });
    });

    root.querySelectorAll("img").forEach((img) => {
      blocks.push({ type: "image", alt: img.alt || img.getAttribute("aria-label") || "", src: img.currentSrc || img.src || "" });
    });

    root.querySelectorAll("[data-testid*='file'], [class*='file'], [aria-label*='file' i]").forEach((fileElement) => {
      const name = normalizedInnerText(fileElement);
      if (name && name.length < 160) {
        blocks.push({ type: "file", name });
      }
    });

    root.querySelectorAll(".katex, .math, [class*='math']").forEach((mathElement) => {
      const math = normalizedInnerText(mathElement);
      if (math) blocks.push({ type: "math", text: math });
    });

    if (!blocks.length) {
      const fallbackText = normalizedInnerText(root);
      if (fallbackText) blocks.push({ type: "text", text: fallbackText });
    }

    return dedupeBlocks(blocks);
  }

  function fillComposer(adapter, payload) {
    const prompt = payload?.prompt || "";
    if (!prompt.trim()) {
      return { ok: false, reason: "Transfer prompt is empty." };
    }

    const target = findComposer(adapter);
    if (!target) {
      return { ok: false, reason: "Could not find the destination composer." };
    }

    target.element.scrollIntoView({ block: "center", behavior: "smooth" });
    target.element.focus();

    if (target.kind === "textarea") {
      setTextareaValue(target.element, prompt);
    } else {
      setContentEditableValue(target.element, prompt);
    }

    return { ok: true };
  }

  function findComposer(adapter) {
    for (const selector of adapter.composerSelectors) {
      const elements = Array.from(document.querySelectorAll(selector)).filter((element) => element instanceof HTMLElement && isVisible(element));
      const element = elements.at(-1);
      if (!element) continue;

      if (element instanceof HTMLTextAreaElement) {
        return { element, kind: "textarea" };
      }

      if (element.isContentEditable || element.getAttribute("contenteditable") === "true") {
        return { element, kind: "contenteditable" };
      }
    }

    return null;
  }

  function setTextareaValue(element, value) {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");
    descriptor?.set?.call(element, value);
    element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function setContentEditableValue(element, value) {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(element);
    selection?.removeAllRanges();
    selection?.addRange(range);

    const inserted = document.execCommand && document.execCommand("insertText", false, value);
    if (!inserted) {
      element.textContent = value;
    }

    element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function readConversationTitle() {
    const heading = Array.from(document.querySelectorAll("h1, [data-testid='conversation-title'], [class*='title']"))
      .find((element) => element instanceof HTMLElement && normalizedInnerText(element).length > 2);
    return normalizedInnerText(heading) || document.title.replace(/\s*[-|].*$/, "").trim() || "Untitled conversation";
  }

  function inferRoleFromText(element) {
    const role = element.getAttribute("data-message-author-role") || element.getAttribute("data-role") || "";
    if (role) return normalizeRole(role);

    const label = `${element.getAttribute("aria-label") || ""} ${element.className || ""}`.toLowerCase();
    if (label.includes("user") || label.includes("human")) return "user";
    if (label.includes("assistant") || label.includes("model") || label.includes("claude")) return "assistant";
    return "unknown";
  }

  function normalizeRole(role) {
    const value = String(role || "").toLowerCase();
    if (value.includes("user") || value.includes("human")) return "user";
    if (value.includes("assistant") || value.includes("model") || value.includes("bot") || value.includes("ai")) return "assistant";
    if (value.includes("system")) return "system";
    return "unknown";
  }

  function tableToMarkdown(table) {
    const rows = Array.from(table.querySelectorAll("tr")).map((row) =>
      Array.from(row.querySelectorAll("th,td")).map((cell) => normalizedInnerText(cell).replace(/\|/g, "\\|"))
    ).filter((row) => row.length);

    if (!rows.length) return "";

    const header = rows[0];
    const separator = header.map(() => "---");
    const body = rows.slice(1);
    return [header, separator, ...body].map((row) => `| ${row.join(" | ")} |`).join("\n");
  }

  function detectCodeLanguage(element) {
    const classes = Array.from(element.classList || []);
    const found = classes.find((className) => /language-|lang-/.test(className));
    return found ? found.replace(/^.*?(language-|lang-)/, "") : "";
  }

  function cloneTextWithout(root, selector) {
    const clone = root.cloneNode(true);
    clone.querySelectorAll(selector).forEach((element) => element.remove());
    return normalizedInnerText(clone);
  }

  function normalizedInnerText(element) {
    if (!element) return "";
    return (element.innerText || element.textContent || "")
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function dedupeBlocks(blocks) {
    const seen = new Set();
    return blocks.filter((block) => {
      const key = `${block.type}:${block.text || block.markdown || block.href || block.name || block.alt || block.src || ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function isVisible(element) {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
  }

  function compareDocumentPosition(a, b) {
    if (a === b) return 0;
    return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_PRECEDING ? 1 : -1;
  }
})();
