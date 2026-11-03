
/*
 * ChopeLess — Makan Session Voting Engine
 *
 * Supports:
 * - YES / NO voting
 * - 45-second default voting timer
 * - One free Super Like per member
 * - Purchased Super Likes (20 Makan Points each)
 * - Extra Super Like scoring
 * - One Veto per member
 * - Round 2
 * - Winner selection and tie-breaking
 * - Makan History
 * - Makan Points rewards
 * - Refunds for unused purchased Super Likes
 */

import { Router } from "express";
import { db } from "../firebase.js";
import { requireAuth } from "../middleware/auth.js";
// [JANANIJ] START: Import QueueLess re-vote shortlist alongside existing shortlist
import { buildShortlist, buildRevoteShortlist } from "../services/shortlist.js";
// [JANANIJ] END
import { decide, mostLiked } from "../services/winner.js";


import {
  awardSessionPoints,
  purchaseExtraSuperLike,
  refundUnusedSuperLikes
} from "../services/points.js";

const router = Router();

router.use(requireAuth);

const fail = (status, message) =>
  Object.assign(new Error(message), { status });

// =====================================================
// HELPERS
// =====================================================

function isExpired(session) {
  if (!session.expiresAt) return false;

  const expiry =
    typeof session.expiresAt.toMillis === "function"
      ? session.expiresAt.toMillis()
      : typeof session.expiresAt === "number"
        ? session.expiresAt
        : new Date(session.expiresAt).getTime();

  return Date.now() >= expiry;
}

function votingDuration(session) {
  return session.voteSeconds ?? 45;
}

function purchasedSuperLikesAvailable(session, uid) {
  const record = session.extraSuperLikes?.[uid] || {};

  return Math.max(
    0,
    (record.purchased || 0) -
      (record.used || 0) -
      (record.refunded || 0)
  );
}

// =====================================================
// MAKAN HISTORY
// =====================================================

async function saveHistory(session, winner) {
  if (!winner) return;

  const memberIds = Object.keys(session.members || {});

  if (!memberIds.length) return;

  const batch = db.batch();

  for (const uid of memberIds) {
    const historyRef = db
      .collection("users")
      .doc(uid)
      .collection("history")
      .doc(session.code);

    batch.set(historyRef, {
      code: session.code,
      placeId: winner.id,
      placeName: winner.name,
      cuisine: winner.cuisine || "",
      groupSize: memberIds.length,
      groupId: session.groupId || null,
      at: Date.now()
    });
  }

  await batch.commit();
}

// =====================================================
// REWARDS AND REFUNDS
// =====================================================

async function processCompletedSession(sessionCode) {
  const snap = await db
    .collection("sessions")
    .doc(sessionCode)
    .get();

  if (!snap.exists) return;

  const session = snap.data();

  if (session.status !== "done") return;

  // Refund unused purchased Super Likes,
  // including sessions that end without a winner.
  await refundUnusedSuperLikes(sessionCode);

  if (!session.winner) return;

  await saveHistory(session, session.winner);
  await awardSessionPoints(session);
}

// =====================================================
// ROUND 2
// =====================================================

