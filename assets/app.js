import { createWheel } from "./wheel.js";
import * as sound from "./sound.js";
import { mountConfetti, burst } from "./confetti.js";
import { CATS, CAT_LABEL, applyOp, nameKey, normalizeDoc, seedDoc, view } from "../data/ops.js";
import { CHECKED, RATINGS_FROM } from "../data/spots.js";

// Wheel names and lines. Edit freely.
const MODES = {
  all: { label: "Let it rip", meta: "Every spot", title: "Let it rip.", tagline: "Every spot on one wheel. No take-backs." },
  comfort: { label: "Comfort", meta: "Familiar bars", title: "Comfort.", tagline: "The usual suspects. Good pints, no surprises." },
  adventure: { label: "Adventure", meta: "Outside our comfort zone", title: "Adventure.", tagline: "Somewhere we would never pick on purpose." },
  oysters: { label: "Oysters", meta: "Mostly dollar oysters", title: "Oysters.", tagline: "Buck-a-shuck. Briny, cheap, very Boston." },
};

// Slice colors per wheel: [fill, text].
const TONES = {
  comfort: [["#F2A93B", "#2A1606"], ["#7B3A1F", "#FBEAD2"], ["#F6E4C4", "#3A2210"]],
  adventure: [["#FF4F8B", "#2B0716"], ["#5B3BE0", "#FFFFFF"], ["#D9F35B", "#1E2405"]],
  oysters: [["#7FD8C3", "#05302A"], ["#0F5257", "#E6FFF8"], ["#EEF0E8", "#0F3B3B"]],
};

const CONFETTI = {
  comfort: { colors: ["#F2A93B", "#FBEAD2", "#C2662F", "#FFD27A", "#FFFFFF"], shapes: ["rect", "rect", "circle", "streamer"] },
  adventure: { colors: ["#FF4F8B", "#7B5BFF", "#D9F35B", "#FFFFFF", "#FFB3CF"], shapes: ["rect", "star", "star", "streamer"] },
  oysters: { colors: ["#7FD8C3", "#EEF0E8", "#BFE9DF", "#FFFFFF", "#9CC9D6"], shapes: ["pearl", "pearl", "circle", "rect"] },
};

const KICKERS = ["The wheel has spoken:", "Tonight we ride to", "No take-backs:", "Destiny says", "Grab your coat, it's", "Tonight's spot:"];
const OFFICE = "31 State St, Boston, MA 02109";
const SITE = "https://wheel.uxpreview.com";
const KEY = { mode: "wheel.mode", sound: "wheel.sound", cache: "wheel.shared", local: "wheel.local", vetoes: "wheel.vetoes" };

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const store = {
  get(key, fallback = null) {
    try {
      const v = localStorage.getItem(key);
      return v == null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  },
};
const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const phone = matchMedia("(max-width: 900px)");
const randomInt = (n) => {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return Math.floor((buf[0] / 2 ** 32) * n);
};

const ui = {
  body: document.body,
  intro: $("#intro"),
  title: $("#modeTitle"),
  tagline: $("#modeTagline"),
  modes: $("#modes"),
  spinBtn: $("#spinBtn"),
  hub: $("#hubBtn"),
  wheel: $("#wheel"),
  vetoes: $("#vetoes"),
  result: $("#result"),
  resultKicker: $("#resultKicker"),
  resultName: $("#resultName"),
  resultMeta: $("#resultMeta"),
  resultVibe: $("#resultVibe"),
  resultDeal: $("#resultDeal"),
  resultHeads: $("#resultHeads"),
  goBtn: $("#goBtn"),
  appleLink: $("#appleLink"),
  siteLink: $("#siteLink"),
  shareBtn: $("#shareBtn"),
  againBtn: $("#againBtn"),
  vetoBtn: $("#vetoBtn"),
  resultClose: $("#resultClose"),
  soundBtn: $("#soundBtn"),
  editBtn: $("#editBtn"),
  drawer: $("#drawer"),
  backdrop: $("#drawerBackdrop"),
  drawerClose: $("#drawerClose"),
  syncNote: $("#syncNote"),
  drawerTabs: $("#drawerTabs"),
  addForm: $("#addForm"),
  addName: $("#addName"),
  addNote: $("#addNote"),
  spotList: $("#spotList"),
  removedBox: $("#removedBox"),
  removedList: $("#removedList"),
  removedCount: $("#removedCount"),
  resetArea: $("#resetArea"),
  toast: $("#toast"),
  announcer: $("#announcer"),
};

let mode = MODES[store.get(KEY.mode)] ? store.get(KEY.mode) : "all";
let shared = null;
let doc = view(normalizeDoc(store.get(KEY.cache) || seedDoc()));
let spinning = false;
let result = null;
let staleWheel = false;
let drawerCat = mode === "all" ? "comfort" : mode;
let lastFocus = null;

// ---------- vetoes (this device, until 5am Boston time) ----------

function nightKey() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(Date.now() - 5 * 3600e3)
  );
}

