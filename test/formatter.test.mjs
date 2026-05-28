import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../extension/shared/formatter.js", import.meta.url), "utf8");
const context = { globalThis: {} };
vm.createContext(context);
vm.runInContext(source, context);

const { formatTransferPrompt, summarizeConversation } = context.globalThis.LLMBridgeFormatter;

const conversation = {
  provider: "chatgpt",
  providerName: "ChatGPT",
  sourceUrl: "https://chatgpt.com/c/example",
  title: "Planner",
  capturedAt: "2026-05-28T10:00:00.000Z",
  messages: [
    {
      id: "m1",
      role: "user",
      blocks: [{ type: "text", text: "Can you write code?" }]
    },
    {
      id: "m2",
      role: "assistant",
      blocks: [
        { type: "code", language: "js", text: "console.log('yes');" },
        { type: "link", text: "Docs", href: "https://example.com/docs" },
        { type: "table", markdown: "| A | B |\n| --- | --- |\n| 1 | 2 |" },
        { type: "image", alt: "diagram" },
        { type: "file", name: "brief.pdf" }
      ]
    }
  ]
};

assert.equal(summarizeConversation(conversation), "Planner - 2 messages from ChatGPT");

const prompt = formatTransferPrompt(conversation, "Claude");
assert.match(prompt, /importing a conversation from ChatGPT into Claude/);
assert.match(prompt, /--- Message 1: USER ---/);
assert.match(prompt, /```js\nconsole\.log\('yes'\);\n```/);
assert.match(prompt, /\[Docs\]\(https:\/\/example\.com\/docs\)/);
assert.match(prompt, /\| A \| B \|/);
assert.match(prompt, /\[Image: diagram\]/);
assert.match(prompt, /\[File: brief\.pdf\]/);
assert.match(prompt, /Please continue from here\./);

const emptyPrompt = formatTransferPrompt({ ...conversation, messages: [] }, "Gemini");
assert.match(emptyPrompt, /No extractable messages/);

console.log("Formatter tests passed.");
