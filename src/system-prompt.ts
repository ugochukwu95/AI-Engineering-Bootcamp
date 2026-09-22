// System-prompt chat — multi-turn conversation with a user-defined system prompt.
// The frontend sends a system prompt with each request to shape Claude's behavior.
import "dotenv/config";

import Anthropic from "@anthropic-ai/sdk";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { PORT, readBody, sendJson, serveHtml } from "./server-utils.js";

type Message = {
  role: "user" | "assistant";
  content: string;
};

const client = new Anthropic();
const model = "claude-sonnet-4-6";
const messages: Message[] = [];

function addUserMessage(messages: Message[], text: string) {
  messages.push({ role: "user", content: text });
}

function addAssistantMessage(messages: Message[], text: string) {
  messages.push({ role: "assistant", content: text });
}

async function chat(messages: Message[], systemPrompt?: string) {
  const response = await client.messages.create({
    model,
    max_tokens: 1000,
    ...(systemPrompt?.trim() ? { system: systemPrompt.trim() } : {}),
    messages,
  });

  const block = response.content[0];
  return block?.type === "text" ? block.text : "";
}

async function handleChat(req: IncomingMessage, res: ServerResponse) {
  try {
    const body = JSON.parse(await readBody(req)) as {
      message?: string;
      systemPrompt?: string;
    };

    if (!body.message?.trim()) {
      sendJson(res, 400, { error: "message is required" });
      return;
    }

    addUserMessage(messages, body.message);
    const response = await chat(messages, body.systemPrompt);
    addAssistantMessage(messages, response);

    sendJson(res, 200, { response });
  } catch (error) {
    if (messages.at(-1)?.role === "user") {
      messages.pop();
    }

    console.error(error);
    sendJson(res, 500, { error: "Failed to get response from Claude" });
  }
}

function handleReset(res: ServerResponse) {
  messages.length = 0;
  sendJson(res, 200, { ok: true });
}

createServer(async (req, res) => {
  const { method, url } = req;

  if (method === "GET" && (url === "/" || url === "/index.html")) {
    await serveHtml(res, "system-prompt.html");
    return;
  }

  if (method === "POST" && url === "/chat") {
    await handleChat(req, res);
    return;
  }

  if (method === "POST" && url === "/reset") {
    handleReset(res);
    return;
  }

  sendJson(res, 404, { error: "Not found" });
}).listen(PORT, () => {
  console.log(`System-prompt chat ready at http://localhost:${PORT}`);
});