async function startRound2(ref) {
  const firstSnap = await ref.get();

  if (!firstSnap.exists) return {};

  const first = firstSnap.data();

  if (
    first.status !== "voting" ||
    (first.round || 1) !== 1
  ) {
    return {};
  }

  const relaxed = {
    ...first,
    maxWalkMins: (first.maxWalkMins ?? 10) + 5,
    maxWaitMins: (first.maxWaitMins ?? 15) + 10
  };

  const seen = new Set(
    (first.shortlist || []).map(place => place.id)
  );

  const vetoedIds = new Set(
    Object.values(first.vetoes || {})
  );

  // [NAWAZ] START: Round 2 only looks at places the group hasn't seen or vetoed
  // They are left out BEFORE the top-8 cap, so every Round 2 slot can go to a fresh place.
  let list = await buildShortlist(relaxed, {
    excludeIds: [...seen, ...vetoedIds]
  });
  // [NAWAZ] END

  if (!list.length) {
    list = (first.shortlist || []).filter(
      place => !vetoedIds.has(place.id)
    );
  }

  list = list.map(place => ({
    ...place,
    outside:
      place.walkMins > (first.maxWalkMins ?? 10) ||
      place.waitMins > (first.maxWaitMins ?? 15)
  }));

  const outcome = await db.runTransaction(async tx => {
    const snap = await tx.get(ref);

    if (!snap.exists) return {};

    const session = snap.data();

    if (
      session.status !== "voting" ||
      (session.round || 1) !== 1
    ) {
      return {};
    }

    const latestVetoed = new Set(
      Object.values(session.vetoes || {})
    );

    const safeList = list.filter(
      place => !latestVetoed.has(place.id)
    );

    if (!safeList.length) {
      tx.update(ref, {
        status: "done",
        winner: null,
        tieBreak: null,
        completedAt: Date.now()
      });

      return { done: true };
    }

    const seconds = votingDuration(session);

    tx.update(ref, {
      round: 2,
      shortlist: safeList,

      // Round 2 starts a fresh set of normal votes.
      votes: {},

      // Preserve special votes used in Round 1.
      superLikes: session.superLikes || {},
      vetoes: session.vetoes || {},

      // Preserve purchased extras and their usage.
      extraSuperLikes: session.extraSuperLikes || {},

      // Preserve the restaurants that received
      // purchased Super Likes in Round 1.
      extraSuperLikeVotes:
        session.extraSuperLikeVotes || {},

      votingEndsAt: seconds
        ? Date.now() + seconds * 1000
        : null
    });

    return { round2: true };
  });

  if (outcome.done) {
    await processCompletedSession(ref.id);
  }

  return outcome;
}

// =====================================================
// FINISH VOTING
// =====================================================

async function endVoting(ref, { requireTimeUp }) {
  const outcome = await db.runTransaction(async tx => {
    const snap = await tx.get(ref);

    if (!snap.exists) return {};

    const session = snap.data();

    if (session.status !== "voting") {
      return {};
    }

    if (
      requireTimeUp &&
      session.votingEndsAt &&
      Date.now() < session.votingEndsAt
    ) {
      throw fail(409, "Voting is still open");
    }

    const result =
      decide(session) ||
      (
        (session.round || 1) >= 2
          ? mostLiked(session)
          : null
      );

    if (!result) {
      return { round2: true };
    }

    tx.update(ref, {
      ...result,
      completedAt: Date.now()
    });

    return {
      done: true,
      winner: result.winner
    };
  });

  if (outcome.round2) {
    return startRound2(ref);
  }

  if (outcome.done) {
    await processCompletedSession(ref.id);
  }

  return outcome;
}

// =====================================================
// START VOTING
// POST /api/sessions/:code/start
// =====================================================