function vetoes() {
  const v = store.get(KEY.vetoes);
  return new Set(v && v.night === nightKey() && Array.isArray(v.ids) ? v.ids : []);
}

function saveVetoes(set) {
  store.set(KEY.vetoes, { night: nightKey(), ids: [...set] });
}

// ---------- what's on the wheel ----------

function spotsFor(cat) {
  return (doc.spots[cat] || []).map((s) => ({ ...s, cat }));
}

function allSpots() {
  const lists = CATS.map(spotsFor);
  const out = [];
  const seen = new Set();
  const longest = Math.max(...lists.map((l) => l.length));
  for (let i = 0; i < longest; i++) {
    for (const list of lists) {
      const s = list[i];
      if (!s) continue;
      const k = nameKey(s.name);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(s);
    }
  }
  return out;
}

function onWheel() {
  const vetoed = vetoes();
  const list = mode === "all" ? allSpots() : spotsFor(mode);
  return list.filter((s) => !vetoed.has(s.id));
}

function paintSlices(list) {
  const counters = { comfort: 0, adventure: 0, oysters: 0 };
  const tone = list.map((s) => counters[s.cat]++ % 3);
  const n = list.length;
  if (n > 2 && list[n - 1].cat === list[0].cat && tone[n - 1] === tone[0]) {
    tone[n - 1] = [0, 1, 2].find((t) => t !== tone[0] && !(list[n - 2].cat === list[n - 1].cat && t === tone[n - 2]));
  }
  return list.map((s, i) => {
    const [fill, ink] = TONES[s.cat][tone[i]];
    return { id: s.id, label: s.short || s.name, fill, ink, spot: s };
  });
}

let wheelList = [];

function renderWheel({ animate = false } = {}) {
  wheelList = paintSlices(onWheel());
  if (animate) wheel.swap(wheelList, { reduced: reducedMotion() });
  else wheel.setSlices(wheelList);
  ui.wheel.classList.toggle("is-empty", wheelList.length === 0);
  staleWheel = false;
}

// ---------- header, modes ----------

function counts() {
  const vetoed = vetoes();
  const live = (list) => list.filter((s) => !vetoed.has(s.id)).length;
  return {
    all: live(allSpots()),
    comfort: live(spotsFor("comfort")),
    adventure: live(spotsFor("adventure")),
    oysters: live(spotsFor("oysters")),
  };
}

function renderModes() {
  const c = counts();
  $$(".mode", ui.modes).forEach((btn) => {
    const m = btn.dataset.mode;
    const on = m === mode;
    btn.setAttribute("aria-selected", String(on));
    btn.tabIndex = on ? 0 : -1;
    $(".mode-count", btn).textContent = c[m];
  });
}

function renderHeadline(animate) {
  const m = MODES[mode];
  const apply = () => {
    ui.title.textContent = m.title;
    ui.tagline.textContent = m.tagline;
  };
  if (!animate || reducedMotion() || !ui.title.animate) return apply();
  const out = { duration: 140, easing: "cubic-bezier(.5,0,.75,0)", fill: "forwards" };
  Promise.all([
    ui.title.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateY(-10px)" }], out).finished,
    ui.tagline.animate([{ opacity: 1 }, { opacity: 0 }], out).finished,
  ])
    .catch(() => {})
    .then(() => {
      apply();
      const inn = { duration: 420, easing: "cubic-bezier(.23,1,.32,1)" };
      ui.title.animate([{ opacity: 0, transform: "translateY(14px)" }, { opacity: 1, transform: "none" }], inn);
      ui.tagline.animate([{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }], { ...inn, delay: 60 });
    });
}

