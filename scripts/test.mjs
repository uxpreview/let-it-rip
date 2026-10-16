// Checks the shared-list rules and the starting data. No network, no browser.
//   npm test
import assert from "node:assert/strict";
import { CATS, DRINKS, LIMITS, applyOp, cleanDetails, detailsOf, nameKey, normalizeDoc, seedDoc, view } from "../data/ops.js";
import { SPOTS } from "../data/spots.js";
import { schedule } from "../assets/schedule.js";

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`ok  ${name}`);
}
const ok = (r) => {
  assert.ok(!r.error, r.message);
  return r.doc;
};

test("starting data is complete and tidy", () => {
  for (const cat of CATS) {
    assert.ok(SPOTS[cat].length >= LIMITS.minPerWheel, `${cat} has too few spots`);
    const names = new Set();
    for (const s of SPOTS[cat]) {
      assert.match(s.id, /^[a-z0-9-]+$/, `bad id ${s.id}`);
      assert.ok(s.name && s.short && s.address, `${s.id} is missing a name, label or address`);
      assert.ok(s.short.length <= 16, `${s.id} wheel label is long: ${s.short}`);
      assert.ok(!names.has(nameKey(s.name)), `${s.name} is listed twice in ${cat}`);
      names.add(nameKey(s.name));
      for (const text of [s.vibe, s.heads, s.deal].filter(Boolean)) assert.ok(!text.includes("—"), `em dash in ${s.id}`);
      if (s.price != null) assert.match(s.price, /^\${1,3}$/, `${s.id} has a bad price`);
      if (s.style != null) assert.ok(["counter", "sit-down", "food hall"].includes(s.style), `${s.id} has a bad style`);
      if (s.when) {
        assert.ok(s.deal, `${s.id} has deal hours but no deal`);
        assert.ok(s.when.days.every((d) => d >= 0 && d <= 6), `${s.id} has a bad day`);
        assert.ok(s.when.to == null || s.when.to > s.when.from, `${s.id} deal ends before it starts`);
      }
    }
  }
  const byId = new Map();
  for (const cat of CATS) for (const s of SPOTS[cat]) {
    if (byId.has(s.id)) assert.deepEqual(byId.get(s.id), s, `${s.id} differs between wheels`);
    byId.set(s.id, s);
  }
});

test("lunch is its own wheel and old saved lists gain it", () => {
  assert.ok(CATS.includes("lunch") && !DRINKS.includes("lunch"));
  const old = { rev: 3, spots: { comfort: SPOTS.comfort.slice(0, 3) }, removed: [] };
  const doc = normalizeDoc(old);
  assert.equal(doc.spots.comfort.length, 3);
  assert.deepEqual(doc.spots.lunch.map((s) => s.id), SPOTS.lunch.map((s) => s.id));
  const added = applyOp(doc, { op: "add", cat: "lunch", name: "Gene's Flatbread" });
  assert.ok(!added.error);
  assert.ok(added.doc.spots.lunch.some((s) => s.name === "Gene's Flatbread"));
});

test("add, refuse a duplicate, remove, restore", () => {
  let doc = seedDoc();
  const added = applyOp(doc, { op: "add", cat: "adventure", name: "  The   Tam ", note: "Cash only" });
  doc = ok(added);
  assert.equal(added.spot.name, "The Tam");
  assert.equal(added.spot.short, "Tam");
  assert.equal(added.spot.vibe, "Cash only");
  assert.ok(added.spot.custom);
  const dup = applyOp(doc, { op: "add", cat: "adventure", name: "tam" });
  assert.equal(dup.status, 409);
  doc = ok(applyOp(doc, { op: "remove", cat: "adventure", id: added.spot.id }));
  assert.ok(!doc.spots.adventure.some((s) => s.id === added.spot.id));
  assert.equal(doc.removed[0].id, added.spot.id);
  doc = ok(applyOp(doc, { op: "restore", id: added.spot.id, cat: "adventure" }));
  assert.ok(doc.spots.adventure.some((s) => s.id === added.spot.id));
  assert.equal(doc.removed.length, 0);
  assert.equal(doc.rev, 3);
});

