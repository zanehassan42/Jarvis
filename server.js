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
- Never include links, URLs, or a "Sources" section. If you use web search, fold what you learned into plain spoken sentences, the way a person would casually mention where they heard something ("saw on the news that...") without reading out a web address.
- Be brief. Default to one or two short sentences. Only go longer if the user explicitly asks for detail, a list, or an explanation.
- You remember the conversation so far in this session and can refer back to it naturally.
- You have a web search tool. Use it whenever the answer depends on current information — news, prices, schedules, recent events, or anything you're not confident about from memory alone. Don't mention the tool itself or narrate that you're searching; just answer naturally once you have the information.`;

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
        // Only the web search tool is available — no filesystem or shell
        // access, since this responds to spoken voice input. allowedTools
        // auto-approves it so the server never blocks on a permission
        // prompt it can't answer.
        tools: ["WebSearch"],
        allowedTools: ["WebSearch"],
        // A web search reply takes a couple of turns (search, then answer),
        // vs. 1 for a plain chat reply.
        maxTurns: 5,
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