router.post("/:code/start", async (req, res, next) => {
  try {
    const ref = db
      .collection("sessions")
      .doc(req.params.code);

    const snap = await ref.get();

    if (!snap.exists) {
      throw fail(404, "Session not found");
    }

    const session = snap.data();

    if (session.hostUid !== req.uid) {
      throw fail(403, "Only the host can start voting");
    }

    if (session.status !== "lobby") {
      throw fail(409, "Voting has already started");
    }

    if (isExpired(session)) {
      throw fail(410, "Session has expired");
    }

    if (Object.keys(session.members || {}).length < 2) {
      throw fail(400, "You need at least 2 people to vote");
    }

    // [NAWAZ] START: the host must pick a meeting point before voting
    // Walking times are measured from the meeting point. Without one, the walk limit can't be checked.
    if (!session.meetingPoint?.lat) {
      throw fail(400, "Pick a meeting point first");
    }
    // [NAWAZ] END

    const shortlist = await buildShortlist(session);

    if (!shortlist.length) {
      throw fail(
        422,
        "No places fit the group. Try a higher budget or longer walk."
      );
    }

    await db.runTransaction(async tx => {
      const latestSnap = await tx.get(ref);

      if (!latestSnap.exists) {
        throw fail(404, "Session not found");
      }

      const latest = latestSnap.data();

      if (latest.hostUid !== req.uid) {
        throw fail(403, "Only the host can start voting");
      }

      if (latest.status !== "lobby") {
        throw fail(409, "Voting has already started");
      }

      if (isExpired(latest)) {
        throw fail(410, "Session has expired");
      }

      if (Object.keys(latest.members || {}).length < 2) {
        throw fail(400, "You need at least 2 people to vote");
      }

      const seconds = votingDuration(latest);

      tx.update(ref, {
        shortlist,
        status: "voting",
        round: 1,

        votes: {},
        superLikes: {},
        vetoes: {},

        // Purchased Super Like balances.
        extraSuperLikes: {},

        // Purchased Super Like votes by restaurant.
        // Shape: { uid: [placeId, placeId, ...] }
        extraSuperLikeVotes: {},

        tieBreak: null,
        winner: null,
        completedAt: null,

        votingEndsAt: seconds
          ? Date.now() + seconds * 1000
          : null
      });
    });

    res.json({
      ok: true,
      count: shortlist.length
    });
  } catch (err) {
    next(err);
  }
});

// =====================================================
// PURCHASE EXTRA SUPER LIKE
// POST /api/sessions/:code/buy-super-like
// =====================================================

router.post(
  "/:code/buy-super-like",
  async (req, res, next) => {
    try {
      const result = await purchaseExtraSuperLike({
        uid: req.uid,
        sessionCode: req.params.code
      });

      res.json({
        ok: true,
        ...result
      });
    } catch (err) {
      next(err);
    }
  }
);

// =====================================================
// CAST VOTE
// POST /api/sessions/:code/vote
// =====================================================