function setMode(next, { focus = false } = {}) {
  if (!MODES[next] || spinning) return;
  if (next === mode) return;
  mode = next;
  store.set(KEY.mode, mode);
  ui.body.dataset.mode = mode;
  closeResult({ restoreFocus: false });
  renderModes();
  renderHeadline(true);
  renderWheel({ animate: true });
  renderVetoes();
  if (focus) $(`.mode[data-mode="${mode}"]`, ui.modes).focus();
}

ui.modes.addEventListener("click", (e) => {
  const btn = e.target.closest(".mode");
  if (btn) setMode(btn.dataset.mode);
});

ui.modes.addEventListener("keydown", (e) => {
  const order = Object.keys(MODES);
  const i = order.indexOf(mode);
  const keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
  let next = null;
  if (e.key in keys) next = order[(i + keys[e.key] + order.length) % order.length];
  if (e.key === "Home") next = order[0];
  if (e.key === "End") next = order[order.length - 1];
  if (next) {
    e.preventDefault();
    setMode(next, { focus: true });
  }
});

// ---------- spinning ----------

const wheel = createWheel(ui.wheel, {
  onTick: (speed) => sound.tick(speed),
  canGrab: () => !spinning && !ui.drawer.classList.contains("is-open") && !(phone.matches && !ui.result.hidden),
  onGrab: () => {
    sound.unlock();
    closeResult({ restoreFocus: false });
  },
  onFlick: ({ velocity, dir }) => spin({ velocity, dir, windup: false }),
});

function setSpinning(on) {
  spinning = on;
  ui.body.classList.toggle("is-spinning", on);
  ui.spinBtn.disabled = on;
  ui.hub.disabled = on;
  ui.spinBtn.querySelector(".spin-label").textContent = on ? "Spinning…" : result ? "Spin again" : "Spin the wheel";
  ui.hub.querySelector(".hub-label").textContent = on ? "" : result ? "Again" : "Spin";
  ui.wheel.dataset.lights = on ? "spin" : result ? "win" : "idle";
}

async function spin({ velocity, dir = 1, windup = true } = {}) {
  if (spinning || wheel.busy()) return;
  sound.unlock();
  closeResult({ restoreFocus: false });
  if (staleWheel) renderWheel();
  if (!wheelList.length) {
    toast("Everything is vetoed. Clear a veto to spin.");
    return;
  }
  result = null;
  setSpinning(true);
  sound.whoosh(mode === "all" ? 1.2 : 1);
  const index = randomInt(wheelList.length);
  const v = velocity || (mode === "all" ? 1500 : 1180) * (0.9 + Math.random() * 0.25);
  const landed = await wheel.spin({ index, velocity: v, dir, windup, reduced: reducedMotion() });
  const slice = wheelList[landed == null ? index : landed];
  result = slice.spot;
  setSpinning(false);
  wheel.highlight(landed == null ? index : landed);
  celebrate(result);
  showResult(result);
}

function celebrate(spot) {
  sound.win();
  if (navigator.vibrate) navigator.vibrate([18, 40, 18]);
  if (!reducedMotion()) burst(CONFETTI[spot.cat]);
  ui.wheel.dataset.lights = "win";
}

ui.spinBtn.addEventListener("click", () => spin());
ui.hub.addEventListener("click", () => spin());

// ---------- result ----------

function directionsUrl(spot) {
  const dest = spot.address ? `${spot.name}, ${spot.address}, Boston, MA` : `${spot.name}, Boston, MA`;
  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(OFFICE)}&destination=${encodeURIComponent(dest)}&travelmode=walking`;
}

function appleUrl(spot) {
  const dest = spot.address ? `${spot.name}, ${spot.address}, Boston, MA` : `${spot.name}, Boston, MA`;
  return `https://maps.apple.com/?saddr=${encodeURIComponent(OFFICE)}&daddr=${encodeURIComponent(dest)}&dirflg=w`;
}

function chip(text, cls = "") {
  const span = document.createElement("span");
  span.className = `chip ${cls}`.trim();
  span.textContent = text;
  return span;
}

