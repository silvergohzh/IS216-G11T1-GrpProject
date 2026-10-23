
import { db } from "../firebase.js";

// =====================================================
// MAKAN POINTS RULES
// =====================================================

export const POINT_RULES = {
  SESSION_COMPLETE: 10,
  HOST_BONUS: 5,
  VERIFIED_REPORT: 15,
  INVALID_REPORT: -10,
  BRONZE: 50,
  SILVER: 150,
  GOLD: 300,
  PRIORITY: 150,
  EXTRA_SUPER: 20  // each extra Super Like costs 20 points (max: half the cards per session, free one included)
};

const fail = (status, message) =>
  Object.assign(new Error(message), { status });

const ledger = db.collection("pointsLedger");
const accounts = db.collection("pointsAccounts");

const accountRef = uid => accounts.doc(uid);

// =====================================================
// BADGES AND ACCOUNT DETAILS
// =====================================================

function badgesFor(total) {
  const badges = [];

  if (total >= POINT_RULES.BRONZE) {
    badges.push("bronze");
  }

  if (total >= POINT_RULES.SILVER) {
    badges.push("silver");
  }

  if (total >= POINT_RULES.GOLD) {
    badges.push("gold");
  }

  return badges;
}

function normaliseAccount(uid, data = {}) {
  const balance = data.balance ?? 0;
  const lifetimePoints = data.lifetimePoints ?? 0;

  return {
    uid,
    balance,
    lifetimePoints,
    badges: badgesFor(lifetimePoints),
    priorityEligible: balance >= POINT_RULES.PRIORITY
  };
}

// =====================================================
// CREATE: AWARD OR DEDUCT POINTS
// =====================================================

// Each eventId + uid combination can only be recorded once.
// Firestore transactions prevent duplicate rewards.

export async function awardPoints({
  uid,
  eventId,
  points,
  reason,
  sessionCode = null
}) {
  if (
    typeof uid !== "string" ||
    !uid ||
    typeof eventId !== "string" ||
    !eventId ||
    typeof reason !== "string" ||
    !reason
  ) {
    throw fail(400, "Invalid points request");
  }

  // Firestore document IDs cannot contain slashes.
  if (uid.includes("/") || eventId.includes("/")) {
    throw fail(400, "Invalid UID or event ID");
  }

  if (!Number.isSafeInteger(points) || points === 0) {
    throw fail(400, "Points must be a non-zero integer");
  }

  const entryRef = ledger.doc(`${eventId}_${uid}`);
  const userRef = accountRef(uid);

  return db.runTransaction(async tx => {
    const entrySnap = await tx.get(entryRef);
    const accountSnap = await tx.get(userRef);

    // Prevent duplicate awards.
    if (entrySnap.exists) {
      return {
        awarded: false,
        duplicate: true
      };
    }

    const current = normaliseAccount(
      uid,
      accountSnap.exists ? accountSnap.data() : {}
    );

    const next = normaliseAccount(uid, {
      balance: current.balance + points,
      lifetimePoints:
        current.lifetimePoints + Math.max(0, points)
    });

    const now = Date.now();

    const entry = {
      id: entryRef.id,
      uid,
      eventId,
      points,
      reason,
      sessionCode,
      status: "active",
      createdAt: now,
      updatedAt: now
    };

    tx.create(entryRef, entry);
    tx.set(userRef, next);

    return {
      awarded: true,
      duplicate: false,
      entry,
      account: next
    };
  });
}

// =====================================================
// SESSION COMPLETION REWARDS
// =====================================================

// Every member receives +10 points.
// The host receives an additional +5 points.
//
// Rewards are only processed for completed sessions
// with a winner.


export async function awardSessionPoints(session) {
  if (!session?.code || !session?.members) {
    throw fail(400, "Invalid session");
  }

  if (session.status !== "done" || !session.winner) {
    return {
      awarded: false,
      reason: "No winner"
    };
  }

  const memberIds = Object.keys(session.members);
  const results = [];

  // Reward every participating member with +10 points.
  for (const uid of memberIds) {
    results.push(
      await awardPoints({
        uid,
        eventId: `session_${session.code}`,
        points: POINT_RULES.SESSION_COMPLETE,
        reason: "SESSION_COMPLETE",
        sessionCode: session.code
      })
    );
  }

  // Host receives an additional +5 points.
  // The host must be a participant to receive this bonus.
  if (
    typeof session.hostUid === "string" &&
    session.hostUid &&
    memberIds.includes(session.hostUid)
  ) {
    results.push(
      await awardPoints({
        uid: session.hostUid,
        eventId: `host_${session.code}`,
        points: POINT_RULES.HOST_BONUS,
        reason: "HOST_BONUS",
        sessionCode: session.code
      })
    );
  }

  return {
    awarded: true,
    results
  };
}



// =====================================================
// CROWD REPORT REWARDS
// =====================================================

// Verified report: +15 points.
// Invalid report: -10 points.
//
// Only trusted backend code should call this function.

export async function rewardCrowdReport({
  uid,
  reportId,
  valid
}) {
  if (
    typeof reportId !== "string" ||
    !reportId ||
    typeof valid !== "boolean"
  ) {
    throw fail(400, "Invalid crowd report result");
  }

  return awardPoints({
    uid,
    eventId: `report_${reportId}`,
    points: valid
      ? POINT_RULES.VERIFIED_REPORT
      : POINT_RULES.INVALID_REPORT,
    reason: valid
      ? "VERIFIED_REPORT"
      : "INVALID_REPORT"
  });
}

// =====================================================
// READ: USER'S POINTS ACCOUNT
// =====================================================

export async function getPointsAccount(uid) {
  const snap = await accountRef(uid).get();

  return normaliseAccount(
    uid,
    snap.exists ? snap.data() : {}
  );
}

