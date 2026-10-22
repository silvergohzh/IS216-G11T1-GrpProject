
import test from "node:test";
import assert from "node:assert/strict";

import {
  rankPlaces,
  decide,
  mostLiked
} from "../services/winner.js";

const places = [
  { id: "A", name: "Restaurant A", walkMins: 5, waitMins: 5 },
  { id: "B", name: "Restaurant B", walkMins: 8, waitMins: 5 },
  { id: "C", name: "Restaurant C", walkMins: 10, waitMins: 5 }
];

function makeSession(overrides = {}) {
  return {
    shortlist: places,
    votes: {},
    superLikes: {},
    vetoes: {},
    round: 1,
    ...overrides
  };
}

test("YES vote makes a restaurant eligible", () => {
  const session = makeSession({
    votes: {
      A: { user1: true }
    }
  });

  const ranked = rankPlaces(session);

  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].place.id, "A");
  assert.equal(ranked[0].score, 1);
});

test("Super Like counts as two points", () => {
  const session = makeSession({
    votes: {
      A: { user1: true }
    },
    superLikes: {
      user1: "A"
    }
  });

  const ranked = rankPlaces(session);

  assert.equal(ranked[0].score, 2);
});

test("NO vote excludes a restaurant from normal selection", () => {
  const session = makeSession({
    votes: {
      A: {
        user1: true,
        user2: false
      },
      B: {
        user1: true
      }
    }
  });

  const result = decide(session);

  assert.equal(result.winner.id, "B");
});

test("Vetoed restaurants cannot win", () => {
  const session = makeSession({
    votes: {
      A: { user1: true },
      B: { user1: true }
    },
    vetoes: {
      user2: "A"
    }
  });

  const result = decide(session);

  assert.equal(result.winner.id, "B");
});

test("Missing votes count as abstentions", () => {
  const session = makeSession({
    votes: {
      A: { user1: true }
    }
  });

  const result = decide(session);

  assert.equal(result.winner.id, "A");
});

test("Highest score wins", () => {
  const session = makeSession({
    votes: {
      A: { user1: true },
      B: { user1: true }
    },
    superLikes: {
      user1: "B"
    }
  });

  const result = decide(session);

  assert.equal(result.winner.id, "B");
});

test("Tie-break winner belongs to tied candidates", () => {
  const session = makeSession({
    votes: {
      A: { user1: true },
      B: { user2: true }
    }
  });

  const result = decide(session);

  assert.ok(["A", "B"].includes(result.winner.id));
  assert.equal(result.tieBreak.candidates.length, 2);
  assert.equal(result.tieBreak.winnerId, result.winner.id);
});

test("No eligible places returns null in Round 1", () => {
  const session = makeSession({
    votes: {
      A: { user1: false },
      B: { user1: false },
      C: { user1: false }
    }
  });

  assert.equal(decide(session), null);
});

test("Round 2 fallback never selects vetoed places", () => {
  const session = makeSession({
    round: 2,
    votes: {
      A: { user1: true },
      B: { user1: false }
    },
    vetoes: {
      user2: "A"
    }
  });

  const result = mostLiked(session);

  assert.equal(result.winner.id, "B");
});

test("All vetoed places produce no winner", () => {
  const session = makeSession({
    round: 2,
    vetoes: {
      user1: "A",
      user2: "B",
      user3: "C"
    }
  });

  const result = mostLiked(session);

  assert.equal(result.winner, null);
  assert.equal(result.status, "done");
});
