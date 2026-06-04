(function bootContentScript() {
  if (globalThis.__LLM_CHAT_BRIDGE_CONTENT_READY__) return;
  globalThis.__LLM_CHAT_BRIDGE_CONTENT_READY__ = true;

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
    },
    grok: {
      id: "grok",
      name: "Grok",
      hosts: ["grok.com", "x.com"],
      messageSelectors: [
        { selector: "[data-message-author-role]", role: (el) => normalizeRole(el.getAttribute("data-message-author-role")) },
        { selector: "[data-testid*='user' i]", role: inferRoleFromText },
        { selector: "[data-testid*='assistant' i]", role: inferRoleFromText },
        { selector: "[data-testid*='message' i]", role: inferRoleFromText },
        { selector: "[class*='user' i][class*='message' i]", role: () => "user" },
        { selector: "[class*='assistant' i][class*='message' i]", role: () => "assistant" },
        { selector: "[class*='message' i]", role: inferRoleFromText },
        { selector: "article", role: inferRoleFromText },
        { selector: "[role='article']", role: inferRoleFromText }
      ],
      composerSelectors: [
        "textarea",
        "[contenteditable='true']",
        "[role='textbox']",
        "[data-testid*='composer' i]",
        "[aria-label*='ask' i]",
        "[aria-label*='message' i]"
      ]
    }
  };

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === "PING_CONTENT_SCRIPT") {
      sendResponse({ ok: true });
      return false;
    }

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
    if (host === "x.com" && !location.pathname.startsWith("/i/grok")) return null;
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
      if (isFileLikeAnchor(anchor)) {
        blocks.push(extractFileBlock(anchor));
      } else {
        blocks.push({ type: "link", text: label, href });
      }
    });

    root.querySelectorAll("img").forEach((img) => {
      blocks.push({ type: "image", alt: img.alt || img.getAttribute("aria-label") || "", src: img.currentSrc || img.src || "" });
    });

    findFileElements(root).forEach((fileElement) => {
      const fileBlock = extractFileBlock(fileElement);
      if (fileBlock.name) blocks.push(fileBlock);
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

  function findFileElements(root) {
    const selector = [
      "[data-testid*='file' i]",
      "[data-testid*='attachment' i]",
      "[class*='file' i]",
      "[class*='attachment' i]",
      "[aria-label*='file' i]",
      "[aria-label*='attachment' i]",
      "[title*='file' i]",
      "[title*='attachment' i]",
      "a[download]",
      "a[href*='download' i]",
      "a[href*='attachment' i]",
      "a[href*='file' i]"
    ].join(",");

    return Array.from(root.querySelectorAll(selector))
      .filter((element) => element instanceof HTMLElement && isVisible(element));
  }

  function extractFileBlock(element) {
    const anchor = element.matches?.("a[href]") ? element : element.querySelector?.("a[href]");
    const href = anchor?.href || "";
    const downloadName = anchor?.getAttribute?.("download") || "";
    const aria = element.getAttribute?.("aria-label") || anchor?.getAttribute?.("aria-label") || "";
    const title = element.getAttribute?.("title") || anchor?.getAttribute?.("title") || "";
    const text = normalizedInnerText(element);
    const name = cleanFileName(downloadName || findFileName(text) || findFileName(aria) || findFileName(title) || fileNameFromUrl(href) || text || "Attached file");
    const size = findFileSize(`${text} ${aria} ${title}`);
    const mimeType = inferMimeType(name);
    const description = href ? "source link may require the original account session" : "source did not expose a downloadable link";

    return {
      type: "file",
      name,
      href: href || undefined,
      mimeType: mimeType || undefined,
      size: size || undefined,
      description
    };
  }

  function isFileLikeAnchor(anchor) {
    const href = anchor.href || "";
    const combined = `${href} ${anchor.getAttribute("download") || ""} ${normalizedInnerText(anchor)} ${anchor.getAttribute("aria-label") || ""} ${anchor.getAttribute("title") || ""}`;
    return Boolean(anchor.hasAttribute("download") || findFileName(combined) || /\/(download|attachment|file)s?\b/i.test(href));
  }

  function findFileName(text) {
    const match = String(text || "").match(/[\w .()[\]-]+\.(pdf|docx?|xlsx?|pptx?|csv|txt|md|json|zip|rar|7z|png|jpe?g|webp|gif|svg|mp3|mp4|mov|wav|py|js|ts|tsx|jsx|html|css)\b/i);
    return match?.[0]?.trim() || "";
  }

  function cleanFileName(name) {
    return String(name || "")
      .replace(/\s+/g, " ")
      .replace(/^(file|attachment)\s*:\s*/i, "")
      .trim()
      .slice(0, 180);
  }

  function fileNameFromUrl(url) {
    try {
      const parsed = new URL(url);
      const lastSegment = decodeURIComponent(parsed.pathname.split("/").filter(Boolean).at(-1) || "");
      return findFileName(lastSegment) || "";
    } catch {
      return "";
    }
  }

  function findFileSize(text) {
    const match = String(text || "").match(/\b\d+(?:\.\d+)?\s?(?:B|KB|MB|GB|TB)\b/i);
    return match?.[0] || "";
  }

  function inferMimeType(name) {
    const extension = String(name || "").split(".").pop()?.toLowerCase();
    const mimeTypes = {
      pdf: "application/pdf",
      doc: "application/msword",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      xls: "application/vnd.ms-excel",
      xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ppt: "application/vnd.ms-powerpoint",
      pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      csv: "text/csv",
      txt: "text/plain",
      md: "text/markdown",
      json: "application/json",
      zip: "application/zip",
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      webp: "image/webp",
      gif: "image/gif",
      svg: "image/svg+xml",
      mp3: "audio/mpeg",
      wav: "audio/wav",
      mp4: "video/mp4",
      mov: "video/quicktime"
    };
    return extension ? mimeTypes[extension] || "" : "";
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
    if (label.includes("assistant") || label.includes("model") || label.includes("claude") || label.includes("grok")) return "assistant";
    return "unknown";
  }

  function normalizeRole(role) {
    const value = String(role || "").toLowerCase();
    if (value.includes("user") || value.includes("human")) return "user";
    if (value.includes("assistant") || value.includes("model") || value.includes("bot") || value.includes("ai") || value.includes("grok")) return "assistant";
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
