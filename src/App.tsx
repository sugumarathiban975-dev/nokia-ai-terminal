import React, { useState, useEffect, useRef } from "react";
import { ChatMessage, ChatSession, TerminalPanel, AiModel } from "./types";

const STORAGE_KEY = "nokia_ai_history";

export default function App() {
  const [activePanel, setActivePanel] = useState<TerminalPanel>("chat-panel");
  const [model, setModel] = useState<AiModel>("gemini");
  const [inputMessage, setInputMessage] = useState<string>("");
  const [status, setStatus] = useState<string>("Status: Ready");
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [confirmClearAll, setConfirmClearAll] = useState<boolean>(false);

  // Current active chat session
  const [currentChat, setCurrentChat] = useState<ChatSession>(() => {
    return {
      id: String(new Date().getTime()),
      title: "New Chat",
      created: new Date().toLocaleString(),
      messages: [
        {
          sender: "System",
          text: "Nokia AI Terminal ready.",
          className: "system",
          time: new Date().toLocaleString(),
        },
      ],
    };
  });

  // Saved history in localStorage
  const [savedHistories, setSavedHistories] = useState<ChatSession[]>([]);

  const chatContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load history from localStorage on startup
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setSavedHistories(parsed);
        }
      }
    } catch {
      setStatus("Status: History storage unavailable");
    }
  }, []);

  // Auto scroll chat to bottom when messages update
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [currentChat.messages, isProcessing]);

  // Focus input when switching to chat panel
  useEffect(() => {
    if (activePanel === "chat-panel" && inputRef.current) {
      inputRef.current.focus();
    }
  }, [activePanel]);

  // Save conversation into localStorage
  const persistHistories = (updatedHistories: ChatSession[]) => {
    try {
      const trimmed = updatedHistories.slice(0, 20);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
      setSavedHistories(trimmed);
    } catch {
      setStatus("Status: History storage unavailable");
    }
  };

  const saveChatToHistory = (chatToSave: ChatSession) => {
    // Only save if it has meaningful messages beyond the initial system prompt
    const hasUserMessages = chatToSave.messages.some(
      (m) => m.sender === "YOU"
    );
    if (!hasUserMessages) return;

    setSavedHistories((prev) => {
      const existingIndex = prev.findIndex((item) => item.id === chatToSave.id);
      let nextList: ChatSession[];
      if (existingIndex >= 0) {
        nextList = [...prev];
        nextList[existingIndex] = chatToSave;
      } else {
        nextList = [chatToSave, ...prev];
      }
      persistHistories(nextList);
      return nextList.slice(0, 20);
    });
  };

  // Start new chat
  const handleNewChat = () => {
    // Save current conversation first
    saveChatToHistory(currentChat);

    const freshChat: ChatSession = {
      id: String(new Date().getTime()),
      title: "New Chat",
      created: new Date().toLocaleString(),
      messages: [
        {
          sender: "SYSTEM",
          text: "New conversation started.",
          className: "system",
          time: new Date().toLocaleString(),
        },
      ],
    };

    setCurrentChat(freshChat);
    setInputMessage("");
    setStatus("Status: Ready");
    setActivePanel("chat-panel");
    setConfirmClearAll(false);

    setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
  };

  // Send message
  const handleSendMessage = async () => {
    const text = inputMessage.trim();
    if (!text || isProcessing) return;

    const userMessage: ChatMessage = {
      sender: "YOU",
      text: text,
      className: "you",
      time: new Date().toLocaleString(),
    };

    // Determine new title if this is the first user message
    let newTitle = currentChat.title;
    if (newTitle === "New Chat") {
      newTitle = text.substring(0, 35);
      if (text.length > 35) {
        newTitle += "...";
      }
    }

    const updatedMessages = [...currentChat.messages, userMessage];
    const updatedChat: ChatSession = {
      ...currentChat,
      title: newTitle,
      messages: updatedMessages,
    };

    setCurrentChat(updatedChat);
    setInputMessage("");
    setIsProcessing(true);
    setStatus("Status: Processing...");

    try {
      // Call server backend API
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: text,
          model: model,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }

      const data = await response.json();

      const aiMessage: ChatMessage = {
        sender: data.sender || (model === "gemini" ? "GEMINI" : "CHATGPT"),
        text:
          data.text ||
          "Backend not connected yet. Phase 2 will connect this terminal to your Android phone.",
        className: data.className || "ai",
        time: new Date().toLocaleString(),
      };

      const finalChat: ChatSession = {
        ...updatedChat,
        messages: [...updatedMessages, aiMessage],
      };

      setCurrentChat(finalChat);
      saveChatToHistory(finalChat);
      setStatus("Status: Ready");
    } catch (err: any) {
      console.warn("API request fallback:", err);
      // Fallback response matching Phase 1 spec
      const fallbackMsg: ChatMessage = {
        sender: model === "gemini" ? "GEMINI" : "SYSTEM",
        text:
          "Backend not connected yet. Phase 2 will connect this terminal to your Android phone.",
        className: "system",
        time: new Date().toLocaleString(),
      };

      const finalChat: ChatSession = {
        ...updatedChat,
        messages: [...updatedMessages, fallbackMsg],
      };

      setCurrentChat(finalChat);
      saveChatToHistory(finalChat);
      setStatus("Status: Ready");
    } finally {
      setIsProcessing(false);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Load a chat from history
  const handleLoadChat = (id: string) => {
    const found = savedHistories.find((item) => item.id === id);
    if (found) {
      setCurrentChat(found);
      setStatus("Status: Chat loaded");
      setActivePanel("chat-panel");
      setConfirmClearAll(false);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  };

  // Delete a single chat from history
  const handleDeleteChat = (id: string) => {
    const updated = savedHistories.filter((item) => item.id !== id);
    persistHistories(updated);

    // If deleting currently active chat, reset to fresh chat
    if (currentChat.id === id) {
      const resetChat: ChatSession = {
        id: String(new Date().getTime()),
        title: "New Chat",
        created: new Date().toLocaleString(),
        messages: [
          {
            sender: "SYSTEM",
            text: "Conversation deleted.",
            className: "system",
            time: new Date().toLocaleString(),
          },
        ],
      };
      setCurrentChat(resetChat);
    }
  };

  // Clear all history
  const handleClearAllHistory = () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
      setSavedHistories([]);
      setConfirmClearAll(false);
      setStatus("Status: History deleted");
    } catch {
      setStatus("Status: Error clearing history");
    }
  };

  return (
    <div className="terminal">
      {/* =================================================
           HEADER
           ================================================= */}
      <div className="terminal-header header">
        <div className="terminal-title title">NOKIA 225 AI TERMINAL</div>
        <div className="terminal-subtitle subtitle">
          Lightweight AI Interface
        </div>
      </div>

      {/* STATUS */}
      <div id="status" className="terminal-status status">
        <span>{status}</span>
        <span className="text-[10px] text-gray-500 font-mono">
          {model === "gemini" ? "Google Gemini" : "ChatGPT"}
        </span>
      </div>

      {/* =================================================
           TABS
           ================================================= */}
      <div className="terminal-tabs tabs">
        <button
          id="chat-tab"
          className={`terminal-tab-button tab-button ${
            activePanel === "chat-panel" ? "active" : ""
          }`}
          onClick={() => {
            setActivePanel("chat-panel");
            setConfirmClearAll(false);
          }}
        >
          CHAT
        </button>

        <button
          id="history-tab"
          className={`terminal-tab-button tab-button ${
            activePanel === "history-panel" ? "active" : ""
          }`}
          onClick={() => {
            setActivePanel("history-panel");
            setConfirmClearAll(false);
          }}
        >
          HISTORY ({savedHistories.length})
        </button>
      </div>

      {/* =================================================
           CHAT PANEL
           ================================================= */}
      {activePanel === "chat-panel" && (
        <div id="chat-panel" className="panel active">
          {/* MODEL SELECT */}
          <label htmlFor="model" className="terminal-label">
            AI Model:
          </label>
          <select
            id="model"
            className="terminal-select"
            value={model}
            onChange={(e) => setModel(e.target.value as AiModel)}
          >
            <option value="gemini">Google Gemini</option>
            <option value="chatgpt">ChatGPT</option>
          </select>

          {/* CHAT WINDOW */}
          <div
            id="chat"
            className="terminal-chat chat"
            ref={chatContainerRef}
            aria-live="polite"
          >
            {currentChat.messages.map((msg, idx) => (
              <div
                key={idx}
                className={`terminal-message message ${msg.className}`}
              >
                <b>{msg.sender}: </b>
                <span>{msg.text}</span>
              </div>
            ))}
            {isProcessing && (
              <div className="terminal-message message system italic">
                <b>{model.toUpperCase()}: </b>
                <span>Connecting to terminal bridge...</span>
              </div>
            )}
          </div>

          {/* MESSAGE INPUT */}
          <input
            id="message"
            ref={inputRef}
            type="text"
            className="terminal-input"
            maxLength={500}
            placeholder="Type your message..."
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyDown={handleKeyPress}
            disabled={isProcessing}
            autoFocus
          />

          {/* COUNTER */}
          <div id="counter" className="terminal-counter counter">
            {inputMessage.length} / 500
          </div>

          {/* SEND BUTTON */}
          <button
            id="send"
            className="terminal-button"
            onClick={handleSendMessage}
            disabled={isProcessing || !inputMessage.trim()}
          >
            {isProcessing ? "PROCESSING..." : "SEND"}
          </button>

          {/* NEW CHAT BUTTON */}
          <button
            className="terminal-button"
            onClick={handleNewChat}
            disabled={isProcessing}
          >
            NEW CHAT
          </button>
        </div>
      )}

      {/* =================================================
           HISTORY PANEL
           ================================================= */}
      {activePanel === "history-panel" && (
        <div id="history-panel" className="panel active">
          <div className="terminal-history-title history-title">CHAT HISTORY</div>

          {confirmClearAll && (
            <div className="terminal-confirm-box" role="alert">
              <p>Delete all saved conversations?</p>
              <div className="terminal-confirm-actions">
                <button
                  className="terminal-button"
                  style={{
                    backgroundColor: "#aa0000",
                    color: "#ffffff",
                    fontWeight: "bold",
                  }}
                  onClick={handleClearAllHistory}
                >
                  CONFIRM DELETE
                </button>
                <button
                  className="terminal-button"
                  onClick={() => setConfirmClearAll(false)}
                >
                  CANCEL
                </button>
              </div>
            </div>
          )}

          <div id="history-list">
            {savedHistories.length === 0 ? (
              <div className="terminal-history-empty history-empty">
                No saved conversations.
              </div>
            ) : (
              savedHistories.map((history) => (
                <div
                  key={history.id}
                  className="terminal-history-item history-item"
                >
                  <div className="terminal-history-name history-name">
                    {history.title}
                  </div>
                  <div className="terminal-history-date history-date">
                    {history.created} • {history.messages.length} messages
                  </div>
                  <div className="terminal-history-actions history-actions">
                    <button
                      className="terminal-button"
                      onClick={() => handleLoadChat(history.id)}
                    >
                      OPEN
                    </button>
                    <button
                      className="terminal-button"
                      onClick={() => handleDeleteChat(history.id)}
                    >
                      DELETE
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <button
            className="terminal-button"
            onClick={() => {
              if (savedHistories.length > 0) {
                setConfirmClearAll(true);
              }
            }}
            disabled={savedHistories.length === 0}
          >
            DELETE ALL HISTORY
          </button>

          <button
            className="terminal-button"
            onClick={() => {
              setActivePanel("chat-panel");
              setConfirmClearAll(false);
            }}
          >
            BACK TO CHAT
          </button>
        </div>
      )}

      {/* FOOTER */}
      <div className="terminal-footer footer">
        Nokia AI Terminal • Phase 1
      </div>
    </div>
  );
}