// ---------- deal timing (Boston time) ----------

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function bostonNow() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", hour: "numeric", minute: "numeric", hourCycle: "h23" })
      .formatToParts(new Date())
      .map((p) => [p.type, p.value])
  );
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday);
  return { day, hour: Number(parts.hour) + Number(parts.minute) / 60 };
}

function clock(h) {
  const hr = Math.floor(h);
  const min = Math.round((h - hr) * 60);
  const h12 = hr % 12 === 0 ? 12 : hr % 12;
  return `${h12}${min ? `:${String(min).padStart(2, "0")}` : ""}${hr < 12 ? "am" : "pm"}`;
}

function dealStatus(when) {
  if (!when || !Array.isArray(when.days)) return null;
  const { day, hour } = bostonNow();
  if (!when.days.includes(day)) return { state: "off", text: `Not on ${DAY_NAMES[day]}s` };
  if (hour < when.from) return { state: "later", text: `Starts at ${clock(when.from)} today` };
  if (when.to == null || hour < when.to) return { state: "on", text: when.to ? `On now, until ${clock(when.to)}` : "On now" };
  return { state: "over", text: `Ended at ${clock(when.to)} today` };
}

function showResult(spot) {
  ui.resultKicker.textContent = KICKERS[randomInt(KICKERS.length)];
  ui.resultName.textContent = spot.name;
  ui.resultMeta.replaceChildren();
  const cat = chip(CAT_LABEL[spot.cat], `chip-cat chip-${spot.cat}`);
  ui.resultMeta.append(cat);
  if (spot.walk) ui.resultMeta.append(chip(`${spot.walk} min walk`, "chip-walk"));
  if (spot.rating) ui.resultMeta.append(chip(`★ ${Number(spot.rating).toFixed(1)} on ${RATINGS_FROM}`, "chip-rating"));
  if (spot.address) ui.resultMeta.append(chip(spot.address, "chip-address"));
  const vibe = spot.vibe || spot.note || "";
  ui.resultVibe.textContent = vibe;
  ui.resultVibe.hidden = !vibe;
  if (spot.deal) {
    ui.resultDeal.hidden = false;
    const status = dealStatus(spot.when);
    const statusEl = $(".deal-status", ui.resultDeal);
    statusEl.hidden = !status;
    if (status) {
      statusEl.dataset.state = status.state;
      $(".deal-status-text", statusEl).textContent = status.text;
    }
    $(".deal-text", ui.resultDeal).textContent = spot.deal;
    $(".deal-checked", ui.resultDeal).textContent = spot.custom
      ? ""
      : spot.unsure
        ? `Sources disagree on the days. Check before you go.`
        : `Checked ${CHECKED}. Deals change, so peek before you go.`;
  } else {
    ui.resultDeal.hidden = true;
  }
  ui.resultHeads.hidden = !spot.heads;
  $(".heads-text", ui.resultHeads).textContent = spot.heads || "";
  ui.goBtn.href = directionsUrl(spot);
  ui.appleLink.href = appleUrl(spot);
  ui.siteLink.hidden = !spot.url;
  if (spot.url) ui.siteLink.href = spot.url;
  ui.vetoBtn.hidden = wheelList.length < 2;

  ui.result.hidden = false;
  ui.body.classList.add("has-result");
  ui.result.classList.remove("is-in");
  void ui.result.offsetWidth;
  ui.result.classList.add("is-in");
  fitName();
  liftWheel();
  setSpinning(false);
  announce(`The wheel picked ${spot.name}${spot.walk ? `, a ${spot.walk} minute walk` : ""}.`);
  ui.resultName.focus({ preventScroll: true });
}

// On phones the result sheet covers the wheel, so lift and shrink the wheel
// until the winning slice sits in the space above the sheet.

function liftWheel() {
  const w = ui.wheel;
  w.style.removeProperty("--lift");
  w.style.removeProperty("--shrink");
  if (!phone.matches || ui.result.hidden) return;
  let wheelTop = -scrollY;
  for (let n = w; n; n = n.offsetParent) wheelTop += n.offsetTop;
  const sheetTop = innerHeight - 8 - ui.result.offsetHeight;
  const top = $(".topbar").getBoundingClientRect().bottom + 6;
  const size = w.offsetHeight;
  const room = sheetTop - top - 10;
  const scale = Math.max(0.42, Math.min(1, room / (size * 0.56)));
  const pointer = size * 0.035 * scale;
  w.style.setProperty("--shrink", scale.toFixed(3));
  w.style.setProperty("--lift", `${(top + pointer - wheelTop).toFixed(1)}px`);
}