router.post("/:code/vote", async (req, res, next) => {
  try {
    const { placeId, yes, special } = req.body || {};

    if (
      typeof placeId !== "string" ||
      !placeId.trim()
    ) {
      throw fail(400, "Invalid place ID");
    }

    if (typeof yes !== "boolean") {
      throw fail(400, "Vote must be YES or NO");
    }

    if (
      special !== undefined &&
      special !== null &&
      !["super", "veto"].includes(special)
    ) {
      throw fail(400, "Unknown vote type");
    }

    const ref = db
      .collection("sessions")
      .doc(req.params.code);

    const result = await db.runTransaction(async tx => {
      const snap = await tx.get(ref);

      if (!snap.exists) {
        throw fail(404, "Session not found");
      }

      const session = snap.data();

      if (session.status !== "voting") {
        throw fail(409, "Voting is not open");
      }

      if (isExpired(session)) {
        throw fail(410, "Session has expired");
      }

      if (
        session.votingEndsAt &&
        Date.now() > session.votingEndsAt
      ) {
        throw fail(409, "Time's up");
      }

      if (!session.members?.[req.uid]) {
        throw fail(403, "You are not in this session");
      }

      const place = (session.shortlist || []).find(
        item => item.id === placeId
      );

      if (!place) {
        throw fail(
          400,
          "That place is not on the shortlist"
        );
      }

      const votes = {
        ...(session.votes || {})
      };

      const superLikes = {
        ...(session.superLikes || {})
      };

      const vetoes = {
        ...(session.vetoes || {})
      };

      const extraSuperLikes = {
        ...(session.extraSuperLikes || {})
      };

      const extraSuperLikeVotes = {
        ...(session.extraSuperLikeVotes || {})
      };

      // ---------------------------------------------
      // VALIDATE VOTE
      // ---------------------------------------------

      if (Object.values(vetoes).includes(placeId)) {
        throw fail(
          409,
          "This restaurant has been vetoed"
        );
      }

      if (votes[placeId]?.[req.uid] !== undefined) {
        throw fail(409, "You have already voted");
      }

      // ---------------------------------------------
      // SUPER LIKE
      // ---------------------------------------------

      if (special === "super") {
        if (!superLikes[req.uid]) {
          // First Super Like is free.
          superLikes[req.uid] = placeId;
        } else {
          // Free Super Like already used.
          // Consume one purchased Super Like.

          const available =
            purchasedSuperLikesAvailable(
              session,
              req.uid
            );

          if (available < 1) {
            throw fail(
              409,
              "No Super Likes remaining. Buy an extra Super Like for 20 points."
            );
          }

          const record = extraSuperLikes[req.uid] || {
            purchased: 0,
            used: 0,
            refunded: 0
          };

          // Mark one purchased Super Like as used.
          extraSuperLikes[req.uid] = {
            ...record,
            used: (record.used || 0) + 1
          };

          // IMPORTANT:
          // Record the restaurant that received it.
          // winner.js uses this to add its bonus point.
          extraSuperLikeVotes[req.uid] = [
            ...(extraSuperLikeVotes[req.uid] || []),
            placeId
          ];
        }
      }

      // ---------------------------------------------
      // VETO
      // ---------------------------------------------

      if (special === "veto") {
        if (vetoes[req.uid]) {
          throw fail(
            409,
            "You have already used your Veto"
          );
        }

        vetoes[req.uid] = placeId;
      }

      // ---------------------------------------------
      // RECORD VOTE
      // ---------------------------------------------

      const isYes =
        special === "super"
          ? true
          : special === "veto"
            ? false
            : yes;

      votes[placeId] = {
        ...(votes[placeId] || {}),
        [req.uid]: isYes
      };

      const memberIds = Object.keys(
        session.members || {}
      );

      const vetoed = Object.values(vetoes);

      const update = {
        votes,
        superLikes,
        vetoes,
        extraSuperLikes,
        extraSuperLikeVotes
      };

      // ---------------------------------------------
      // UNANIMOUS WINNER
      // ---------------------------------------------

      if (
        !vetoed.includes(placeId) &&
        memberIds.every(
          uid => votes[placeId]?.[uid] === true
        )
      ) {
        tx.update(ref, {
          ...update,
          winner: place,
          status: "done",
          tieBreak: null,
          completedAt: Date.now()
        });

        return {
          done: true,
          winner: place
        };
      }

      tx.update(ref, update);

      // ---------------------------------------------
      // CHECK IF EVERYONE HAS VOTED
      // ---------------------------------------------

      const remaining = (
        session.shortlist || []
      ).filter(
        item => !vetoed.includes(item.id)
      );

      const allVoted = remaining.every(place =>
        memberIds.every(
          uid =>
            votes[place.id]?.[uid] !== undefined
        )
      );

      return { allVoted };
    });

    if (result.done) {
      await processCompletedSession(ref.id);
    }

    if (result.allVoted) {
      await endVoting(ref, {
        requireTimeUp: false
      });
    }

    res.json({
      ok: true,
      winner: result.winner || null
    });
  } catch (err) {
    next(err);
  }
});

// =====================================================
// FINISH VOTING
// POST /api/sessions/:code/finish
// =====================================================

