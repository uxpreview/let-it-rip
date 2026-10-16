// Local preview: serves the site and runs api/spots.js against a JSON file in .data/.
//   npm run dev   ->  http://localhost:3200
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
process.chdir(root);
const api = await import("../api/spots.js");
// Same response headers as production (vercel.json), so the content security policy is tested too.
const rules = JSON.parse(await readFile(join(root, "vercel.json"), "utf8")).headers.map((r) => ({
  test: new RegExp(`^${r.source}$`),
  headers: Object.fromEntries(r.headers.map((h) => [h.key, h.value])),
}));
const headersFor = (path) => Object.assign({}, ...rules.filter((r) => r.test.test(path)).map((r) => r.headers));
const port = Number(process.env.PORT) || 3200;
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === "/api/spots") {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const request = new Request(url, {
      method: req.method,
      headers: req.headers,
      body: ["GET", "HEAD"].includes(req.method) ? undefined : Buffer.concat(chunks),
    });
    const handler = api[req.method];
    const response = handler ? await handler(request) : new Response("Method not allowed", { status: 405 });
    res.writeHead(response.status, { ...headersFor(url.pathname), ...Object.fromEntries(response.headers) });
    res.end(Buffer.from(await response.arrayBuffer()));
    return;
  }
  let path = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
  if (path.endsWith("/")) path += "index.html";
  const file = join(root, path);
  try {
    if (!(await stat(file)).isFile()) throw new Error();
    res.writeHead(200, { ...headersFor(url.pathname), "content-type": types[extname(file)] || "application/octet-stream" });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("Not found");
  }
}).listen(port, () => console.log(`Wheel running at http://localhost:${port}`));