test("re-adding a removed spot by name brings its details back", () => {
  let doc = ok(applyOp(seedDoc(), { op: "remove", cat: "comfort", id: "black-rose" }));
  const back = applyOp(doc, { op: "add", cat: "comfort", name: "black rose" });
  doc = ok(back);
  assert.equal(back.spot.id, "black-rose");
  assert.equal(back.spot.address, "160 State St");
});

test("a place on two wheels is removed and restored per wheel", () => {
  let doc = ok(applyOp(seedDoc(), { op: "remove", cat: "comfort", id: "state-street-provisions" }));
  doc = ok(applyOp(doc, { op: "remove", cat: "oysters", id: "state-street-provisions" }));
  assert.equal(doc.removed.filter((r) => r.id === "state-street-provisions").length, 2);
  doc = ok(applyOp(doc, { op: "restore", id: "state-street-provisions", cat: "oysters" }));
  assert.ok(doc.spots.oysters.some((s) => s.id === "state-street-provisions"));
  assert.ok(!doc.spots.comfort.some((s) => s.id === "state-street-provisions"));
});

test("limits hold", () => {
  let doc = seedDoc();
  doc.spots.oysters = doc.spots.oysters.slice(0, LIMITS.minPerWheel);
  const tooFew = applyOp(doc, { op: "remove", cat: "oysters", id: doc.spots.oysters[0].id });
  assert.ok(tooFew.error);
  doc = seedDoc();
  for (let i = 0; doc.spots.comfort.length < LIMITS.perWheel; i++) doc = ok(applyOp(doc, { op: "add", cat: "comfort", name: `Bar ${i}` }));
  assert.ok(applyOp(doc, { op: "add", cat: "comfort", name: "One too many" }).error);
  assert.ok(applyOp(seedDoc(), { op: "add", cat: "nope", name: "X" }).error);
  assert.ok(applyOp(seedDoc(), { op: "add", cat: "comfort", name: "   " }).error);
  assert.ok(applyOp(seedDoc(), { op: "drop-table" }).error);
});

test("names are cleaned", () => {
  const r = applyOp(seedDoc(), { op: "add", cat: "comfort", name: "<b>Lucky's</b>\u0007 Lounge" + "x".repeat(80) });
  assert.ok(!/[<>\u0007]/.test(r.spot.name));
  assert.ok(r.spot.name.length <= LIMITS.name);
});

test("reset puts the originals back and parks added spots", () => {
  let doc = ok(applyOp(seedDoc(), { op: "add", cat: "oysters", name: "Row 34" }));
  doc = ok(applyOp(doc, { op: "remove", cat: "oysters", id: "neptune-oyster" }));
  doc = ok(applyOp(doc, { op: "reset", cat: "oysters" }));
  assert.deepEqual(doc.spots.oysters.map((s) => s.id), SPOTS.oysters.map((s) => s.id));
  assert.ok(doc.removed.some((r) => r.name === "Row 34"));
  assert.ok(!doc.removed.some((r) => r.id === "neptune-oyster"));
});

test("bad stored data is repaired, and corrections in spots.js show through", () => {
  const doc = normalizeDoc({ rev: "7", spots: { comfort: [{ id: "black-rose", name: "Old name" }, { nope: 1 }], oysters: "junk" }, removed: [{}] });
  assert.equal(doc.rev, 7);
  assert.equal(doc.spots.comfort.length, 1);
  assert.equal(doc.spots.oysters.length, SPOTS.oysters.length);
  assert.equal(doc.removed.length, 0);
  assert.equal(view(doc).spots.comfort[0].name, "The Black Rose");
});

