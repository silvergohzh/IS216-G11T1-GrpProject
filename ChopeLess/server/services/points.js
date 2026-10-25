
import { db } from "../firebase.js";

export const POINT_RULES = {
  SESSION_COMPLETE: 10,
  HOST_BONUS: 5,
  VERIFIED_REPORT: 15,
  INVALID_REPORT: -10,
  BRONZE: 50,
  SILVER: 150,
  GOLD: 300,
  PRIORITY: 150,
  EXTRA_SUPER_LIKE: 20,
  MAX_DAILY_REWARDED_SESSIONS: 3,
  EXTRA_SUPER: 20  // each extra Super Like costs 20 points (max: half the cards per session, free one included)
};

const fail = (status, message) =>
  Object.assign(new Error(message), { status });

const ledger = db.collection("pointsLedger");
const accounts = db.collection("pointsAccounts");
const dailyRewards = db.collection("dailySessionRewards");
const sessions = db.collection("sessions");

const accountRef = uid => accounts.doc(uid);

function badgesFor(total) {
  const badges = [];

  if (total >= POINT_RULES.BRONZE) badges.push("bronze");
  if (total >= POINT_RULES.SILVER) badges.push("silver");
  if (total >= POINT_RULES.GOLD) badges.push("gold");

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

function singaporeDate(timestamp = Date.now()) {
  // Stable YYYY-MM-DD for Singapore.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(timestamp));
}

function validatePointsRequest({ uid, eventId, points, reason }) {
  if (
    typeof uid !== "string" ||
    !uid ||
    uid.includes("/") ||
    typeof eventId !== "string" ||
    !eventId ||
    eventId.includes("/") ||
    typeof reason !== "string" ||
    !reason
  ) {
    throw fail(400, "Invalid points request");
  }

  if (!Number.isSafeInteger(points) || points === 0) {
    throw fail(400, "Points must be a non-zero integer");
  }
}

// =====================================================
// GENERAL POINTS
// =====================================================

export async function awardPoints({
  uid,
  eventId,
  points,
  reason,
  sessionCode = null
}) {
  validatePointsRequest({ uid, eventId, points, reason });

  const entryRef = ledger.doc(`${eventId}_${uid}`);
  const userRef = accountRef(uid);

  return db.runTransaction(async tx => {
    const entrySnap = await tx.get(entryRef);
    const accountSnap = await tx.get(userRef);

    if (entrySnap.exists) {
      return { awarded: false, duplicate: true };
    }

    const current = normaliseAccount(
      uid,
      accountSnap.exists ? accountSnap.data() : {}
    );

    if (current.balance + points < 0) {
      throw fail(409, "Not enough Makan Points");
    }

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
// SESSION REWARDS
// =====================================================

async function rewardOneSessionMember({
  uid,
  sessionCode,
  isHost,
  completedAt
}) {
  const dateKey = singaporeDate(completedAt);

  const dailyRef = dailyRewards.doc(`${dateKey}_${uid}`);
  const userRef = accountRef(uid);

  const participationEvent = `session_${sessionCode}`;
  const hostEvent = `host_${sessionCode}`;

  const participationRef = ledger.doc(
    `${participationEvent}_${uid}`
  );
  const hostRef = ledger.doc(`${hostEvent}_${uid}`);

  return db.runTransaction(async tx => {
    const participationSnap = await tx.get(participationRef);
    const hostSnap = isHost ? await tx.get(hostRef) : null;
    const dailySnap = await tx.get(dailyRef);
    const accountSnap = await tx.get(userRef);

    if (participationSnap.exists) {
      return { awarded: false, duplicate: true, uid };
    }

    const rewardedCount = dailySnap.exists
      ? dailySnap.data().count || 0
      : 0;

    if (
      rewardedCount >=
      POINT_RULES.MAX_DAILY_REWARDED_SESSIONS
    ) {
      return {
        awarded: false,
        dailyLimitReached: true,
        uid
      };
    }

    const current = normaliseAccount(
      uid,
      accountSnap.exists ? accountSnap.data() : {}
    );

    const now = Date.now();
    const awardHostBonus = isHost && !hostSnap?.exists;

    const totalPoints =
      POINT_RULES.SESSION_COMPLETE +
      (awardHostBonus ? POINT_RULES.HOST_BONUS : 0);

    const next = normaliseAccount(uid, {
      balance: current.balance + totalPoints,
      lifetimePoints: current.lifetimePoints + totalPoints
    });

    tx.create(participationRef, {
      id: participationRef.id,
      uid,
      eventId: participationEvent,
      points: POINT_RULES.SESSION_COMPLETE,
      reason: "SESSION_COMPLETE",
      sessionCode,
      status: "active",
      createdAt: now,
      updatedAt: now
    });

    if (awardHostBonus) {
      tx.create(hostRef, {
        id: hostRef.id,
        uid,
        eventId: hostEvent,
        points: POINT_RULES.HOST_BONUS,
        reason: "HOST_BONUS",
        sessionCode,
        status: "active",
        createdAt: now,
        updatedAt: now
      });
    }

    tx.set(userRef, next);

    tx.set(dailyRef, {
      uid,
      date: dateKey,
      count: rewardedCount + 1,
      updatedAt: now
    });

    return {
      awarded: true,
      uid,
      points: totalPoints,
      account: next
    };
  });
}

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

  const completedAt =
    typeof session.completedAt === "number"
      ? session.completedAt
      : Date.now();

  for (const uid of memberIds) {
    const result = await rewardOneSessionMember({
      uid,
      sessionCode: session.code,
      isHost: uid === session.hostUid,
      completedAt
    });

    results.push(result);
  }

  return {
    awarded: results.some(result => result.awarded),
    results
  };
}

// =====================================================
// EXTRA SUPER LIKE PURCHASE
// =====================================================

// Session fields:
// extraSuperLikes: {
//   [uid]: {
//     purchased: number,
//     used: number,
//     refunded: number
//   }
// }
//
// This function only PURCHASES a Super Like.
// The voting route must consume it when the user votes.

export async function purchaseExtraSuperLike({
  uid,
  sessionCode
}) {
  if (
    !uid ||
    !sessionCode ||
    typeof uid !== "string" ||
    typeof sessionCode !== "string" ||
    uid.includes("/") ||
    sessionCode.includes("/")
  ) {
    throw fail(400, "Invalid purchase request");
  }

  const sessionRef = sessions.doc(sessionCode);
  const userRef = accountRef(uid);

  return db.runTransaction(async tx => {
    const sessionSnap = await tx.get(sessionRef);
    const accountSnap = await tx.get(userRef);

    if (!sessionSnap.exists) {
      throw fail(404, "Session not found");
    }

    const session = sessionSnap.data();

    if (!session.members?.[uid]) {
      throw fail(403, "You are not in this session");
    }

    if (session.status !== "voting") {
      throw fail(
        409,
        "Extra Super Likes can only be purchased during voting"
      );
    }

    if (
      session.votingEndsAt &&
      Date.now() > session.votingEndsAt
    ) {
      throw fail(409, "Voting time has ended");
    }

    const account = normaliseAccount(
      uid,
      accountSnap.exists ? accountSnap.data() : {}
    );

    if (account.balance < POINT_RULES.EXTRA_SUPER_LIKE) {
      throw fail(409, "Not enough Makan Points");
    }

    const extras = { ...(session.extraSuperLikes || {}) };

    const current = extras[uid] || {
      purchased: 0,
      used: 0,
      refunded: 0
    };

    const purchaseNumber = current.purchased + 1;

    const eventId =
      `super_purchase_${sessionCode}_${purchaseNumber}`;

    const entryRef = ledger.doc(`${eventId}_${uid}`);
    const entrySnap = await tx.get(entryRef);

    if (entrySnap.exists) {
      throw fail(409, "Purchase already recorded");
    }

    extras[uid] = {
      ...current,
      purchased: purchaseNumber
    };

    const next = normaliseAccount(uid, {
      balance:
        account.balance - POINT_RULES.EXTRA_SUPER_LIKE,
      lifetimePoints: account.lifetimePoints
    });

    const now = Date.now();

    tx.update(sessionRef, {
      extraSuperLikes: extras
    });

    tx.set(userRef, next);

    tx.create(entryRef, {
      id: entryRef.id,
      uid,
      eventId,
      points: -POINT_RULES.EXTRA_SUPER_LIKE,
      reason: "EXTRA_SUPER_LIKE_PURCHASE",
      sessionCode,
      status: "active",
      createdAt: now,
      updatedAt: now
    });

    return {
      purchased: true,
      cost: POINT_RULES.EXTRA_SUPER_LIKE,
      available:
        purchaseNumber -
        (current.used || 0) -
        (current.refunded || 0),
      account: next
    };
  });
}

// =====================================================
// REFUND UNUSED PURCHASED SUPER LIKES
// =====================================================

// Called only after the session reaches "done".
// Safe to call repeatedly.
//
// Each user's unused purchases are refunded together
// in a single Firestore transaction.

export async function refundUnusedSuperLikes(sessionCode) {
  if (
    typeof sessionCode !== "string" ||
    !sessionCode ||
    sessionCode.includes("/")
  ) {
    throw fail(400, "Invalid session code");
  }

  const sessionRef = sessions.doc(sessionCode);
  const sessionSnap = await sessionRef.get();

  if (!sessionSnap.exists) {
    throw fail(404, "Session not found");
  }

  const session = sessionSnap.data();

  if (session.status !== "done") {
    return {
      refunded: false,
      reason: "Session is not finished"
    };
  }

  const uids = Object.keys(session.extraSuperLikes || {});
  const results = [];

  for (const uid of uids) {
    const result = await db.runTransaction(async tx => {
      const latestSessionSnap = await tx.get(sessionRef);
      const latestSession = latestSessionSnap.data();

      if (latestSession.status !== "done") {
        return { uid, refunded: 0 };
      }

      const extras = {
        ...(latestSession.extraSuperLikes || {})
      };

      const record = extras[uid];

      if (!record) {
        return { uid, refunded: 0 };
      }

      const unused = Math.max(
        0,
        (record.purchased || 0) -
        (record.used || 0) -
        (record.refunded || 0)
      );

      if (!unused) {
        return { uid, refunded: 0 };
      }

      const userRef = accountRef(uid);
      const accountSnap = await tx.get(userRef);

      const eventId =
        `super_refund_${sessionCode}_${uid}`;

      const entryRef = ledger.doc(eventId);
      const entrySnap = await tx.get(entryRef);

      if (entrySnap.exists) {
        return { uid, refunded: 0, duplicate: true };
      }

      const account = normaliseAccount(
        uid,
        accountSnap.exists ? accountSnap.data() : {}
      );

      const amount =
        unused * POINT_RULES.EXTRA_SUPER_LIKE;

      const next = normaliseAccount(uid, {
        balance: account.balance + amount,
        lifetimePoints: account.lifetimePoints
      });

      extras[uid] = {
        ...record,
        refunded: (record.refunded || 0) + unused
      };

      const now = Date.now();

      tx.update(sessionRef, {
        extraSuperLikes: extras
      });

      tx.set(userRef, next);

      tx.create(entryRef, {
        id: entryRef.id,
        uid,
        eventId,
        points: amount,
        reason: "EXTRA_SUPER_LIKE_REFUND",
        sessionCode,
        status: "active",
        createdAt: now,
        updatedAt: now
      });

      return {
        uid,
        refunded: unused,
        points: amount
      };
    });

    results.push(result);
  }

  return {
    refunded: results.some(r => r.refunded > 0),
    results
  };
}

// =====================================================
// CROWD REPORTS
// =====================================================

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
// ACCOUNT
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
// ADMIN REVERSAL
// =====================================================

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
        current.lifetimePoints - Math.max(0, entry.points)
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
// ADMIN DELETE
// =====================================================

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

    return { deleted: true };
  });
}

