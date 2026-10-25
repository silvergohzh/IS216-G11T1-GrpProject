
/*
 * ChopeLess — Voting Winner Selection
 *
 * Rules:
 * - Vetoed restaurants cannot win.
 * - A place is eligible when nobody voted NO
 *   and at least one person voted YES.
 * - Each YES vote contributes 1 point.
 * - Each Super Like contributes 1 additional point.
 * - Free and purchased Super Likes both count.
 * - Highest score wins.
 * - Equal scores are resolved by a random spin.
 */

// =====================================================
// SUPER LIKE COUNTS
// =====================================================

function getSuperLikeCounts(session) {
  const counts = {};

  // Free Super Likes:
  // { uid: placeId }
  for (const placeId of Object.values(
    session.superLikes || {}
  )) {
    counts[placeId] = (counts[placeId] || 0) + 1;
  }

  // Purchased Super Likes:
  // The voting route records the place for each
  // purchased Super Like in extraSuperLikeVotes.
  //
  // Expected shape:
  // {
  //   uid: ["placeId1", "placeId2"]
  // }

  for (const placeIds of Object.values(
    session.extraSuperLikeVotes || {}
  )) {
    if (!Array.isArray(placeIds)) continue;

    for (const placeId of placeIds) {
      counts[placeId] = (counts[placeId] || 0) + 1;
    }
  }

  return counts;
}

// =====================================================
// RANK ELIGIBLE PLACES
// =====================================================

export function rankPlaces(session) {
  const votes = session.votes || {};
  const vetoed = new Set(
    Object.values(session.vetoes || {})
  );
  const superCounts = getSuperLikeCounts(session);

  return (session.shortlist || [])
    .filter(place => !vetoed.has(place.id))
    .map(place => {
      const placeVotes = Object.values(
        votes[place.id] || {}
      );

      const yes = placeVotes.filter(
        value => value === true
      ).length;

      const no = placeVotes.filter(
        value => value === false
      ).length;

      const bonus = superCounts[place.id] || 0;

      return {
        place,
        yes,
        no,
        score: yes + bonus,
        time:
          (place.walkMins || 0) +
          (place.waitMins || 0)
      };
    })
    .filter(result =>
      result.no === 0 && result.yes > 0
    )
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.time - b.time
    );
}

// =====================================================
// NORMAL WINNER SELECTION
// =====================================================

export function decide(session) {
  const ranked = rankPlaces(session);

  if (!ranked.length) return null;

  const best = ranked[0];

  const tied = ranked.filter(
    result => result.score === best.score
  );

  const winner =
    tied[Math.floor(Math.random() * tied.length)].place;

  return {
    winner,
    status: "done",
    tieBreak:
      tied.length > 1
        ? {
            candidates: tied.map(result => ({
              id: result.place.id,
              name: result.place.name
            })),
            winnerId: winner.id
          }
        : null
  };
}

// =====================================================
// ROUND 2 FALLBACK
// =====================================================

export function mostLiked(session) {
  const votes = session.votes || {};

  const vetoed = new Set(
    Object.values(session.vetoes || {})
  );

  const superCounts = getSuperLikeCounts(session);

  const pool = (session.shortlist || []).filter(
    place => !vetoed.has(place.id)
  );

  // Never force a vetoed restaurant to win.
  if (!pool.length) {
    return {
      winner: null,
      status: "done",
      tieBreak: null
    };
  }

  const scoreOf = place => {
    const yes = Object.values(
      votes[place.id] || {}
    ).filter(value => value === true).length;

    const bonus = superCounts[place.id] || 0;

    return yes + bonus;
  };

  const best = Math.max(
    ...pool.map(scoreOf)
  );

  const tied = pool.filter(
    place => scoreOf(place) === best
  );

  const winner =
    tied[Math.floor(Math.random() * tied.length)];

  return {
    winner,
    status: "done",
    tieBreak:
      tied.length > 1
        ? {
            candidates: tied.map(place => ({
              id: place.id,
              name: place.name
            })),
            winnerId: winner.id
          }
        : null
  };
}
