import "dotenv/config";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import cors from "cors";
import { query } from "@anthropic-ai/claude-agent-sdk";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 3000;

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
      },
    })) {
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

app.listen(PORT, () => {
  console.log(`Jarvis server listening on http://localhost:${PORT}`);
});
