// Checks the shared-list rules and the starting data. No network, no browser.
//   npm test
import assert from "node:assert/strict";
import { CATS, DRINKS, LIMITS, applyOp, nameKey, normalizeDoc, seedDoc, view } from "../data/ops.js";
import { SPOTS } from "../data/spots.js";

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
  assert.equal(added.spot.note, "Cash only");
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

console.log(`\n${passed} passed`);
