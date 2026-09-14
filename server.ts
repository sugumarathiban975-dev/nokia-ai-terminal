import express from "express";
import path from "path";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import { createServer as createViteServer } from "vite";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

let geminiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return null;
  }
  if (!geminiClient) {
    geminiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return geminiClient;
}

// Health check endpoint
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
  });
});

// AI Chat endpoint
app.post("/api/chat", async (req, res) => {
  try {
    const { message, model = "gemini", mode = "live" } = req.body;

    if (!message || typeof message !== "string") {
      res.status(400).json({ error: "Message string is required" });
      return;
    }

    // Explicit Phase 1 simulation mode or non-gemini model without external setup
    if (mode === "phase1" || model === "chatgpt") {
      const response =
        model === "chatgpt"
          ? "ChatGPT service bridge is reserved for Phase 2 Android link. Switch to Google Gemini for live AI responses."
          : "Backend not connected yet. Phase 2 will connect this terminal to your Android phone.";
      res.json({
        sender: model === "chatgpt" ? "CHATGPT" : "SYSTEM",
        text: response,
        className: "system",
      });
      return;
    }

    const ai = getGeminiClient();
    if (!ai) {
      // Graceful fallback if GEMINI_API_KEY is not configured yet
      res.json({
        sender: "GEMINI",
        text: "Backend not connected yet. Phase 2 will connect this terminal to your Android phone (Add GEMINI_API_KEY to activate live AI).",
        className: "system",
      });
      return;
    }

    // Call Gemini with timeout
    const systemInstruction =
      "You are an AI assistant responding inside a Nokia 225 4G lightweight terminal interface. " +
      "Provide clear, helpful, compact answers (typically 2-4 sentences, under 120 words). " +
      "Avoid markdown tables or raw HTML. Use clean plain text.";

    const fetchGemini = async (): Promise<string> => {
      try {
        const result = await ai.models.generateContent({
          model: "gemini-3.6-flash",
          contents: message,
          config: {
            systemInstruction,
            temperature: 0.7,
          },
        });
        return result.text || "No response received.";
      } catch (err: any) {
        console.warn("Primary model attempt failed, trying fallback:", err?.message);
        const result = await ai.models.generateContent({
          model: "gemini-3.8-flash",
          contents: message,
          config: {
            systemInstruction,
            temperature: 0.7,
          },
        });
        return result.text || "No response received.";
      }
    };

    const timeoutPromise = new Promise<string>((_, reject) =>
      setTimeout(() => reject(new Error("AI Gateway timeout")), 15000)
    );

    let replyText = "";
    let senderName = "GEMINI";
    let messageClass = "ai";

    try {
      replyText = await Promise.race([fetchGemini(), timeoutPromise]);
    } catch (err: any) {
      console.warn("Gemini service unavailable/busy:", err?.message);
      // Clean fallback if API is experiencing temporary spikes
      replyText =
        "Backend not connected yet. Phase 2 will connect this terminal to your Android phone.";
      senderName = "SYSTEM";
      messageClass = "system";
    }

    res.json({
      sender: senderName,
      text: replyText,
      className: messageClass,
    });
  } catch (error: any) {
    console.error("Error handling /api/chat:", error);
    res.json({
      sender: "SYSTEM",
      text: "Nokia AI Bridge: Service temporarily unavailable. Please retry.",
      className: "system",
    });
  }
});

// Vite middleware / static files setup
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Nokia 225 AI Terminal running at http://localhost:${PORT}`);
  });
}

startServer();
