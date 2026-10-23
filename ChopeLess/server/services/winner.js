// Works out the result when voting ends. Owner: (M1), used by routes/sessions.js
// Rules:
//   - Vetoed places are out.
//   - A place is eligible if nobody said no and at least one person said yes.
//     (Missing votes = abstain, so a slow phone can't block the group.)
//   - Score = yes votes + 1 extra for each Super Like.
//   - Highest score wins; places with the same score tie, and a random spin picks one.


// Voting winner selection — M1 (Janani)
// Vetoed restaurants are never eligible to win.
// Super Like adds one extra point to a YES vote.
// Ties are resolved randomly for the spin wheel.

export function rankPlaces(session) {
  const votes = session.votes || {};
  const vetoed = Object.values(session.vetoes || {});
  // Free + bought Super Likes: each one adds +1 to that place
  const supers = [
    ...Object.values(session.superLikes || {}),
        ...Object.values(session.bonusSuperLikes || {}).flat()
  ];

  return (session.shortlist || [])
    .filter(p => !vetoed.includes(p.id))
    .map(p => {
      const placeVotes = Object.values(votes[p.id] || {});

      const yes = placeVotes.filter(v => v === true).length;
      const no = placeVotes.filter(v => v === false).length;

      const bonus = supers.filter(id => id === p.id).length;

      return {
        place: p,
        yes,
        no,
        score: yes + bonus,
        time: (p.walkMins || 0) + (p.waitMins || 0)
      };
    })
    .filter(r => r.no === 0 && r.yes > 0)
    .sort((a, b) => b.score - a.score || a.time - b.time);
}

// Normal winner selection
export function decide(session) {
  const ranked = rankPlaces(session);

  if (!ranked.length) return null;

  const best = ranked[0];
  const tied = ranked.filter(r => r.score === best.score);

  const winner = tied[Math.floor(Math.random() * tied.length)].place;

  return {
    winner,
    status: 'done',
    tieBreak: tied.length > 1
      ? {
          candidates: tied.map(r => ({
            id: r.place.id,
            name: r.place.name
          })),
          winnerId: winner.id
        }
      : null
  };
}

// Final fallback after Round 2
export function mostLiked(session) {
  const votes = session.votes || {};
  const vetoed = Object.values(session.vetoes || {});
  // Free + bought Super Likes: each one adds +1 to that place
  const supers = [
    ...Object.values(session.superLikes || {}),
        ...Object.values(session.bonusSuperLikes || {}).flat()
  ];

  // Never restore vetoed restaurants.
  const pool = (session.shortlist || [])
    .filter(p => !vetoed.includes(p.id));

  // No safe candidate: do not force a winner.
  if (!pool.length) {
    return {
      winner: null,
      status: 'done',
      tieBreak: null
    };
  }

  const scoreOf = p => {
    const yes = Object.values(votes[p.id] || {})
      .filter(v => v === true).length;

    const bonus = supers.filter(id => id === p.id).length;

    return yes + bonus;
  };

  const best = Math.max(...pool.map(scoreOf));
  const tied = pool.filter(p => scoreOf(p) === best);

  const winner = tied[Math.floor(Math.random() * tied.length)];

  return {
    winner,
    status: 'done',
    tieBreak: tied.length > 1
      ? {
          candidates: tied.map(p => ({
            id: p.id,
            name: p.name
          })),
          winnerId: winner.id
        }
      : null
  };
}
