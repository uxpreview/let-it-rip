// The shared list of spots, stored as one private JSON file in Vercel Blob.
//   GET  /api/spots              -> the current list
//   POST /api/spots { op, ... }  -> apply a change (see data/ops.js), return the new list
// Writes are conditional on the file's ETag, so two people editing at once
// can't overwrite each other; a conflict just retries on the fresh copy, and
// if it keeps clashing the last try saves anyway.
import { applyOp, normalizeDoc, seedDoc, view } from "../data/ops.js";

const KEY = "wheel/spots.json";
const MAX_BODY = 4000;
// Page loads reuse a recent read for a few seconds, so they rarely touch storage.
const CACHE_MS = 20000;
const ATTEMPTS = 5;
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

async function writeDev(doc, etag, force) {
  const { mkdir, writeFile } = await import("node:fs/promises");
  const current = await readDev();
  if (!force && current.etag !== etag) throw Object.assign(new Error("conflict"), { conflict: true });
  await mkdir(".data", { recursive: true });
  await writeFile(".data/spots.json", JSON.stringify(doc, null, 2));
  return String(doc.rev);
}

// For a save, the version tag comes from head(). The download is compressed,
// so its tag comes back marked weak (W/"...") and never matches the tag the
// Blob API checks a conditional save against. Using it made every save after
// the first look like a clash.
async function read({ forSave = false } = {}) {
  if (devFile()) return readDev();
  const { get, head, BlobNotFoundError } = await import("@vercel/blob");
  let etag = null;
  try {
    if (forSave) etag = (await head(KEY)).etag || null;
    const res = await get(KEY, { access: "private", useCache: false });
    if (!res || res.statusCode !== 200 || !res.stream) return { doc: seedDoc(), etag: null };
    const text = await new Response(res.stream).text();
    return { doc: normalizeDoc(JSON.parse(text)), etag, downloadTag: res.blob.etag };
  } catch (err) {
    if (err instanceof BlobNotFoundError) return { doc: seedDoc(), etag: null };
    throw err;
  }
}

// mode "check": only save if nobody else saved since the read (or, with no tag,
// only if the file doesn't exist yet). mode "force": save regardless.
async function write(doc, etag, mode = "check") {
  if (devFile()) return writeDev(doc, etag, mode === "force");
  const { put, BlobPreconditionFailedError } = await import("@vercel/blob");
  const guard = mode === "force" ? { allowOverwrite: true } : etag ? { ifMatch: etag } : { allowOverwrite: false };
  try {
    const saved = await put(KEY, JSON.stringify(doc), {
      access: "private",
      contentType: "application/json",
      addRandomSuffix: false,
      cacheControlMaxAge: 60,
      ...guard,
    });
    return saved.etag;
  } catch (err) {
    const raced = guard.allowOverwrite === false && /exist/i.test(String(err && err.message));
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
    for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
      // Each try re-reads the list and re-applies the change, so a clash only costs a retry.
      // The last try saves without the version check, so a tag problem can never block saving.
      const last = attempt === ATTEMPTS;
      const { doc, etag, downloadTag } = await read({ forSave: true });
      const result = applyOp(doc, op);
      if (result.error) return json({ error: true, message: result.message }, result.status);
      try {
        await write(result.doc, etag, last ? "force" : "check");
        if (last) console.warn("spots saved without the version check after repeated clashes", { etag, downloadTag });
        cached = { doc: result.doc, at: Date.now() };
      } catch (err) {
        cached = null;
        if (err && err.conflict && !last) continue;
        throw err;
      }
      return json({ ...view(result.doc), shared: true, message: result.message, spot: result.spot || null });
    }
  } catch (err) {
    console.error("spots write failed", err);
    return json({ error: true, message: "Couldn't save that. Try again." }, 502);
  }
}