test("a new spot keeps every detail it was given, cleaned", () => {
  const r = applyOp(seedDoc(), {
    op: "add",
    cat: "oysters",
    spot: {
      name: "Lucky's Lounge",
      short: "Lucky's",
      vibe: " Sinatra on the jukebox,  red booths ",
      address: "355 Congress St",
      walk: "9",
      rating: "4.25",
      price: "$$",
      deal: "$1 oysters",
      when: { days: [5, 1, 1, 9], from: "16", to: "19" },
      heads: "Cash only.",
      url: "luckyslounge.com",
    },
  });
  assert.ok(!r.error, r.message);
  assert.deepEqual(r.spot, {
    id: r.spot.id,
    name: "Lucky's Lounge",
    short: "Lucky's",
    custom: true,
    vibe: "Sinatra on the jukebox, red booths",
    address: "355 Congress St",
    walk: 9,
    rating: 4.3,
    deal: "$1 oysters",
    when: { days: [1, 5], from: 16, to: 19 },
    heads: "Cash only.",
    url: "https://luckyslounge.com/",
  });
});

test("bad details are dropped instead of saved", () => {
  const d = (spot, cat = "comfort") => cleanDetails(spot, cat);
  for (const url of ["javascript:alert(1)", "JavaScript:alert(1)", "mailto:a@b.com", "data:text/html,hi", "localhost", "not a site"]) {
    assert.equal(d({ url }).url, undefined, url);
  }
  assert.equal(d({ url: "http://bar.com/menu?x=1" }).url, "http://bar.com/menu?x=1");
  assert.equal(d({ url: "www.bar.com:8080/x" }).url, "https://www.bar.com:8080/x");
  assert.equal(d({ rating: 7 }).rating, undefined);
  assert.equal(d({ rating: "abc" }).rating, undefined);
  assert.equal(d({ walk: 0 }).walk, undefined);
  assert.equal(d({ walk: 200 }).walk, undefined);
  assert.equal(d({ deal: "$1 oysters", when: { days: [1], from: 18, to: 17 } }).when, undefined);
  assert.equal(d({ deal: "$1 oysters", when: { days: [], from: 15, to: 17 } }).when, undefined);
  assert.equal(d({ deal: "$1 oysters", when: { days: [1], from: null, to: 17 } }).when, undefined);
  assert.equal(d({ deal: "$1 oysters", when: { days: [1], from: 15.25, to: 17 } }).when, undefined);
  assert.equal(d({ when: { days: [1], from: 15, to: 17 } }).when, undefined, "hours without a deal");
  assert.deepEqual(d({ deal: "Half-price wings", when: { days: [2], from: 21, to: null } }).when, { days: [2], from: 21, to: null });
  assert.equal(d({ heads: "<script>x</script>" }).heads, "scriptx/script");
  assert.equal(d({ vibe: "x".repeat(200) }).vibe.length, LIMITS.vibe);
});

test("lunch spots get price and style, bars get deals", () => {
  const lunch = cleanDetails({ price: "$$$$", style: "sit-down", deal: "Free cookie", when: { days: [1], from: 12, to: 13 } }, "lunch");
  assert.deepEqual(lunch, { price: "$$$$", style: "sit-down" });
  assert.deepEqual(cleanDetails({ price: "$$$$$", style: "buffet" }, "lunch"), {});
  const bar = cleanDetails({ price: "$$", style: "counter", deal: "$5 drafts" }, "adventure");
  assert.deepEqual(bar, { deal: "$5 drafts" });
});

test("every starting spot survives being opened and saved unchanged", () => {
  for (const cat of CATS) {
    for (const s of SPOTS[cat]) {
      const d = detailsOf(s, cat);
      for (const [key, value] of Object.entries(s)) {
        if (["id", "name", "unsure"].includes(key)) continue;
        assert.deepEqual(d[key], value, `${s.id}.${key}`);
      }
    }
  }
});

test("editing a starting spot sticks, and spots.js no longer overrides it", () => {
  const base = SPOTS.comfort.find((s) => s.id === "mr-dooleys");
  const r = applyOp(seedDoc(), { op: "update", cat: "comfort", id: "mr-dooleys", spot: { ...detailsOf(base, "comfort"), name: base.name, walk: 7, heads: "Trivia on Tuesdays." } });
  assert.ok(!r.error, r.message);
  const shown = view(r.doc).spots.comfort.find((s) => s.id === "mr-dooleys");
  assert.equal(shown.walk, 7);
  assert.equal(shown.heads, "Trivia on Tuesdays.");
  assert.equal(shown.address, base.address);
  assert.ok(shown.edited && !shown.custom);
  assert.equal(r.message, "Saved Mr. Dooley's.");
});

