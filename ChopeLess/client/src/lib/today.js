// Today's date in Singapore, e.g. "2026-10-28". Owner: M3
// The island ticks and Today's Quests use it, so they reset at Singapore midnight
// (the same day the server uses for Makan Points).
export function dateSG(ms = Date.now()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Singapore', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date(ms))
}

export const todaySG = () => dateSG()