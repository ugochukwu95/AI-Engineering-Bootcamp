// Tool-calling chat — Claude can request actions from our software.
//
// Think of it like a customer service rep (Claude) who doesn't have direct access
// to your order system or weather app. Instead, they can *ask your software* to
// look things up, then use that info to answer the customer.
//
// Flow:
//   1. User asks: "What's the status of order ORD-1001?"
//   2. Claude decides it needs data → sends a "tool call" (e.g. lookup_order)
//   3. Our code runs that function and returns the result
//   4. Claude reads the result and writes a natural-language reply
import "dotenv/config";

// The official Anthropic SDK — lets us talk to Claude's API
import Anthropic from "@anthropic-ai/sdk";

// Node's built-in HTTP module — we use it to create a web server
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

// Shared helpers for reading request bodies, sending JSON, and serving HTML
import { PORT, readBody, sendJson, serveHtml } from "./server-utils.js";

// A message in the conversation — can be plain text or tool-related data
type Message = Anthropic.MessageParam;

// One tool call we want to show in the UI (name, what Claude asked for, what we returned)
type ToolCallEvent = {
  name: string;
  input: unknown;
  result: unknown;
};

// Create a client that sends requests to Claude.
// It automatically reads ANTHROPIC_API_KEY from the environment.
const client = new Anthropic();

// Which Claude model to use for every request
const model = "claude-sonnet-4-6";

// Conversation history stored on the server — grows with each exchange
const messages: Message[] = [];

// ---------------------------------------------------------------------------
// TOOLS — we tell Claude what actions it is allowed to request.
// Each tool has a name, a plain-English description, and the inputs it needs.
// Claude reads these and decides *when* to call them based on the user's question.
// ---------------------------------------------------------------------------
const tools: Anthropic.Tool[] = [
  {
    name: "lookup_order",
    description: "Look up the status and details of a customer order by order ID.",
    input_schema: {
      type: "object",
      properties: {
        order_id: {
          type: "string",
          description: "The order ID, e.g. ORD-1001",
        },
      },
      required: ["order_id"],
    },
  },
  {
    name: "get_weather",
    description: "Get the current weather for a city.",
    input_schema: {
      type: "object",
      properties: {
        city: {
          type: "string",
          description: "City name, e.g. London",
        },
      },
      required: ["city"],
    },
  },
];

// ---------------------------------------------------------------------------
// MOCK DATA — fake databases for the demo.
// In a real app these would be API calls or database queries.
// ---------------------------------------------------------------------------
const ORDERS: Record<
  string,
  { status: string; items: string[]; estimated_delivery: string; customer: string }
> = {
  "ORD-1001": {
    status: "shipped",
    items: ["Blue T-shirt (M)", "Wool socks (3-pack)"],
    estimated_delivery: "Sep 26, 2026",
    customer: "Alex Chen",
  },
  "ORD-1002": {
    status: "processing",
    items: ["Wireless headphones"],
    estimated_delivery: "Sep 28, 2026",
    customer: "Sam Rivera",
  },
  "ORD-1003": {
    status: "delivered",
    items: ["Coffee mug", "Notebook"],
    estimated_delivery: "Sep 20, 2026",
    customer: "Jordan Lee",
  },
};

const WEATHER: Record<string, { temp_c: number; condition: string }> = {
  london: { temp_c: 16, condition: "Cloudy with light rain" },
  paris: { temp_c: 20, condition: "Sunny" },
  "new york": { temp_c: 22, condition: "Partly cloudy" },
  tokyo: { temp_c: 26, condition: "Humid, scattered showers" },
  lagos: { temp_c: 37, condition: "Desert heat, sunny." },
};

// Looks up an order in our fake database and returns its details
function lookupOrder(orderId: string) {
  const id = orderId.trim().toUpperCase();
  const order = ORDERS[id];

  if (!order) {
    return { error: `No order found with ID ${orderId}` };
  }

  return { order_id: id, ...order };
}

// Returns weather for a city — uses preset data, or a generic fallback
function getWeather(city: string) {
  const key = city.trim().toLowerCase();
  const weather = WEATHER[key] ?? { temp_c: 18, condition: "Clear skies" };

  return { city: city.trim(), ...weather };
}

