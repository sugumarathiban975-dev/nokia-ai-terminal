export interface ChatMessage {
  id?: string;
  sender: string;
  text: string;
  className: "you" | "ai" | "system" | "error";
  time?: string;
}

export interface ChatSession {
  id: string;
  title: string;
  created: string;
  messages: ChatMessage[];
}

export type TerminalPanel = "chat-panel" | "history-panel";

export type AiModel = "gemini" | "chatgpt";
