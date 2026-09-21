import { type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const PORT = Number(process.env.PORT) || 3000;

export const publicDir = join(dirname(fileURLToPath(import.meta.url)), "..", "public");

export function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];

    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
    req.on("error", reject);
  });
}

export function sendJson(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

export async function serveHtml(res: ServerResponse, filename: string) {
  try {
    const html = await readFile(join(publicDir, filename), "utf-8");
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(html);
  } catch {
    sendJson(res, 500, { error: "Could not load chat UI" });
  }
}
