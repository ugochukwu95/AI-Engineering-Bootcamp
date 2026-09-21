# Claude Chat App

A simple local chat app built with **Node.js**, **TypeScript**, and the **Anthropic API**. You type messages in a browser, and Claude replies.

There are two versions:

| Version | Command | What it does |
|---------|---------|--------------|
| **Multi-turn** (default) | `npm run dev` | Claude remembers earlier messages in the conversation |
| **Single-turn** | `npm run dev:single` | Each message is independent — no memory |

---

## What you need

- [Node.js](https://nodejs.org/) (LTS version recommended)
- An [Anthropic API key](https://console.anthropic.com/)

---

## Setup

**1. Install dependencies**

```bash
npm install
```

**2. Add your API key**

Create a `.env` file in the project root:

```
ANTHROPIC_API_KEY=your-key-here
```

> Never commit your `.env` file or share your API key.

**3. Start the server**

```bash
npm run dev
```

**4. Open the chat UI**

Go to [http://localhost:3000](http://localhost:3000) in your browser.

---

## Available commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Run multi-turn chat with auto-reload on file changes |
| `npm run dev:single` | Run single-turn chat with auto-reload |
| `npm run dev:multi` | Same as `npm run dev` |
| `npm start` | Run multi-turn chat (no auto-reload) |
| `npm run start:single` | Run single-turn chat (no auto-reload) |

You can change the port by adding to `.env`:

```
PORT=3000
```

---

## Project structure

```
├── src/
│   ├── single-turn.ts    # Server: one message at a time, no history
│   ├── multi-turn.ts     # Server: keeps conversation history
│   └── server-utils.ts   # Shared helpers (reading requests, sending JSON)
├── public/
│   ├── single-turn.html  # Browser UI for single-turn mode
│   └── multi-turn.html   # Browser UI for multi-turn mode
├── .env                  # Your API key (not committed to git)
├── package.json          # Dependencies and scripts
└── tsconfig.json         # TypeScript settings
```

---

## How it works

```
Browser  →  POST /chat  →  Node.js server  →  Claude API  →  reply back to browser
```

1. You type a message in the browser and click **Send**.
2. The browser sends a `POST` request to `/chat`.
3. The server forwards the message (and history, in multi-turn mode) to Claude.
4. Claude's reply is sent back as JSON and shown in the chat UI.

### Single-turn vs multi-turn

**Single-turn** — each request sends only the latest message:

```json
{ "message": "Hello!" }
```

Claude has no memory of previous messages.

**Multi-turn** — the server keeps a `messages` array in memory. On each request it:

1. Adds your message with `addUserMessage()`
2. Sends the full history to Claude with `chat()`
3. Saves Claude's reply with `addAssistantMessage()`

Try it: say *"My name is Alex"*, then ask *"What's my name?"* — multi-turn will remember; single-turn will not.

---

## Testing with curl

**Multi-turn** (server must be running with `npm run dev`):

```bash
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello!"}'
```

**Single-turn** (server must be running with `npm run dev:single`):

```bash
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello!"}'
```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `EADDRINUSE` — port already in use | Stop the other server or set a different `PORT` in `.env` |
| `Failed to get response from Claude` | Check your API key in `.env` |
| Claude doesn't remember earlier messages | Make sure you're running multi-turn (`npm run dev`), not single-turn |
| Changes not showing up | Restart the dev server, or use `npm run dev` which auto-reloads |
