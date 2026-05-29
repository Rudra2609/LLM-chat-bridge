export type ProviderId = "chatgpt" | "gemini" | "claude" | "deepseek";

export type MessageRole = "user" | "assistant" | "system" | "unknown";

export type RichBlock =
  | { type: "text"; text: string }
  | { type: "code"; text: string; language?: string }
  | { type: "link"; text: string; href: string }
  | { type: "table"; markdown: string }
  | { type: "image"; alt?: string; src?: string }
  | { type: "file"; name: string; href?: string; mimeType?: string; size?: string; description?: string }
  | { type: "math"; text: string };

export interface NormalizedMessage {
  id: string;
  role: MessageRole;
  blocks: RichBlock[];
}

export interface NormalizedConversation {
  provider: ProviderId;
  providerName: string;
  sourceUrl: string;
  title: string;
  capturedAt: string;
  messages: NormalizedMessage[];
}

export interface TransferPayload {
  source: NormalizedConversation;
  destination: ProviderId;
  prompt: string;
}

export interface FillResult {
  ok: boolean;
  reason?: string;
}

export interface ComposerTarget {
  element: HTMLTextAreaElement | HTMLElement;
  kind: "textarea" | "contenteditable";
}

export interface ProviderAdapter {
  id: ProviderId;
  name: string;
  originPatterns: string[];
  detectConversation(): boolean;
  extractConversation(): NormalizedConversation;
  findComposer(): ComposerTarget | null;
  fillComposer(payload: TransferPayload): FillResult;
}
