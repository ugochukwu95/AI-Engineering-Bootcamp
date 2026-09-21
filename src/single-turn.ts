// Single-turn chat — each request sends one message with no conversation history.
// Claude only sees the latest message; earlier messages in the UI are not remembered.
import "dotenv/config";

// The official Anthropic SDK — lets us talk to Claude's API
import Anthropic from "@anthropic-ai/sdk";

// Node's built-in HTTP module — we use it to create a web server
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

// Shared helpers for reading request bodies, sending JSON, and serving HTML
import { PORT, readBody, sendJson, serveHtml } from "./server-utils.js";

// Create a client that sends requests to Claude.
// It automatically reads ANTHROPIC_API_KEY from the environment.
const client = new Anthropic();

// Which Claude model to use for every request
const model = "claude-sonnet-4-6";

// Sends a single user message to Claude and returns the text reply.
// Unlike multi-turn, we always send just one message — no history.
async function chat(message: string) {
  const response = await client.messages.create({
    model,
    max_tokens: 1000, // limit how long the response can be
    messages: [{ role: "user", content: message }],
  });

  // Claude's reply can contain multiple "blocks" — we grab the first text one
  const block = response.content[0];
  return block?.type === "text" ? block.text : "";
}

// Handles POST /chat — receives one message and returns Claude's reply
async function handleChat(req: IncomingMessage, res: ServerResponse) {
  try {
    // Parse the JSON body — we expect something like: { "message": "Hello!" }
    const body = JSON.parse(await readBody(req)) as { message?: string };

    // Validate that the client actually sent a message
    if (!body.message?.trim()) {
      sendJson(res, 400, { error: "message is required" });
      return;
    }

    const response = await chat(body.message);

    sendJson(res, 200, { response });
  } catch (error) {
    // Log the error for debugging, then send a generic error to the client
    console.error(error);
    sendJson(res, 500, { error: "Failed to get response from Claude" });
  }
}

// createServer runs this function on every incoming request.
// req = the incoming request, res = the response we send back
createServer(async (req, res) => {
  const { method, url } = req;

  // GET / → serve the single-turn chat UI in the browser
  if (method === "GET" && (url === "/" || url === "/index.html")) {
    await serveHtml(res, "single-turn.html");
    return;
  }

  // POST /chat → send one message to Claude and return the reply
  if (method === "POST" && url === "/chat") {
    await handleChat(req, res);
    return;
  }

  // Anything else gets a 404
  sendJson(res, 404, { error: "Not found" });
}).listen(PORT, () => {
  // This runs once when the server is ready to accept connections
  console.log(`Single-turn chat ready at http://localhost:${PORT}`);
});
