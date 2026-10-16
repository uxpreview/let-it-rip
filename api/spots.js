// The shared list of spots, stored as one private JSON file in Vercel Blob.
//   GET  /api/spots              -> the current list
//   POST /api/spots { op, ... }  -> apply a change (see data/ops.js), return the new list
// Writes are conditional on the file's ETag, so two people editing at once
// can't overwrite each other; a conflict just retries on the fresh copy.
import { applyOp, normalizeDoc, seedDoc, view } from "../data/ops.js";

const KEY = "wheel/spots.json";
const MAX_BODY = 2000;
// Page loads reuse a recent read for a few seconds, so they rarely touch storage.
const CACHE_MS = 20000;
let cached = null;
const hasBlob = () => Boolean(process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN);
const devFile = () => !process.env.VERCEL && !hasBlob();

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

async function readDev() {
  const { readFile } = await import("node:fs/promises");
  try {
    const raw = JSON.parse(await readFile(".data/spots.json", "utf8"));
    return { doc: normalizeDoc(raw), etag: String(raw.rev ?? 0) };
  } catch {
    return { doc: seedDoc(), etag: null };
  }
}

async function writeDev(doc, etag) {
  const { mkdir, writeFile } = await import("node:fs/promises");
  const current = await readDev();
  if (current.etag !== etag) throw Object.assign(new Error("conflict"), { conflict: true });
  await mkdir(".data", { recursive: true });
  await writeFile(".data/spots.json", JSON.stringify(doc, null, 2));
  return String(doc.rev);
}

async function read() {
  if (devFile()) return readDev();
  const { get, BlobNotFoundError } = await import("@vercel/blob");
  let res;
  try {
    res = await get(KEY, { access: "private", useCache: false });
  } catch (err) {
    if (err instanceof BlobNotFoundError) return { doc: seedDoc(), etag: null };
    throw err;
  }
  if (!res || res.statusCode !== 200 || !res.stream) return { doc: seedDoc(), etag: null };
  const text = await new Response(res.stream).text();
  return { doc: normalizeDoc(JSON.parse(text)), etag: res.blob.etag };
}

async function write(doc, etag) {
  if (devFile()) return writeDev(doc, etag);
  const { put, BlobPreconditionFailedError } = await import("@vercel/blob");
  try {
    const saved = await put(KEY, JSON.stringify(doc), {
      access: "private",
      contentType: "application/json",
      addRandomSuffix: false,
      cacheControlMaxAge: 60,
      ...(etag ? { ifMatch: etag } : { allowOverwrite: false }),
    });
    return saved.etag;
  } catch (err) {
    const raced = !etag && /exist/i.test(String(err && err.message));
    if (err instanceof BlobPreconditionFailedError || raced) throw Object.assign(err, { conflict: true });
    throw err;
  }
}

export async function GET() {
  if (!hasBlob() && !devFile()) return json({ ...view(seedDoc()), shared: false });
  try {
    if (!cached || Date.now() - cached.at > CACHE_MS) cached = { ...(await read()), at: Date.now() };
    return json({ ...view(cached.doc), shared: true });
  } catch (err) {
    console.error("spots read failed", err);
    return json({ error: true, message: "Couldn't load the shared list." }, 502);
  }
}

export async function POST(request) {
  if (!hasBlob() && !devFile()) {
    return json({ error: true, message: "The shared list isn't set up yet." }, 503);
  }
  const text = await request.text();
  if (text.length > MAX_BODY) return json({ error: true, message: "That's too long." }, 413);
  let op;
  try {
    op = JSON.parse(text);
  } catch {
    return json({ error: true, message: "That didn't come through right." }, 400);
  }
  if (!op || typeof op !== "object" || Array.isArray(op)) {
    return json({ error: true, message: "That didn't come through right." }, 400);
  }

  try {
    for (let attempt = 0; attempt < 5; attempt++) {
      const { doc, etag } = await read();
      const result = applyOp(doc, op);
      if (result.error) return json({ error: true, message: result.message }, result.status);
      try {
        const saved = await write(result.doc, etag);
        cached = { doc: result.doc, etag: saved, at: Date.now() };
      } catch (err) {
        cached = null;
        if (err && err.conflict) continue;
        throw err;
      }
      return json({ ...view(result.doc), shared: true, message: result.message, spot: result.spot || null });
    }
    return json({ error: true, message: "Lots of edits at once. Try again." }, 409);
  } catch (err) {
    console.error("spots write failed", err);
    return json({ error: true, message: "Couldn't save that. Try again." }, 502);
  }
}
