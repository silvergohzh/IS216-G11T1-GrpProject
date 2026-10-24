// Ready-made accounts, so nobody has to sign up to try the app. Owner: M6
// They are created by `npm run seed` (server/seed/platform.js). Keep both lists the same.
// The login page shows a one-tap button for each one.
export const DEMO_PASSWORD = 'test1234'

export const DEMO_ACCOUNTS = [
  { email: 'alice@chopeless.test', name: 'Alice Tan', role: 'Diner' },
  { email: 'ben@chopeless.test', name: 'Ben Lim', role: 'Diner' },
  { email: 'chloe@chopeless.test', name: 'Chloe Ng', role: 'Diner' },
  { email: 'hawker@chopeless.test', name: 'Albert Centre Hawker', role: 'Hawker' },
  { email: 'hawker2@chopeless.test', name: 'Waterloo Centre Hawker', role: 'Hawker' },
  { email: 'admin@chopeless.test', name: 'Admin', role: 'Admin' }
]