test("editing can clear a detail, rename, and keep the id", () => {
  let doc = seedDoc();
  const added = applyOp(doc, { op: "add", cat: "adventure", spot: { name: "Green Dragon", vibe: "Where the minutemen met." } });
  doc = ok(added);
  const r = applyOp(doc, { op: "update", cat: "adventure", id: added.spot.id, spot: { name: "The Green Dragon Tavern", address: "11 Marshall St" } });
  doc = ok(r);
  const s = doc.spots.adventure.find((x) => x.id === added.spot.id);
  assert.equal(s.name, "The Green Dragon Tavern");
  assert.equal(s.short, "Green Dragon Tavern");
  assert.equal(s.address, "11 Marshall St");
  assert.equal(s.vibe, undefined);
  assert.ok(s.custom && !s.edited);
});

test("editing a place on two wheels updates both", () => {
  const base = SPOTS.comfort.find((s) => s.id === "state-street-provisions");
  const doc = ok(
    applyOp(seedDoc(), {
      op: "update",
      cat: "oysters",
      id: base.id,
      spot: { ...detailsOf(base, "oysters"), name: base.name, when: { days: [1, 2, 3, 4, 5], from: 15, to: 18 } },
    })
  );
  for (const cat of ["comfort", "oysters"]) {
    assert.deepEqual(view(doc).spots[cat].find((s) => s.id === base.id).when, { days: [1, 2, 3, 4, 5], from: 15, to: 18 }, cat);
  }
});

test("edits refuse a taken name and a missing spot", () => {
  const taken = applyOp(seedDoc(), { op: "update", cat: "comfort", id: "black-rose", spot: { name: "mr dooleys" } });
  assert.equal(taken.status, 409);
  const gone = applyOp(seedDoc(), { op: "update", cat: "comfort", id: "nope", spot: { name: "Nope" } });
  assert.equal(gone.status, 404);
  const blank = applyOp(seedDoc(), { op: "update", cat: "comfort", id: "black-rose", spot: { name: "  " } });
  assert.equal(blank.status, 400);
});

test("re-adding a removed starting spot with new details keeps the rest", () => {
  let doc = ok(applyOp(seedDoc(), { op: "remove", cat: "comfort", id: "black-rose" }));
  const back = applyOp(doc, { op: "add", cat: "comfort", spot: { name: "black rose", walk: 4 } });
  doc = ok(back);
  const s = view(doc).spots.comfort.find((x) => x.id === "black-rose");
  assert.equal(s.walk, 4);
  assert.equal(s.address, "160 State St");
  assert.equal(s.name, "The Black Rose");
  assert.ok(s.edited);
});

test("deal days and hours read naturally", () => {
  assert.equal(schedule({ days: [1, 2, 3, 4, 5], from: 15, to: 18 }), "Mon–Fri, 3–6pm");
  assert.equal(schedule({ days: [1, 5], from: 16, to: 19 }), "Mon and Fri, 4–7pm");
  assert.equal(schedule({ days: [4], from: 17, to: null }), "Thursdays from 5pm");
  assert.equal(schedule({ days: [0, 1, 2, 3, 4, 5, 6], from: 14, to: 18 }), "Daily, 2–6pm");
  assert.equal(schedule({ days: [0, 6], from: 11.5, to: 14 }), "Sat and Sun, 11:30am–2pm");
  assert.equal(schedule({ days: [1, 2, 4], from: 21, to: 24 }), "Mon, Tue and Thu, 9pm–midnight");
  assert.equal(schedule(null), "");
  for (const cat of CATS) for (const s of SPOTS[cat]) if (s.deal) assert.ok(!/\d(am|pm)|day/i.test(s.deal), `${s.id} repeats its hours in the deal text`);
});

console.log(`\n${passed} passed`);
