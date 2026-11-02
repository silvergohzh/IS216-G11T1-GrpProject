// Shortlist engine tests. Owner: M2
// No emulator needed: we swap out the database and the OSRM walking server for fake ones.

import test from "node:test";
import assert from "node:assert/strict";

import { db } from "../firebase.js";
import { buildShortlist } from "../services/shortlist.js";

// ---- Fake database: buildShortlist reads db.collection(name).get() ----
let fakeData = { places: [], gems: [] };

db.collection = name => ({
  get: async () => ({
    docs: (fakeData[name] || []).map(row => ({ id: row.id, data: () => row }))
  })
});

// ---- Fake OSRM: each place's walking time is stored by its "lng,lat" ----
// Make sure offline mode is off (even if server/.env turns it on), so the fake below is used
process.env.OSRM_OFFLINE = "false";
const walkTimes = new Map();

globalThis.fetch = async url => {
  const to = url.split("/").pop().split("?")[0].split(";")[1]; // "lng,lat" of the place
  const mins = walkTimes.get(to);
  return { ok: true, json: async () => ({ routes: [{ duration: mins * 60 }] }) };
};

// ---- Helpers to make test data ----
let nextLng = 103.8;

// A normal seeded place, `walk` minutes from the meeting point, with no queue
function place(id, walk, extra = {}) {
  nextLng += 0.001;
  const p = {
    id, name: id, lat: 1.3, lng: nextLng, priceMin: 3, priceMax: 6, dietary: [],
    serviceModes: ["dine-in", "takeaway"], latest: { waitMins: 0 }, ...extra
  };
  walkTimes.set(`${p.lng},${p.lat}`, walk);
  return p;
}

// A gem's copy in "places", the way gems.js makes it (fromGem: true, but no isGem)
function gemCopy(id, walk, extra = {}) {
  return place(id, walk, { fromGem: true, gemId: id, ...extra });
}

function makeSession(overrides = {}) {
  return {
    serviceMode: "dine-in",
    maxWalkMins: 60,
    maxWaitMins: 60,
    meetingPoint: { lat: 1.3, lng: 103.8, label: "Meeting point" },
    members: { a: { name: "A", budget: 10, dietary: [] } },
    ...overrides
  };
}

// Ten normal places that walk 1, 2, 3 ... minutes (or start from another number)
const tenPlaces = (start = 1) => Array.from({ length: 10 }, (_, i) => place("p" + i, start + i));

const ids = list => list.map(p => p.id);
const totalTime = p => p.walkMins + p.waitMins;
const isSorted = list => list.every((p, i) => i === 0 || totalTime(list[i - 1]) <= totalTime(p));

// ---- Tests ----

test("a slow gem takes the last slot, and the list stays sorted", async () => {
  fakeData = { places: [...tenPlaces(), gemCopy("slow-gem", 20)], gems: [] };

  const list = await buildShortlist(makeSession());

  assert.deepEqual(ids(list), ["p0", "p1", "p2", "p3", "p4", "p5", "p6", "slow-gem"]);
  assert.equal(list[7].isGem, true);
  assert.ok(isSorted(list));
});

test("a gem already in the top 8 is left where it is", async () => {
  fakeData = { places: [...tenPlaces(2), gemCopy("near-gem", 1)], gems: [] };

  const list = await buildShortlist(makeSession());

  assert.deepEqual(ids(list), ["near-gem", "p0", "p1", "p2", "p3", "p4", "p5", "p6"]);
  assert.equal(list.filter(p => p.isGem).length, 1);
});

test("with no gems, it is just the 8 quickest places", async () => {
  fakeData = { places: tenPlaces(), gems: [] };

  const list = await buildShortlist(makeSession());

  assert.deepEqual(ids(list), ["p0", "p1", "p2", "p3", "p4", "p5", "p6", "p7"]);
  assert.ok(!list.some(p => p.isGem));
});

test("a gem over the walk limit is not forced in", async () => {
  fakeData = { places: [...tenPlaces(), gemCopy("far-gem", 99)], gems: [] };

  const list = await buildShortlist(makeSession());

  assert.ok(!list.some(p => p.isGem));
});

test("with fewer than 8 places, everything that fits is kept", async () => {
  fakeData = { places: [place("p0", 1), place("p1", 2), gemCopy("gem", 9)], gems: [] };

  const list = await buildShortlist(makeSession());

  assert.deepEqual(ids(list), ["p0", "p1", "gem"]);
});

test("a gem with 3 upvotes gives exactly one shortlist entry", async () => {
  // The gem is in BOTH collections, like in the real app: the gem itself, and its copy in "places"
  const copy = gemCopy("laksa-corner", 3, { name: "Laksa Corner", latest: { waitMins: 10 } });
  fakeData = {
    places: [place("p0", 5), copy],
    gems: [{ id: "laksa-corner", name: "Laksa Corner", lat: copy.lat, lng: copy.lng, upvoters: ["u1", "u2", "u3"] }]
  };

  const list = await buildShortlist(makeSession());
  const entries = list.filter(p => p.name === "Laksa Corner");

  assert.equal(entries.length, 1);
  assert.equal(entries[0].id, "laksa-corner");
  assert.equal(entries[0].isGem, true);
  assert.equal(entries[0].waitMins, 10); // uses the gem's real wait time, not 0
});

test("a dine-in-only gem is left out of a takeaway session", async () => {
  // Like the real app, the gem is also in the "gems" collection with its 3 upvotes
  const copy = gemCopy("dine-in-gem", 2, { serviceModes: ["dine-in"] });
  fakeData = {
    places: [place("p0", 1), copy],
    gems: [{ id: "dine-in-gem", name: "dine-in-gem", lat: copy.lat, lng: copy.lng, serviceModes: ["dine-in"], upvoters: ["u1", "u2", "u3"] }]
  };

  const list = await buildShortlist(makeSession({ serviceMode: "takeaway" }));

  assert.deepEqual(ids(list), ["p0"]);
});
