// Walking time tests. Owner: M2
// No internet needed: every test swaps fetch (and the clock) for fake ones.

import test from "node:test";
import assert from "node:assert/strict";

import { walkingMinutes, walkingRoute } from "../services/osrm.js";

const smu = { lat: 1.2966, lng: 103.8502 };
const brasBasah = { lat: 1.2967, lng: 103.8537 };
const straightLine = [[1.2966, 103.8502], [1.2967, 103.8537]];
const straightLineMins = 6;   // the straight-line estimate from SMU to Bras Basah

// ---- Fakes ----

// A fake clock. osrm.js only warns once a minute, so each test moves the clock on by 2 minutes
// to start fresh, and the "once a minute" test moves it by hand.
let fakeNow = 1000000;
Date.now = () => fakeNow;

// Every console.warn goes into this list instead of the screen
let warnings = [];
console.warn = message => warnings.push(message);

// fetch calls go to whatever reply the test sets; this counts the calls too
let fetchCalls = 0;
function fakeFetch(reply) {
  globalThis.fetch = async () => {
    fetchCalls++;
    if (reply instanceof Error) throw reply;   // e.g. no internet
    return reply;
  };
}

// A reply that looks like a real OSRM answer
const okReply = data => ({ ok: true, status: 200, json: async () => data });

// Before each test: offline mode off, no warnings yet, and a minute and more has passed since the last one
test.beforeEach(() => {
  delete process.env.OSRM_OFFLINE;
  warnings = [];
  fetchCalls = 0;
  fakeNow += 2 * 60 * 1000;
});

// ---- Tests ----

test("a good reply: walking minutes come from the reply's duration (seconds)", async () => {
  fakeFetch(okReply({ routes: [{ duration: 450 }] }));   // 450 seconds = 7.5 minutes

  assert.equal(await walkingMinutes(smu, brasBasah), 8);
  assert.deepEqual(warnings, []);
});

test("a good route reply: GeoJSON [lng, lat] points are turned into [lat, lng]", async () => {
  fakeFetch(okReply({
    routes: [{ geometry: { coordinates: [[103.8502, 1.2966], [103.852, 1.2968], [103.8537, 1.2967]] } }]
  }));

  assert.deepEqual(await walkingRoute(smu, brasBasah), [
    [1.2966, 103.8502],
    [1.2968, 103.852],
    [1.2967, 103.8537]
  ]);
  assert.deepEqual(warnings, []);
});

test("OSRM answers with an error (not OK): straight-line estimate, and one warning", async () => {
  fakeFetch({ ok: false, status: 503, json: async () => ({}) });

  assert.equal(await walkingMinutes(smu, brasBasah), straightLineMins);
  assert.deepEqual(warnings, ["OSRM unavailable (OSRM 503), using straight-line estimate"]);
});

test("OSRM can't be reached (fetch throws): straight line, and one warning", async () => {
  fakeFetch(new Error("getaddrinfo ENOTFOUND"));

  assert.deepEqual(await walkingRoute(smu, brasBasah), straightLine);
  assert.deepEqual(warnings, ["OSRM unavailable (getaddrinfo ENOTFOUND), using a straight line"]);
});

test("many failures in a row only warn once a minute", async () => {
  fakeFetch(new Error("timeout"));

  // A shortlist checking 14 places: only the first failure is printed
  for (let i = 0; i < 14; i++) await walkingMinutes(smu, brasBasah);
  assert.equal(warnings.length, 1);

  // 59 seconds later: still quiet
  fakeNow += 59 * 1000;
  await walkingMinutes(smu, brasBasah);
  assert.equal(warnings.length, 1);

  // Over a minute after the first warning: it warns again
  fakeNow += 2 * 1000;
  await walkingMinutes(smu, brasBasah);
  assert.equal(warnings.length, 2);
});

test("offline mode: straight line, no internet, and no warning", async () => {
  process.env.OSRM_OFFLINE = "true";
  fakeFetch(new Error("No internet in offline mode"));

  assert.equal(await walkingMinutes(smu, brasBasah), straightLineMins);
  assert.deepEqual(await walkingRoute(smu, brasBasah), straightLine);
  assert.equal(fetchCalls, 0);
  assert.deepEqual(warnings, []);
});