// =====================================================
// WEEKLY LEADERBOARD
// =====================================================

export async function getWeeklyLeaderboard(
  now = Date.now()
) {
  const SG_OFFSET = 8 * 60 * 60 * 1000;

  const local = new Date(now + SG_OFFSET);
  const day = local.getUTCDay();

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

  const earningReasons = new Set([
    "SESSION_COMPLETE",
    "HOST_BONUS",
    "VERIFIED_REPORT"
  ]);

  for (const doc of snap.docs) {
    const entry = doc.data();

    if (entry.status !== "active") continue;

    if (
      entry.points <= 0 ||
      !earningReasons.has(entry.reason)
    ) {
      continue;
    }

    totals.set(
      entry.uid,
      (totals.get(entry.uid) || 0) + entry.points
    );
  }

  const topUsers = [...totals.entries()]
    .map(([uid, points]) => ({ uid, points }))
    .sort(
      (a, b) =>
        b.points - a.points ||
        a.uid.localeCompare(b.uid)
    )
    .slice(0, 20);

  const userSnapshots = topUsers.length
    ? await db.getAll(
        ...topUsers.map(user =>
          db.collection("users").doc(user.uid)
        )
      )
    : [];

  const leaderboard = topUsers.map((user, index) => {
    const profile = userSnapshots[index]?.data() || {};

    const displayName =
      profile.displayName ||
      profile.name ||
      profile.fullName ||
      `User ${user.uid.slice(0, 6)}`;

    return {
      rank: index + 1,
      uid: user.uid,
      name: displayName,
      displayName,
      points: user.points
    };
  });

  return {
    start,
    end,
    leaderboard
  };
}
