// How the shared list changes. Used by api/spots.js on the server, and by the
// page itself when the shared list isn't available (edits then stay on the device).
import { SPOTS } from "./spots.js";

export const CATS = ["comfort", "adventure", "oysters"];
export const CAT_LABEL = { comfort: "Comfort", adventure: "Adventure", oysters: "Oysters" };
export const LIMITS = { name: 40, note: 90, perWheel: 40, minPerWheel: 2, removed: 24 };

const clone = (x) => JSON.parse(JSON.stringify(x));
const DEFAULT_BY_ID = new Map(CATS.flatMap((cat) => SPOTS[cat].map((s) => [s.id, s])));

export function clean(value, max) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export function nameKey(name) {
  return String(name ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/^the\s+/, "")
    .replace(/[^a-z0-9]+/g, "");
}

function slug(name) {
  return (
    String(name)
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 24) || "spot"
  );
}

function randomTag() {
  const bytes = new Uint8Array(3);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 5);
}

const isSpot = (s) =>
  s && typeof s === "object" && typeof s.id === "string" && s.id && typeof s.name === "string" && s.name.trim();

export function seedDoc() {
  return { v: 1, rev: 0, updatedAt: null, spots: clone(SPOTS), removed: [] };
}

export function normalizeDoc(raw) {
  const doc = seedDoc();
  if (!raw || typeof raw !== "object") return doc;
  doc.rev = Number(raw.rev) || 0;
  doc.updatedAt = typeof raw.updatedAt === "string" ? raw.updatedAt : null;
  for (const cat of CATS) {
    const list = raw.spots && raw.spots[cat];
    if (Array.isArray(list)) doc.spots[cat] = list.filter(isSpot).slice(0, LIMITS.perWheel);
  }
  doc.removed = Array.isArray(raw.removed)
    ? raw.removed.filter((r) => isSpot(r) && CATS.includes(r.cat)).slice(0, LIMITS.removed)
    : [];
  return doc;
}

// What visitors get: starting spots pick up any corrections made in spots.js.
export function view(doc) {
  const fresh = (s) => (DEFAULT_BY_ID.has(s.id) ? { ...s, ...DEFAULT_BY_ID.get(s.id) } : s);
  return {
    v: 1,
    rev: doc.rev,
    updatedAt: doc.updatedAt,
    spots: Object.fromEntries(CATS.map((cat) => [cat, doc.spots[cat].map(fresh)])),
    removed: doc.removed.map(fresh),
  };
}

function fail(status, message) {
  return { error: true, status, message };
}

function done(doc, now, extra) {
  doc.rev = (Number(doc.rev) || 0) + 1;
  doc.updatedAt = now;
  return { doc, ...extra };
}

function stripRemoved(entry) {
  const { cat, removedAt, ...spot } = entry;
  return spot;
}

// op: { op: "add", cat, name, note } | { op: "remove", cat, id } | { op: "restore", id, cat } | { op: "reset", cat }
export function applyOp(input, op, now = new Date().toISOString()) {
  const doc = normalizeDoc(clone(input));
  const kind = op && op.op;

  if (kind === "add") {
    const cat = op.cat;
    if (!CATS.includes(cat)) return fail(400, "Pick a wheel first.");
    const name = clean(op.name, LIMITS.name);
    if (!name) return fail(400, "Give the spot a name.");
    const note = clean(op.note, LIMITS.note);
    const list = doc.spots[cat];
    const key = nameKey(name);
    if (!key) return fail(400, "That name needs a few letters or numbers.");
    if (list.some((s) => nameKey(s.name) === key)) return fail(409, `${name} is already on the ${CAT_LABEL[cat]} wheel.`);
    if (list.length >= LIMITS.perWheel) return fail(400, `The ${CAT_LABEL[cat]} wheel is full. Remove a spot first.`);
    const back = doc.removed.findIndex((r) => r.cat === cat && nameKey(r.name) === key);
    let spot;
    if (back >= 0) {
      spot = stripRemoved(doc.removed.splice(back, 1)[0]);
      if (note) spot.note = note;
    } else {
      spot = { id: `${slug(name)}-${randomTag()}`, name, short: name.replace(/^the\s+/i, ""), custom: true };
      if (note) spot.note = note;
    }
    list.push(spot);
    return done(doc, now, { spot, message: `Added ${spot.name} to ${CAT_LABEL[cat]}.` });
  }

  if (kind === "remove") {
    const cat = op.cat;
    if (!CATS.includes(cat)) return fail(400, "Pick a wheel first.");
    const list = doc.spots[cat];
    const i = list.findIndex((s) => s.id === op.id);
    if (i < 0) return fail(404, "That spot is already gone.");
    if (list.length <= LIMITS.minPerWheel) return fail(400, `Keep at least ${LIMITS.minPerWheel} spots on a wheel.`);
    const [spot] = list.splice(i, 1);
    doc.removed = [{ ...spot, cat, removedAt: now }, ...doc.removed.filter((r) => !(r.id === spot.id && r.cat === cat))].slice(
      0,
      LIMITS.removed
    );
    return done(doc, now, { spot, message: `Removed ${spot.name}.` });
  }

  if (kind === "restore") {
    const i = doc.removed.findIndex((r) => r.id === op.id && (!op.cat || r.cat === op.cat));
    if (i < 0) return fail(404, "Nothing to put back.");
    const entry = doc.removed[i];
    const list = doc.spots[entry.cat];
    doc.removed.splice(i, 1);
    if (list.some((s) => s.id === entry.id || nameKey(s.name) === nameKey(entry.name))) {
      return done(doc, now, { spot: stripRemoved(entry), message: `${entry.name} is already back.` });
    }
    if (list.length >= LIMITS.perWheel) return fail(400, `The ${CAT_LABEL[entry.cat]} wheel is full. Remove a spot first.`);
    const spot = stripRemoved(entry);
    list.push(spot);
    return done(doc, now, { spot, message: `Put back ${spot.name}.` });
  }

  if (kind === "reset") {
    const cat = op.cat;
    if (!CATS.includes(cat)) return fail(400, "Pick a wheel first.");
    const originals = clone(SPOTS[cat]);
    const keep = new Set(originals.map((s) => s.id));
    const added = doc.spots[cat].filter((s) => !keep.has(s.id)).map((s) => ({ ...s, cat, removedAt: now }));
    doc.spots[cat] = originals;
    doc.removed = [...added, ...doc.removed.filter((r) => !(r.cat === cat && keep.has(r.id)))].slice(0, LIMITS.removed);
    return done(doc, now, { message: `${CAT_LABEL[cat]} is back to the original list.` });
  }

  return fail(400, "Unknown change.");
}
