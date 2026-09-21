// Multi-turn chat — the server keeps conversation history across requests.
// Claude sees every previous user and assistant message, so it can remember context.
import "dotenv/config";

// The official Anthropic SDK — lets us talk to Claude's API
import Anthropic from "@anthropic-ai/sdk";

// Node's built-in HTTP module — we use it to create a web server
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

// Shared helpers for reading request bodies, sending JSON, and serving HTML
import { PORT, readBody, sendJson, serveHtml } from "./server-utils.js";

// Shape of one message in the conversation history
type Message = {
  role: "user" | "assistant";
  content: string;
};

// Create a client that sends requests to Claude.
// It automatically reads ANTHROPIC_API_KEY from the environment.
const client = new Anthropic();

// Which Claude model to use for every request
const model = "claude-sonnet-4-6";

// Conversation history stored on the server — grows with each exchange
const messages: Message[] = [];

// Adds a user message to the conversation history array
function addUserMessage(messages: Message[], text: string) {
  const userMessage = {
    role: "user" as const,
    content: text,
  };

  messages.push(userMessage);
}

// Adds Claude's reply to the conversation history array
function addAssistantMessage(messages: Message[], text: string) {
  const assistantMessage = {
    role: "assistant" as const,
    content: text,
  };

  messages.push(assistantMessage);
}

// Sends the full conversation history to Claude and returns the text reply
async function chat(messages: Message[]) {
  const message = await client.messages.create({
    model,
    max_tokens: 1000, // limit how long the response can be
    messages, // the entire back-and-forth so far
  });

  // Claude's reply can contain multiple "blocks" — we grab the first text one
  const block = message.content[0];
  return block?.type === "text" ? block.text : "";
}

// Handles POST /chat — receives one new message, updates history, returns Claude's reply
async function handleChat(req: IncomingMessage, res: ServerResponse) {
  try {
    // Parse the JSON body — we expect something like: { "message": "Hello!" }
    const body = JSON.parse(await readBody(req)) as { message?: string };

    if (!body.message?.trim()) {
      sendJson(res, 400, { error: "message is required" });
      return;
    }

    // 1. Add the user's message to history
    addUserMessage(messages, body.message);

    // 2. Send full history to Claude
    const response = await chat(messages);

    // 3. Save Claude's reply to history
    addAssistantMessage(messages, response);

    sendJson(res, 200, { response });
  } catch (error) {
    // If Claude failed, remove the user message we just added
    if (messages.at(-1)?.role === "user") {
      messages.pop();
    }

    console.error(error);
    sendJson(res, 500, { error: "Failed to get response from Claude" });
  }
}

// createServer runs this function on every incoming request.
// req = the incoming request, res = the response we send back
createServer(async (req, res) => {
  const { method, url } = req;

  // GET / → serve the multi-turn chat UI in the browser
  if (method === "GET" && (url === "/" || url === "/index.html")) {
    await serveHtml(res, "multi-turn.html");
    return;
  }

  // POST /chat → append to history, call Claude, return the reply
  if (method === "POST" && url === "/chat") {
    await handleChat(req, res);
    return;
  }

  // Anything else gets a 404
  sendJson(res, 404, { error: "Not found" });
}).listen(PORT, () => {
  // This runs once when the server is ready to accept connections
  console.log(`Multi-turn chat ready at http://localhost:${PORT}`);
});