// Shrink the result name until its longest word fits on one line
// and the whole name takes at most three lines.
function fitName() {
  const el = ui.resultName;
  el.style.fontSize = "";
  let size = parseFloat(getComputedStyle(el).fontSize);
  const tooBig = () => el.scrollWidth > el.clientWidth + 1 || el.offsetHeight > size * 1.02 * 3 + 2;
  while (tooBig() && size > 26) {
    size *= 0.94;
    el.style.fontSize = `${size.toFixed(1)}px`;
  }
}

addEventListener("resize", () => {
  if (ui.result.hidden) return;
  fitName();
  liftWheel();
});

function closeResult({ restoreFocus = true } = {}) {
  if (ui.result.hidden) return;
  ui.result.hidden = true;
  ui.body.classList.remove("has-result");
  ui.wheel.style.removeProperty("--lift");
  ui.wheel.style.removeProperty("--shrink");
  wheel.clearHighlight();
  if (!spinning) ui.wheel.dataset.lights = "idle";
  result = null;
  setSpinning(spinning);
  if (staleWheel && !spinning) renderWheel();
  if (restoreFocus) ui.spinBtn.focus({ preventScroll: true });
}

ui.resultClose.addEventListener("click", () => closeResult());
ui.againBtn.addEventListener("click", () => spin());
ui.vetoBtn.addEventListener("click", () => {
  if (!result) return;
  const v = vetoes();
  v.add(result.id);
  saveVetoes(v);
  const name = result.name;
  closeResult({ restoreFocus: false });
  renderWheel({ animate: true });
  renderModes();
  renderVetoes();
  announce(`${name} is vetoed for tonight.`);
  setTimeout(() => spin(), reducedMotion() ? 50 : 650);
});

ui.shareBtn.addEventListener("click", async () => {
  if (!result) return;
  const where = [result.address, result.walk ? `${result.walk} min walk` : ""].filter(Boolean).join(", ");
  const text = `The wheel has spoken: ${result.name}${where ? ` (${where})` : ""}.`;
  if (navigator.share && matchMedia("(pointer: coarse)").matches) {
    try {
      await navigator.share({ title: "Tonight's spot", text, url: SITE });
      return;
    } catch (err) {
      if (err && err.name === "AbortError") return;
    }
  }
  try {
    await navigator.clipboard.writeText(`${text} ${SITE}`);
    toast("Copied. Paste it in Slack.");
  } catch {
    toast("Couldn't copy. Long-press the name instead.");
  }
});

// ---------- vetoes ----------

function renderVetoes() {
  const vetoed = vetoes();
  const all = CATS.flatMap(spotsFor);
  const list = all.filter((s) => vetoed.has(s.id));
  const unique = [...new Map(list.map((s) => [s.id, s])).values()];
  ui.vetoes.hidden = unique.length === 0;
  const items = $(".veto-items", ui.vetoes);
  items.replaceChildren(
    ...unique.map((s) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "veto-chip";
      b.dataset.id = s.id;
      b.setAttribute("aria-label", `Bring back ${s.name}`);
      b.innerHTML = '<span class="veto-name"></span><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg>';
      $(".veto-name", b).textContent = s.short || s.name;
      return b;
    })
  );
}

ui.vetoes.addEventListener("click", (e) => {
  if (spinning) return;
  const chipBtn = e.target.closest(".veto-chip");
  const clear = e.target.closest("[data-clear-vetoes]");
  if (!chipBtn && !clear) return;
  const v = vetoes();
  if (clear) v.clear();
  else v.delete(chipBtn.dataset.id);
  saveVetoes(v);
  closeResult({ restoreFocus: false });
  renderWheel({ animate: true });
  renderModes();
  renderVetoes();
});

// ---------- shared list ----------