// Routes a tool call to the right function based on its name
function runTool(name: string, input: unknown): unknown {
  if (name === "lookup_order") {
    const { order_id } = input as { order_id?: string };
    if (!order_id) return { error: "order_id is required" };
    return lookupOrder(order_id);
  }

  if (name === "get_weather") {
    const { city } = input as { city?: string };
    if (!city) return { error: "city is required" };
    return getWeather(city);
  }

  return { error: `Unknown tool: ${name}` };
}

// Pulls the readable text out of Claude's response (ignoring tool-use blocks)
function extractText(content: Anthropic.ContentBlock[]): string {
  return content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}

// Sends the conversation to Claude and handles the tool-calling loop.
//
// Claude may reply in two ways:
//   - With plain text → we're done, return it to the user
//   - With a tool call → run the tool, send the result back, and ask Claude again
//
// This loop can repeat (e.g. Claude calls weather AND order lookup before answering).
async function chat(messages: Message[]) {
  const toolCalls: ToolCallEvent[] = [];

  // Safety limit — normally 1–2 rounds, but allow up to 5 for complex questions
  for (let step = 0; step < 5; step++) {
    const response = await client.messages.create({
      model,
      max_tokens: 1000,
      tools, // tell Claude which tools it can use
      messages,
    });

    // Claude finished with a normal text reply — no more tools needed
    if (response.stop_reason !== "tool_use") {
      return { text: extractText(response.content), toolCalls };
    }

    // Claude wants to call one or more tools — save its request to history
    messages.push({ role: "assistant", content: response.content });

    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    // Run each tool Claude asked for and collect the results
    for (const block of response.content) {
      if (block.type !== "tool_use") continue;

      const result = runTool(block.name, block.input);
      toolCalls.push({ name: block.name, input: block.input, result });
      toolResults.push({
        type: "tool_result",
        tool_use_id: block.id, // links this result back to Claude's request
        content: JSON.stringify(result),
      });
    }

    // Send the tool results back to Claude as if the user provided them
    messages.push({ role: "user", content: toolResults });
    // Loop continues — Claude will now read the results and reply (or call more tools)
  }

  throw new Error("Too many tool-calling rounds");
}

// Handles POST /chat — receives one new message, runs the tool loop, returns the reply
async function handleChat(req: IncomingMessage, res: ServerResponse) {
  try {
    const body = JSON.parse(await readBody(req)) as { message?: string };

    if (!body.message?.trim()) {
      sendJson(res, 400, { error: "message is required" });
      return;
    }

    messages.push({ role: "user", content: body.message });
    const { text, toolCalls } = await chat(messages);
    messages.push({ role: "assistant", content: text });

    // toolCalls is sent to the frontend so we can show the yellow "Claude called …" bubbles
    sendJson(res, 200, { response: text, toolCalls });
  } catch (error) {
    // If something failed, undo the user message we just added
    if (messages.at(-1)?.role === "user") {
      messages.pop();
    }

    console.error(error);
    sendJson(res, 500, { error: "Failed to get response from Claude" });
  }
}

// Clears conversation history when the user clicks "New chat"
function handleReset(res: ServerResponse) {
  messages.length = 0;
  sendJson(res, 200, { ok: true });
}

// createServer runs this function on every incoming request.
// req = the incoming request, res = the response we send back
createServer(async (req, res) => {
  const { method, url } = req;

  // GET / → serve the tool-calling chat UI in the browser
  if (method === "GET" && (url === "/" || url === "/index.html")) {
    await serveHtml(res, "tool-calling.html");
    return;
  }

  // POST /chat → send message to Claude (with tool loop), return the reply
  if (method === "POST" && url === "/chat") {
    await handleChat(req, res);
    return;
  }

  // POST /reset → clear conversation history
  if (method === "POST" && url === "/reset") {
    handleReset(res);
    return;
  }

  sendJson(res, 404, { error: "Not found" });
}).listen(PORT, () => {
  console.log(`Tool-calling chat ready at http://localhost:${PORT}`);
});
