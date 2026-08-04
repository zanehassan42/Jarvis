import "dotenv/config";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import cors from "cors";
import { query } from "@anthropic-ai/claude-agent-sdk";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 3000;

const VANTA_SYSTEM_PROMPT = `You are Vanta, a warm, capable voice assistant speaking directly to the user out loud.

- Speak naturally and conversationally, the way a person would talk, not the way a document would read.
- Never use markdown formatting: no asterisks, headers, bullet lists, or numbered lists. Everything you say gets read aloud by text-to-speech, so any symbols will be spoken as literal words.
- Keep replies reasonably concise unless the user is explicitly asking for depth or detail.
- You remember the conversation so far in this session and can refer back to it naturally.`;

// Single in-memory session ID for this personal, single-user assistant.
// Each reply's session_id is stored here and passed as `resume` on the next
// call so Claude retains the conversation history between turns.
let currentSessionId = null;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.post("/chat", async (req, res) => {
  const { message } = req.body;

  if (!message || typeof message !== "string") {
    return res.status(400).json({ error: "Request body must include a 'message' string." });
  }

  try {
    let reply = "";

    // query() streams a series of SDK messages back from Claude Code's agent
    // loop. It authenticates using the same credentials as the `claude` CLI
    // (an existing `claude login` session) rather than requiring
    // ANTHROPIC_API_KEY to be set.
    for await (const sdkMessage of query({
      prompt: message,
      options: {
        // No tool access needed for a simple chat reply — keeps responses
        // fast and prevents the agent from touching the filesystem/shell.
        tools: [],
        maxTurns: 1,
        systemPrompt: VANTA_SYSTEM_PROMPT,
        // Resume the ongoing conversation if we have one, so Vanta
        // remembers what was said earlier in this session.
        ...(currentSessionId ? { resume: currentSessionId } : {}),
      },
    })) {
      if (sdkMessage.session_id) {
        currentSessionId = sdkMessage.session_id;
      }

      if (sdkMessage.type === "result") {
        if (sdkMessage.subtype === "success") {
          reply = sdkMessage.result;
        } else {
          throw new Error(`Claude query failed: ${sdkMessage.subtype}`);
        }
      }
    }

    res.json({ response: reply });
  } catch (err) {
    console.error("Error querying Claude:", err);
    res.status(500).json({ error: "Failed to get a response from Claude." });
  }
});

// Starts a brand-new conversation — forgets everything said so far.
app.post("/reset", (req, res) => {
  currentSessionId = null;
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Vanta server listening on http://localhost:${PORT}`);
});