function setDoc(next, { fromServer = false } = {}) {
  const before = JSON.stringify(doc.spots);
  doc = view(normalizeDoc(next));
  if (fromServer) store.set(KEY.cache, doc);
  const changed = before !== JSON.stringify(doc.spots);
  renderModes();
  renderVetoes();
  if (ui.drawer.classList.contains("is-open")) renderDrawer();
  if (!changed) return;
  if (spinning || result) staleWheel = true;
  else renderWheel();
}

async function loadShared() {
  try {
    const res = await fetch("/api/spots", { cache: "no-store", headers: { accept: "application/json" } });
    const data = await res.json();
    if (!res.ok) throw new Error(data && data.message);
    if (data.shared) {
      shared = true;
      setDoc(data, { fromServer: true });
    } else {
      shared = false;
      setDoc(store.get(KEY.local) || seedDoc());
    }
  } catch {
    if (shared === null) shared = "offline";
  }
  renderSync();
}

async function change(op) {
  if (shared === "offline") {
    toast("Can't reach the shared list right now. Try again in a minute.");
    loadShared();
    return null;
  }
  const before = doc;
  const local = applyOp(doc, op);
  if (local.error) {
    toast(local.message);
    return null;
  }
  setDoc(local.doc);
  if (shared === false) {
    store.set(KEY.local, local.doc);
    return local;
  }
  try {
    const res = await fetch("/api/spots", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(op),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setDoc(before);
      toast(data.message || "Couldn't save that. Try again.");
      if (res.status === 409 || res.status === 404) loadShared();
      return null;
    }
    setDoc(data, { fromServer: true });
    return { ...local, spot: data.spot || local.spot };
  } catch {
    setDoc(before);
    toast("Couldn't reach the shared list. Try again.");
    return null;
  }
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && shared !== false) loadShared();
});

// ---------- edit drawer ----------

function renderSync() {
  const note = ui.syncNote;
  note.dataset.state = shared === true ? "shared" : shared === false ? "local" : shared === "offline" ? "offline" : "loading";
  note.querySelector(".sync-text").textContent =
    shared === true
      ? "Changes save for everyone with the link."
      : shared === false
        ? "Changes save on this device only."
        : shared === "offline"
          ? "Can't reach the shared list. Edits are paused."
          : "Loading the shared list…";
}

function metaLine(s) {
  return [s.walk ? `${s.walk} min walk` : "", s.deal || s.note || "", s.custom ? "Added by the office" : ""].filter(Boolean).join(" · ");
}

function renderDrawer() {
  ui.drawer.dataset.cat = drawerCat;
  $$("button", ui.drawerTabs).forEach((b) => {
    const on = b.dataset.cat === drawerCat;
    b.setAttribute("aria-selected", String(on));
    b.tabIndex = on ? 0 : -1;
    $(".tab-count", b).textContent = (doc.spots[b.dataset.cat] || []).length;
  });
  ui.addName.placeholder = `Add a spot to ${CAT_LABEL[drawerCat]}`;
  const vetoed = vetoes();
  const list = doc.spots[drawerCat] || [];
  ui.spotList.replaceChildren(
    ...list.map((s) => {
      const li = document.createElement("li");
      li.className = "spot-row";
      li.innerHTML =
        '<span class="spot-dot" aria-hidden="true"></span><span class="spot-text"><span class="spot-name"></span><span class="spot-meta"></span></span>' +
        '<button type="button" class="icon-btn spot-remove"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15"/></svg></button>';
      $(".spot-name", li).textContent = s.name;
      const meta = metaLine(s) + (vetoed.has(s.id) ? (metaLine(s) ? " · " : "") + "Vetoed tonight" : "");
      $(".spot-meta", li).textContent = meta;
      $(".spot-meta", li).hidden = !meta;
      const btn = $(".spot-remove", li);
      btn.dataset.id = s.id;
      btn.setAttribute("aria-label", `Remove ${s.name}`);
      return li;
    })
  );
  const removed = doc.removed.filter((r) => r.cat === drawerCat);
  ui.removedBox.hidden = removed.length === 0;
  ui.removedCount.textContent = removed.length;
  ui.removedList.replaceChildren(
    ...removed.map((r) => {
      const li = document.createElement("li");
      li.className = "removed-row";
      li.innerHTML = '<span class="removed-name"></span><button type="button" class="link-btn">Put back</button>';
      $(".removed-name", li).textContent = r.name;
      const btn = $("button", li);
      btn.dataset.restore = r.id;
      btn.dataset.cat = r.cat;
      btn.setAttribute("aria-label", `Put back ${r.name}`);
      return li;
    })
  );
  renderReset(false);
}

