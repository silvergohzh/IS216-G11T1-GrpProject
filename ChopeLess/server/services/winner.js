// Works out the result when voting ends. Owner: (M1), used by routes/sessions.js
// Rules:
//   - Vetoed places are out.
//   - A place is eligible if nobody said no and at least one person said yes.
//     (Missing votes = abstain, so a slow phone can't block the group.)
//   - Score = yes votes + 1 extra for each Super Like.
//   - Highest score wins; places with the same score tie, and a random spin picks one.

export function rankPlaces(session) {
  const votes = session.votes || {}
  const vetoed = Object.values(session.vetoes || {})
  const supers = Object.values(session.superLikes || {})
  return session.shortlist
    .filter(p => !vetoed.includes(p.id))
    .map(p => {
      const v = Object.values(votes[p.id] || {})
      const yes = v.filter(x => x === true).length
      const no = v.filter(x => x === false).length
      const bonus = supers.filter(id => id === p.id).length
      return { place: p, yes, no, score: yes + bonus, time: (p.walkMins || 0) + (p.waitMins || 0) }
    })
    .filter(r => r.no === 0 && r.yes > 0)
    .sort((a, b) => b.score - a.score || a.time - b.time)
}

// Returns the Firestore update for a finished session, or null if nobody agreed on anything
export function decide(session) {
  const ranked = rankPlaces(session)
  if (!ranked.length) return null
  const best = ranked[0]
  // Any places with the same score tie, and the spin wheel picks one of them
  const tied = ranked.filter(r => r.score === best.score)
  const winner = tied[Math.floor(Math.random() * tied.length)].place
  return {
    winner,
    status: 'done',
    tieBreak: tied.length > 1
      ? { candidates: tied.map(r => ({ id: r.place.id, name: r.place.name })), winnerId: winner.id }
      : null
  }
}

// Last resort after round 2: the place with the most yes votes (or the first one)
export function mostLiked(session) {
  const votes = session.votes || {}
  const ranked = session.shortlist
    .map(p => ({ place: p, yes: Object.values(votes[p.id] || {}).filter(v => v === true).length }))
    .sort((a, b) => b.yes - a.yes)
  return { winner: ranked[0].place, status: 'done', tieBreak: null }
}