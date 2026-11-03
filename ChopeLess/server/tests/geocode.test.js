// Address lookup tests. Owner: M2
// Never calls the real Nominatim: fetch, the clock and console.warn are all fake.

import test from "node:test";
import assert from "node:assert/strict";

import { lookupAddress } from "../routes/geocode.js";

// ---- Fakes ----

// A fake clock. Each test moves it on by 11 minutes, so old cache entries and the one-per-second limit don't carry over.
let fakeNow = 1000000;
Date.now = () => fakeNow;

// Keep warnings off the screen
console.warn = () => {};

// fetch: remembers every call (url and headers) and answers with whatever the test set
let calls = [];
function fakeFetch(reply) {
  globalThis.fetch = async (url, options) => {
    calls.push({ url, headers: options?.headers || {} });
    if (reply instanceof Error) throw reply;   // e.g. a timeout
    return reply;
  };
}
const okReply = data => ({ ok: true, status: 200, json: async () => data });

// What Nominatim sends back: strings for lat and lon
const albertCentre = { display_name: "270, Queen Street, Bugis, Singapore, 180270", lat: "1.3016", lon: "103.8529" };
const waterloo = { display_name: "Waterloo Centre, 261, Waterloo Street, Singapore", lat: "1.2996", lon: "103.853" };

// Checks that lookupAddress fails with this HTTP status
async function expectStatus(promise, status) {
  await assert.rejects(promise, err => err.status === status);
}

test.beforeEach(() => {
  calls = [];
  fakeNow += 11 * 60 * 1000;
});

// ---- Tests ----

test("a normal result: labels and number coordinates, from a Singapore-only search", async () => {
  fakeFetch(okReply([albertCentre, waterloo]));

  const answer = await lookupAddress("  270 Queen Street ");

  assert.deepEqual(answer, {
    results: [
      { label: "270, Queen Street, Bugis, Singapore, 180270", lat: 1.3016, lng: 103.8529 },
      { label: "Waterloo Centre, 261, Waterloo Street, Singapore", lat: 1.2996, lng: 103.853 }
    ]
  });
  assert.equal(calls.length, 1);
  assert.ok(calls[0].url.startsWith("https://nominatim.openstreetmap.org/search?q=270%20Queen%20Street&"));
  assert.ok(calls[0].url.includes("format=json") && calls[0].url.includes("limit=3") && calls[0].url.includes("countrycodes=sg"));
  assert.equal(calls[0].headers["User-Agent"], "ChopeLess-student-project");
});

test("nothing found: an empty list, not an error", async () => {
  fakeFetch(okReply([]));

  assert.deepEqual(await lookupAddress("Nowhere Lane 999"), { results: [] });
});

test("Nominatim failing (an error reply or a timeout) gives a 502", async () => {
  fakeFetch({ ok: false, status: 503, json: async () => ({}) });
  await expectStatus(lookupAddress("Bras Basah Complex"), 502);

  fakeNow += 2000;   // wait out the one-per-second limit before the second try
  fakeFetch(new Error("The operation was aborted due to timeout"));
  await expectStatus(lookupAddress("Bras Basah Complex"), 502);
});

test("the cache: the same address again (any capitals or spaces) doesn't call Nominatim twice", async () => {
  fakeFetch(okReply([albertCentre]));

  const first = await lookupAddress("270 Queen Street");
  fakeNow += 5 * 1000;
  const second = await lookupAddress("  270 QUEEN street ");

  assert.deepEqual(second, first);
  assert.equal(calls.length, 1);

  // After 10 minutes the saved answer is too old, so it asks again
  fakeNow += 10 * 60 * 1000;
  await lookupAddress("270 Queen Street");
  assert.equal(calls.length, 2);
});

test("at most one call per second: a second lookup right away is turned down, then works a second later", async () => {
  fakeFetch(okReply([waterloo]));

  await lookupAddress("Waterloo Street");
  fakeNow += 500;
  await expectStatus(lookupAddress("Queen Street"), 429);
  assert.equal(calls.length, 1);

  fakeNow += 600;   // now 1.1 seconds after the first call
  await lookupAddress("Queen Street");
  assert.equal(calls.length, 2);
});

test("the address must be 3 to 200 characters (after trimming)", async () => {
  fakeFetch(okReply([]));

  await expectStatus(lookupAddress("  ab  "), 400);
  await expectStatus(lookupAddress("x".repeat(201)), 400);
  await expectStatus(lookupAddress(undefined), 400);
  assert.equal(calls.length, 0);
});
