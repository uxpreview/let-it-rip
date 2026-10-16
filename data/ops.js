// How the shared list changes. Used by api/spots.js on the server, and by the
// page itself when the shared list isn't available (edits then stay on the device).
import { SPOTS } from "./spots.js";

export const DRINKS = ["comfort", "adventure", "oysters"];
export const CATS = [...DRINKS, "lunch"];
export const CAT_LABEL = { comfort: "Comfort", adventure: "Adventure", oysters: "Oysters", lunch: "Lunch" };
export const LIMITS = {
  name: 40,
  short: 20,
  vibe: 90,
  address: 60,
  deal: 70,
  heads: 120,
  url: 200,
  walk: 90,
  perWheel: 40,
  minPerWheel: 2,
  removed: 24,
};
export const PRICES = ["$", "$$", "$$$", "$$$$"];
export const STYLES = ["counter", "sit-down", "food hall"];

const clone = (x) => JSON.parse(JSON.stringify(x));
const DEFAULT_BY_ID = new Map(CATS.flatMap((cat) => SPOTS[cat].map((s) => [s.id, s])));

export function clean(value, max) {
  const text = String(value ?? "")
    .replace(/[\u0000-\u001f\u007f<>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return Array.from(text).slice(0, max).join("").trim();
}

export function nameKey(name) {
  return String(name ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/^the\s+/, "")
    .replace(/[^a-z0-9]+/g, "");
}

// The label printed on the wheel when nobody gives a shorter one.
export const autoShort = (name) => String(name ?? "").replace(/^the\s+/i, "");

function slug(name) {
  return (
    String(name)
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
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

// ---------- details ----------

// Websites must be plain web links. "mrdooleys.com" becomes "https://mrdooleys.com/".
function cleanUrl(value) {
  let text = clean(value, LIMITS.url).replace(/\s/g, "");
  if (!text) return "";
  if (!/^https?:\/\//i.test(text)) {
    if (/^[a-z][a-z0-9+.-]*:(?!\d)/i.test(text)) return "";
    text = `https://${text}`;
  }
  try {
    const url = new URL(text);
    const web = url.protocol === "https:" || url.protocol === "http:";
    if (web && url.hostname.includes(".") && url.href.length <= LIMITS.url) return url.href;
  } catch {}
  return "";
}

function number(value, min, max, step) {
  if (value == null || value === "") return null;
  const n = Number((Math.round(Number(value) / step) * step).toFixed(1));
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

const halfHour = (n) => Number.isFinite(n) && Number.isInteger(n * 2);

// When a deal runs: days are 0 = Sunday ... 6 = Saturday, hours are 24h in half hours.
// No end time means it runs until close.
function cleanWhen(when) {
  if (!when || typeof when !== "object" || !Array.isArray(when.days) || when.from == null || when.from === "") return null;
  const days = [...new Set(when.days.map(Number))].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6).sort((a, b) => a - b);
  const from = Number(when.from);
  const to = when.to == null || when.to === "" ? null : Number(when.to);
  if (!days.length || !halfHour(from) || from < 0 || from >= 24) return null;
  if (to != null && (!halfHour(to) || to <= from || to > 24)) return null;
  return { days, from, to };
}

// The details someone can fill in, cleaned. Lunch spots can have a price and
// a style; bars can have a deal with its days and hours. Blank fields are left out.
export function cleanDetails(input, cat) {
  const src = input && typeof input === "object" ? input : {};
  const out = {};
  const text = (key, max) => {
    const value = clean(src[key], max);
    if (value) out[key] = value;
  };
  text("short", LIMITS.short);
  text("vibe", LIMITS.vibe);
  text("address", LIMITS.address);
  const walk = number(src.walk, 1, LIMITS.walk, 1);
  if (walk != null) out.walk = walk;
  const rating = number(src.rating, 1, 5, 0.1);
  if (rating != null) out.rating = rating;
  if (cat === "lunch") {
    if (PRICES.includes(src.price)) out.price = src.price;
    if (STYLES.includes(src.style)) out.style = src.style;
  } else {
    const deal = clean(src.deal, LIMITS.deal);
    const when = cleanWhen(src.when);
    if (deal) out.deal = deal;
    if (deal && when) out.when = when;
  }
  text("heads", LIMITS.heads);
  const url = cleanUrl(src.url);
  if (url) out.url = url;
  return out;
}

// The details a spot already has, in the same shape the edit form sends.
export function detailsOf(spot, cat) {
  return cleanDetails({ ...spot, vibe: spot.vibe || spot.note }, cat);
}

// A spot as saved: who it is, then whatever details it has. Spots the office
// added stay marked as added; edited starting spots stop taking corrections
// from spots.js, so the office's edit wins.
function build(base, name, details) {
  const { short, ...rest } = details;
  const spot = { id: base.id, name, short: short || autoShort(name) };
  if (base.custom) spot.custom = true;
  else spot.edited = true;
  return { ...spot, ...rest };
}

// ---------- the saved list ----------

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

// Starting spots pick up any corrections made in spots.js, unless the office edited them.
const fresh = (s) => (DEFAULT_BY_ID.has(s.id) && !s.edited ? { ...s, ...DEFAULT_BY_ID.get(s.id) } : s);

// What visitors get.
export function view(doc) {
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

function checkName(list, name, cat, id) {
  if (!name) return fail(400, "Give the spot a name.");
  const key = nameKey(name);
  if (!key) return fail(400, "That name needs a few letters or numbers.");
  if (list.some((s) => s.id !== id && nameKey(s.name) === key)) return fail(409, `${name} is already on the ${CAT_LABEL[cat]} wheel.`);
  return null;
}

// op: { op: "add", cat, spot: { name, ...details } }
//   | { op: "update", cat, id, spot: { name, ...details } }   (replaces every detail)
//   | { op: "remove", cat, id } | { op: "restore", id, cat } | { op: "reset", cat }
// Older pages sent adds as { op: "add", cat, name, note }; those still work.
export function applyOp(input, op, now = new Date().toISOString()) {
  const doc = normalizeDoc(clone(input));
  const kind = op && op.op;

  if (kind === "add") {
    const cat = op.cat;
    if (!CATS.includes(cat)) return fail(400, "Pick a wheel first.");
    const given = op.spot && typeof op.spot === "object" ? op.spot : { name: op.name, vibe: op.note };
    const name = clean(given.name, LIMITS.name);
    const list = doc.spots[cat];
    const bad = checkName(list, name, cat, null);
    if (bad) return bad;
    if (list.length >= LIMITS.perWheel) return fail(400, `The ${CAT_LABEL[cat]} wheel is full. Remove a spot first.`);
    const details = cleanDetails(given, cat);
    const back = doc.removed.findIndex((r) => r.cat === cat && nameKey(r.name) === nameKey(name));
    let spot;
    if (back >= 0) {
      // Re-adding a removed spot brings its details back. Anything typed now wins.
      const prev = fresh(stripRemoved(doc.removed.splice(back, 1)[0]));
      spot = Object.keys(details).length ? build(prev, prev.name, { ...detailsOf(prev, cat), ...details }) : prev;
    } else {
      spot = build({ id: `${slug(name)}-${randomTag()}`, custom: true }, name, details);
    }
    list.push(spot);
    return done(doc, now, { spot, message: `Added ${spot.name} to ${CAT_LABEL[cat]}.` });
  }

  if (kind === "update") {
    const cat = op.cat;
    if (!CATS.includes(cat)) return fail(400, "Pick a wheel first.");
    if (!doc.spots[cat].some((s) => s.id === op.id)) return fail(404, "That spot isn't on the wheel anymore.");
    const given = op.spot && typeof op.spot === "object" ? op.spot : {};
    const name = clean(given.name, LIMITS.name);
    const bad = checkName(doc.spots[cat], name, cat, op.id);
    if (bad) return bad;
    // A place on two wheels is the same place, so the edit shows on both.
    let spot;
    for (const c of cat === "lunch" ? ["lunch"] : DRINKS) {
      doc.spots[c] = doc.spots[c].map((s) => {
        if (s.id !== op.id) return s;
        const next = build(s, name, cleanDetails(given, c));
        if (c === cat) spot = next;
        return next;
      });
    }
    return done(doc, now, { spot, message: `Saved ${spot.name}.` });
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