// =====================================================
// SPEND POINTS (inside another transaction)
// =====================================================
// Used when buying an extra Super Like. Runs inside the caller's transaction so that
// charging the points and giving the Super Like happen together, or not at all.
// The balance can never go below 0, and lifetime points (badges) are not reduced.
export async function spendPointsInTx(tx, { uid, eventId, points, reason, sessionCode = null }) {
  if (!Number.isSafeInteger(points) || points <= 0) throw fail(400, "Cost must be a positive whole number");

  const entryRef = ledger.doc(`${eventId}_${uid}`);   // one entry per purchase, so a double tap can't charge twice
  const userRef = accountRef(uid);
  const [entrySnap, accountSnap] = await Promise.all([tx.get(entryRef), tx.get(userRef)]);

  if (entrySnap.exists) throw fail(409, "Already purchased");
  const current = normaliseAccount(uid, accountSnap.exists ? accountSnap.data() : {});
  if (current.balance < points) {
    throw fail(400, `Not enough points (need ${points}, you have ${current.balance})`);
  }

  const next = normaliseAccount(uid, {
    balance: current.balance - points,
    lifetimePoints: current.lifetimePoints        // spending doesn't take away badges
  });
  const now = Date.now();
  tx.create(entryRef, {
    id: entryRef.id, uid, eventId, points: -points, reason, sessionCode,
    status: "active", createdAt: now, updatedAt: now
  });
  tx.set(userRef, next);
  return next;
}

// =====================================================
// READ: USER'S TRANSACTION HISTORY
// =====================================================

export async function getPointsHistory(uid) {
  const snap = await ledger
    .where("uid", "==", uid)
    .get();

  return snap.docs
    .map(doc => doc.data())
    .filter(entry => entry.status !== "deleted")
    .sort((a, b) => b.createdAt - a.createdAt);
}

// =====================================================
// UPDATE: REVERSE A POINTS TRANSACTION
// =====================================================

// Only authorised admin routes should call this.
//
// Reversing a positive reward deducts the awarded points.
// Reversing a penalty restores the deducted points.

export async function reversePoints(
  entryId,
  reason,
  actorUid
) {
  if (typeof reason !== "string" || !reason.trim()) {
    throw fail(400, "Reversal reason required");
  }

  const entryRef = ledger.doc(entryId);

  return db.runTransaction(async tx => {
    const snap = await tx.get(entryRef);

    if (!snap.exists) {
      throw fail(404, "Ledger entry not found");
    }

    const entry = snap.data();

    if (entry.status !== "active") {
      throw fail(409, "Entry is not active");
    }

    const userRef = accountRef(entry.uid);
    const accountSnap = await tx.get(userRef);

    const current = normaliseAccount(
      entry.uid,
      accountSnap.exists ? accountSnap.data() : {}
    );

    const next = normaliseAccount(entry.uid, {
      balance: current.balance - entry.points,
      lifetimePoints:
        current.lifetimePoints -
        Math.max(0, entry.points)
    });

    tx.set(userRef, next);

    tx.update(entryRef, {
      status: "reversed",
      reversalReason: reason.trim(),
      reversedBy: actorUid,
      updatedAt: Date.now()
    });

    return {
      reversed: true,
      account: next
    };
  });
}

// =====================================================
// DELETE: SOFT-DELETE A REVERSED ENTRY
// =====================================================

// The ledger document is retained to prevent
// the same event from awarding points again.

export async function deletePointsEntry(
  entryId,
  actorUid
) {
  const entryRef = ledger.doc(entryId);

  return db.runTransaction(async tx => {
    const snap = await tx.get(entryRef);

    if (!snap.exists) {
      throw fail(404, "Ledger entry not found");
    }

    const entry = snap.data();

    if (entry.status === "deleted") {
      throw fail(409, "Entry already deleted");
    }

    if (entry.status === "active") {
      throw fail(
        409,
        "Reverse the entry before deleting"
      );
    }

    tx.update(entryRef, {
      status: "deleted",
      deletedBy: actorUid,
      updatedAt: Date.now()
    });

    return {
      deleted: true
    };
  });
}

// =====================================================
// READ: WEEKLY LEADERBOARD
// =====================================================

// Uses Singapore time (UTC+8).
// Week begins Monday at 00:00 SGT.
// Shows the top 20 users by net weekly points.

export async function getWeeklyLeaderboard(
  now = Date.now()
) {
  const SG_OFFSET = 8 * 60 * 60 * 1000;

  const local = new Date(now + SG_OFFSET);
  const day = local.getUTCDay();

  // Find Monday of the current Singapore week.
  const startLocal = Date.UTC(
    local.getUTCFullYear(),
    local.getUTCMonth(),
    local.getUTCDate() - ((day + 6) % 7)
  );

  const start = startLocal - SG_OFFSET;
  const end = start + 7 * 24 * 60 * 60 * 1000;

  const snap = await ledger
    .where("createdAt", ">=", start)
    .where("createdAt", "<", end)
    .get();

  const totals = new Map();

  for (const doc of snap.docs) {
    const entry = doc.data();

    // Ignore reversed and deleted transactions.
    if (entry.status !== "active") {
      continue;
    }

    totals.set(
      entry.uid,
      (totals.get(entry.uid) || 0) + entry.points
    );
  }

  const leaderboard = [...totals.entries()]
    .map(([uid, points]) => ({
      uid,
      points
    }))
    // Highest points first.
    // UID breaks ties consistently.
    .sort((a, b) =>
      b.points - a.points ||
      a.uid.localeCompare(b.uid)
    )
    .slice(0, 20)
    .map((user, index) => ({
      rank: index + 1,
      ...user
    }));

  return {
    start,
    end,
    leaderboard
  };
}