router.post("/:code/finish", async (req, res, next) => {
  try {
    const ref = db
      .collection("sessions")
      .doc(req.params.code);

    const snap = await ref.get();

    if (!snap.exists) {
      throw fail(404, "Session not found");
    }

        if (!snap.data().members?.[req.uid]) {
      throw fail(
        403,
        "You are not in this session"
      );
    }

    // [JANANIJ] START: Prevent original voting endpoint from finishing a re-vote
    // Re-voting must use its own finish endpoint so original votes and points are preserved.
    if (snap.data().status === "revoting") {
      throw fail(409, "Use the re-vote finish endpoint");
    }
    // [JANANIJ] END

    if (snap.data().status === "done") {
      await processCompletedSession(ref.id);

      return res.json({
        ok: true,
        alreadyFinished: true
      });
    }

    await endVoting(ref, {
      requireTimeUp: true
    });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// =====================================================
// [JANANIJ] START: QUEUELESS RE-VOTE
// =====================================================

// START RE-VOTE
// POST /api/sessions/:code/start-revote
// Host only. Finds alternatives with shorter QueueLess waits.
// Ordering must not have started.

router.post("/:code/start-revote", async (req, res, next) => {
  try {
    const ref = db.collection("sessions").doc(req.params.code);
    const snap = await ref.get();

    if (!snap.exists) throw fail(404, "Session not found");

    const session = snap.data();

    if (session.hostUid !== req.uid) {
      throw fail(403, "Only the host can start a re-vote");
    }

    if (isExpired(session)) {
      throw fail(410, "This session has expired");
    }

    if (session.status !== "done") {
      throw fail(409, "The original voting must finish first");
    }

    if (session.orderingStarted) {
      throw fail(409, "Cannot re-vote after group ordering has started");
    }

    if (session.revoteCompleted || session.revoteStartedAt) {
      throw fail(409, "This session has already used its re-vote");
    }

    if (!session.winner?.id) {
      throw fail(409, "No winning place found");
    }

    // Read the latest QueueLess report instead of trusting browser input.
    const winnerRef = db.collection("places").doc(String(session.winner.id));
    const winnerSnap = await winnerRef.get();

    if (!winnerSnap.exists) {
      throw fail(404, "Winning place not found");
    }

    // [JANANIJ] Use the latest available QueueLess report,
    // // regardless of age or confidence.
    const latest = winnerSnap.data().latest;
    const rejectedWaitMins = latest?.waitMins;
    if (
      typeof rejectedWaitMins !== "number" ||
      !Number.isFinite(rejectedWaitMins) ||
      rejectedWaitMins < 0
    ) {
      throw fail(409, "No valid QueueLess waiting-time report for the winner");
    }

    // Only trigger when the wait exceeds the group's configured maximum.
    if (rejectedWaitMins <= (session.maxWaitMins ?? 15)) {
      throw fail(
        409,
        `The estimated queue wait is ${rejectedWaitMins} minutes, which is within your group's ${session.maxWaitMins ?? 15}-minute limit. Re-voting is only available when the wait exceeds this limit.`
      );
    }

    // [JANANIJ] Find eligible alternatives with shorter reported waits.
    const alternatives = await buildRevoteShortlist(
      session,
      rejectedWaitMins
    );

    if (!alternatives.length) {
      throw fail(409, "No suitable shorter-wait alternatives are available");
    }

    // The transaction rechecks the ordering lock.
    // If ordering started while alternatives were loading, re-vote is rejected.
    await db.runTransaction(async tx => {
      const freshSnap = await tx.get(ref);

      if (!freshSnap.exists) {
        throw fail(404, "Session not found");
      }

      const fresh = freshSnap.data();

      if (
        fresh.status !== "done" ||
        fresh.orderingStarted ||
        fresh.revoteCompleted ||
        fresh.revoteStartedAt ||
        fresh.winner?.id !== session.winner.id ||
        isExpired(fresh)
      ) {
        throw fail(409, "This session can no longer start a re-vote");
      }

      tx.update(ref, {
        originalWinner: fresh.winner,
        originalShortlist: fresh.shortlist || [],
        originalVotes: fresh.votes || {},
        originalSuperLikes: fresh.superLikes || {},
        originalVetoes: fresh.vetoes || {},
        originalExtraSuperLikeVotes: fresh.extraSuperLikeVotes || {},

        rejectedWinnerIds: [
          ...new Set([
            ...(fresh.rejectedWinnerIds || []),
            String(fresh.winner.id)
          ])
        ],

        shortlist: alternatives,
        votes: {},
        status: "revoting",
        revoteStartedAt: Date.now(),
        revoteRejectedWaitMins: rejectedWaitMins,
        votingEndsAt: Date.now() + votingDuration(fresh) * 1000
      });
    });

    res.json({ ok: true, alternatives });
  } catch (err) {
    next(err);
  }
});


// SUBMIT RE-VOTE
// POST /api/sessions/:code/revote
// Body: { placeId, yes }
// Each member can vote YES or NO on each alternative.

router.post("/:code/revote", async (req, res, next) => {
  try {
    const ref = db.collection("sessions").doc(req.params.code);
    const placeId = String(req.body.placeId || "");
    const yes = req.body.yes;

    if (typeof yes !== "boolean") {
      throw fail(400, "Vote must be YES or NO");
    }

    const result = await db.runTransaction(async tx => {
      const snap = await tx.get(ref);

      if (!snap.exists) throw fail(404, "Session not found");

      const session = snap.data();

      if (!session.members?.[req.uid]) {
        throw fail(403, "You are not in this session");
      }

      if (session.status !== "revoting") {
        throw fail(409, "Re-voting is not active");
      }

      if (isExpired(session)) {
        throw fail(410, "This session has expired");
      }

      if (Date.now() >= session.votingEndsAt) {
        throw fail(409, "Re-voting time has ended");
      }

      if (!(session.shortlist || []).some(p => String(p.id) === placeId)) {
        throw fail(400, "This place is not in the re-vote shortlist");
      }

      const votes = { ...(session.votes || {}) };

      votes[placeId] = {
        ...(votes[placeId] || {}),
        [req.uid]: yes
      };

      tx.update(ref, { votes });

      const memberIds = Object.keys(session.members || {});

      const allVoted = (session.shortlist || []).every(place =>
        memberIds.every(uid =>
          votes[String(place.id)]?.[uid] !== undefined
        )
      );

      return { allVoted };
    });

    res.json({ ok: true, allVoted: result.allVoted });
  } catch (err) {
    next(err);
  }
});


// FINISH RE-VOTE
// POST /api/sessions/:code/finish-revote
// Select a winner without awarding session points again.

router.post("/:code/finish-revote", async (req, res, next) => {
  try {
    const ref = db.collection("sessions").doc(req.params.code);

    const result = await db.runTransaction(async tx => {
      const snap = await tx.get(ref);

      if (!snap.exists) throw fail(404, "Session not found");

      const session = snap.data();

      if (!session.members?.[req.uid]) {
        throw fail(403, "You are not in this session");
      }

      if (session.status === "done" && session.revoteCompleted) {
        return { winner: session.winner, alreadyFinished: true };
      }

      if (session.status !== "revoting") {
        throw fail(409, "No active re-vote");
      }

      const memberIds = Object.keys(session.members || {});
      const places = session.shortlist || [];
      const votes = session.votes || {};

      const allVoted = places.every(place =>
        memberIds.every(uid =>
          votes[String(place.id)]?.[uid] !== undefined
        )
      );

      if (!allVoted && Date.now() < session.votingEndsAt) {
        throw fail(409, "Re-voting is still in progress");
      }

      // Use the same basic eligibility rule as the original winner engine:
      // at least one YES and no NO votes.
      const eligible = places
        .map(place => {
          const responses = Object.values(votes[String(place.id)] || {});
          return {
            place,
            yesCount: responses.filter(v => v === true).length,
            noCount: responses.filter(v => v === false).length
          };
        })
        .filter(p => p.yesCount > 0 && p.noCount === 0)
        .sort((a, b) =>
          b.yesCount - a.yesCount ||
          (a.place.waitMins ?? Infinity) - (b.place.waitMins ?? Infinity)
        );

      // If no alternative is acceptable, retain the original winner.
      const winner = eligible[0]?.place || session.originalWinner;

      tx.update(ref, {
        winner,
        status: "done",
        revoteCompleted: true,
        revoteCompletedAt: Date.now(),
        revoteNoAlternativeAccepted: eligible.length === 0,
        completedAt: Date.now()
      });

      return {
        winner,
        alreadyFinished: false,
        noAlternativeAccepted: eligible.length === 0
      };
    });

    // Do not call processCompletedSession here.
    // Original session rewards and history have already been processed.

    res.json({ ok: true, ...result });
  } catch (err) {
    next(err);
  }
});

// =====================================================
// [JANANIJ] END: QUEUELESS RE-VOTE
// =====================================================


export default router;