function renderReset(confirming) {
  const label = CAT_LABEL[drawerCat];
  ui.resetArea.replaceChildren();
  if (!confirming) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "link-btn";
    b.dataset.reset = "ask";
    b.textContent = `Restore the original ${label} list`;
    ui.resetArea.append(b);
    return;
  }
  const p = document.createElement("p");
  p.className = "reset-q";
  p.textContent = `Put back the starting ${label} spots? Anything added moves to Recently removed.`;
  const yes = document.createElement("button");
  yes.type = "button";
  yes.className = "btn btn-small btn-accent";
  yes.dataset.reset = "yes";
  yes.textContent = "Restore";
  const no = document.createElement("button");
  no.type = "button";
  no.className = "btn btn-small";
  no.dataset.reset = "no";
  no.textContent = "Cancel";
  const row = document.createElement("div");
  row.className = "reset-actions";
  row.append(yes, no);
  ui.resetArea.append(p, row);
  yes.focus();
}

function openDrawer() {
  if (spinning) return;
  lastFocus = document.activeElement;
  drawerCat = mode === "all" ? drawerCat || "comfort" : mode;
  renderSync();
  renderDrawer();
  ui.drawer.hidden = false;
  ui.backdrop.hidden = false;
  requestAnimationFrame(() => {
    ui.drawer.classList.add("is-open");
    ui.backdrop.classList.add("is-open");
  });
  ui.editBtn.setAttribute("aria-expanded", "true");
  document.documentElement.classList.add("drawer-open");
  setTimeout(() => ui.addName.focus({ preventScroll: true }), 60);
  if (shared !== false) loadShared();
}

function closeDrawer() {
  if (!ui.drawer.classList.contains("is-open")) return;
  ui.drawer.classList.remove("is-open");
  ui.backdrop.classList.remove("is-open");
  ui.editBtn.setAttribute("aria-expanded", "false");
  document.documentElement.classList.remove("drawer-open");
  const hide = () => {
    if (!ui.drawer.classList.contains("is-open")) {
      ui.drawer.hidden = true;
      ui.backdrop.hidden = true;
    }
  };
  if (reducedMotion()) hide();
  else setTimeout(hide, 320);
  if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
}

ui.editBtn.addEventListener("click", openDrawer);
ui.drawerClose.addEventListener("click", closeDrawer);
ui.backdrop.addEventListener("click", closeDrawer);

ui.drawerTabs.addEventListener("click", (e) => {
  const b = e.target.closest("button[data-cat]");
  if (!b) return;
  drawerCat = b.dataset.cat;
  renderDrawer();
});

ui.drawerTabs.addEventListener("keydown", (e) => {
  const keys = { ArrowRight: 1, ArrowLeft: -1 };
  if (!(e.key in keys)) return;
  e.preventDefault();
  const i = CATS.indexOf(drawerCat);
  drawerCat = CATS[(i + keys[e.key] + CATS.length) % CATS.length];
  renderDrawer();
  $(`button[data-cat="${drawerCat}"]`, ui.drawerTabs).focus();
});

ui.addForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = ui.addName.value.trim();
  if (!name) {
    ui.addName.focus();
    return;
  }
  const submit = $("button[type=submit]", ui.addForm);
  submit.disabled = true;
  const res = await change({ op: "add", cat: drawerCat, name, note: ui.addNote.value });
  submit.disabled = false;
  if (res) {
    ui.addName.value = "";
    ui.addNote.value = "";
    toast(res.message || `Added ${name}.`);
    ui.addName.focus();
  }
});

