
import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";

import {
  getPointsAccount,
  getPointsHistory,
  getWeeklyLeaderboard,
  reversePoints,
  deletePointsEntry
} from "../services/points.js";

const router = Router();

router.use(requireAuth);

function fail(status, message) {
  return Object.assign(new Error(message), { status });
}

function requirePointsAdmin(req, res, next) {
  const admins = (process.env.POINTS_ADMIN_UIDS || "")
    .split(",")
    .map(uid => uid.trim())
    .filter(Boolean);

  if (!admins.includes(req.uid)) {
    return next(fail(403, "Only points administrators can do this"));
  }

  next();
}

// Get the logged-in user's points balance and badges
router.get("/me", async (req, res, next) => {
  try {
    const account = await getPointsAccount(req.uid);
    res.json(account);
  } catch (error) {
    next(error);
  }
});

// Get the logged-in user's points transactions
router.get("/history", async (req, res, next) => {
  try {
    const history = await getPointsHistory(req.uid);
    res.json(history);
  } catch (error) {
    next(error);
  }
});

// Get the weekly leaderboard
router.get("/leaderboard", async (req, res, next) => {
  try {
    const leaderboard = await getWeeklyLeaderboard();
    res.json(leaderboard);
  } catch (error) {
    next(error);
  }
});

// Check priority queue eligibility
router.get("/priority", async (req, res, next) => {
  try {
    const account = await getPointsAccount(req.uid);

    res.json({
      eligible: account.priorityEligible,
      balance: account.balance
    });
  } catch (error) {
    next(error);
  }
});

// Admin only: reverse a points transaction
router.patch(
  "/ledger/:id/reverse",
  requirePointsAdmin,
  async (req, res, next) => {
    try {
      const result = await reversePoints(
        req.params.id,
        req.body?.reason,
        req.uid
      );

      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

// Admin only: soft-delete a reversed transaction
router.delete(
  "/ledger/:id",
  requirePointsAdmin,
  async (req, res, next) => {
    try {
      const result = await deletePointsEntry(
        req.params.id,
        req.uid
      );

      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

export default router;