ui.spotList.addEventListener("click", async (e) => {
  const btn = e.target.closest(".spot-remove");
  if (!btn) return;
  const id = btn.dataset.id;
  const index = $$(".spot-remove", ui.spotList).indexOf(btn);
  const res = await change({ op: "remove", cat: drawerCat, id });
  if (!res) return;
  const cat = drawerCat;
  toast(res.message, { label: "Undo", run: () => change({ op: "restore", id, cat }) });
  const buttons = $$(".spot-remove", ui.spotList);
  const focusTarget = buttons[Math.min(index, buttons.length - 1)];
  if (focusTarget) focusTarget.focus();
  else ui.addName.focus();
});

ui.removedList.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-restore]");
  if (!btn) return;
  const res = await change({ op: "restore", id: btn.dataset.restore, cat: btn.dataset.cat });
  if (res) toast(res.message);
});

ui.resetArea.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-reset]");
  if (!b) return;
  if (b.dataset.reset === "ask") return renderReset(true);
  if (b.dataset.reset === "no") {
    renderReset(false);
    $("[data-reset]", ui.resetArea).focus();
    return;
  }
  const res = await change({ op: "reset", cat: drawerCat });
  if (res) toast(res.message);
});

ui.drawer.addEventListener("keydown", (e) => {
  if (e.key !== "Tab") return;
  const focusable = $$('button:not([disabled]), input, a[href], summary, [tabindex="0"]', ui.drawer).filter(
    (n) => n.offsetParent !== null || n === document.activeElement
  );
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
});

// ---------- sound, toast, keys ----------

function renderSound() {
  const on = sound.isEnabled();
  ui.soundBtn.setAttribute("aria-pressed", String(on));
  ui.soundBtn.setAttribute("aria-label", on ? "Sound is on" : "Sound is off");
  ui.soundBtn.dataset.on = String(on);
}

ui.soundBtn.addEventListener("click", () => {
  sound.setEnabled(!sound.isEnabled());
  store.set(KEY.sound, sound.isEnabled());
  if (sound.isEnabled()) {
    sound.unlock();
    sound.thunk();
  }
  renderSound();
});

let toastTimer = 0;
function toast(message, action) {
  clearTimeout(toastTimer);
  const t = ui.toast;
  t.replaceChildren();
  const span = document.createElement("span");
  span.textContent = message;
  t.append(span);
  if (action) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "toast-action";
    b.textContent = action.label;
    b.addEventListener("click", () => {
      t.classList.remove("is-on");
      action.run();
    });
    t.append(b);
  }
  t.classList.add("is-on");
  toastTimer = setTimeout(() => t.classList.remove("is-on"), action ? 6000 : 3200);
}

function announce(text) {
  ui.announcer.textContent = "";
  setTimeout(() => (ui.announcer.textContent = text), 30);
}

const typing = (n) => n && (n.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(n.tagName));
const pressable = (n) => n && /^(BUTTON|A|SUMMARY)$/.test(n.tagName);

document.addEventListener("keydown", (e) => {
  const drawerOpen = ui.drawer.classList.contains("is-open");
  if (e.key === "Escape") {
    if (drawerOpen) closeDrawer();
    else if (!ui.result.hidden) closeResult();
    return;
  }
  if (drawerOpen || e.metaKey || e.ctrlKey || e.altKey) return;
  if ((e.code === "Space" || e.key === " ") && !typing(e.target) && !pressable(e.target)) {
    e.preventDefault();
    spin();
  }
});

// ---------- start ----------

function makeBulbs(n = 32) {
  const box = $(".bulbs", ui.wheel);
  box.style.setProperty("--n", n);
  box.replaceChildren(
    ...Array.from({ length: n }, (_, i) => {
      const b = document.createElement("span");
      b.className = "bulb";
      b.style.setProperty("--i", i);
      b.style.setProperty("--odd", i % 2);
      return b;
    })
  );
}

makeBulbs();
sound.setEnabled(store.get(KEY.sound, true) !== false);
renderSound();
mountConfetti($("#confetti"));
ui.body.dataset.mode = mode;
ui.title.textContent = MODES[mode].title;
ui.tagline.textContent = MODES[mode].tagline;
renderModes();
renderWheel();
renderVetoes();
renderSync();
setSpinning(false);
loadShared();

if (document.fonts && document.fonts.status !== "loaded") {
  document.fonts.ready.then(() => {
    wheel.resetMeasure();
    if (spinning || result) staleWheel = true;
    else renderWheel();
  });
}
document.documentElement.classList.add("is-ready");
