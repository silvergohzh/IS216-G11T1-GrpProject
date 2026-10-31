# ChopeLess

**Skip the chope. Skip the queue.** ChopeLess helps a group of friends decide where to eat in a few minutes: everyone sets their budget and diet, the app builds a shortlist of places within walking distance and with short queues, the group swipes to vote, and the winner can be pre-ordered as a group.

IS216 Web Application Development II · Section G11 · Team 1

| | |
|---|---|
| **Live app** | https://chopeless.vercel.app |
| **API (Render)** |https://chopeless-api.onrender.com/api/health|
| **GitHub** | https://github.com/silvergohzh/IS216-G11T1-GrpProject |
| **Video (YouTube, unlisted)** | _TODO: YouTube URL_ |

The app code is in the [`ChopeLess/`](ChopeLess) folder: `client/` (Vue website) and `server/` (Express API).

---

## Try it

Open the live app and log in with a demo account (password for all: **`test1234`**), or sign up with any email.

| Email | Who | Good for trying |
|---|---|---|
| `alice@chopeless.test` | Alice Tan, diner, 1000 Makan Points | Makan Sessions, Fastpass, buying an extra Super Like |
| `ben@chopeless.test` | Ben Lim, diner, 300 points | Joining Alice's session from a second browser |
| `chloe@chopeless.test` | Chloe Ng, diner, 300 points | A third voter |
| `hawker@chopeless.test` | Ah Seng Chicken Rice (inside Albert Centre) | Order board, My menu, Earnings |
| `hawker2@chopeless.test` | Waterloo Nasi Lemak (inside Waterloo Centre) | A second stall |
| `admin@chopeless.test` | Admin | Approving hawker sign-ups, changing roles |
| `dan@chopeless.test` | Dan Koh, diner | Has a hawker application waiting for the admin |

**A quick demo (two browsers, e.g. Chrome + an incognito window):**
1. Alice: **Makan Session** → Create. Ben: enter the 6-letter code → Join.
2. Alice: Start voting. Both swipe right or left (or use the ⭐ Super Like / 🚫 Veto). The winner appears on both screens.
3. On the winner page: walking route on the map, or **Pre-order as a group** → pay with Stripe test card `4242 4242 4242 4242` (any future date, any CVC).
4. Hawker account: Start preparing → Mark ready (with a photo). Diner: I've collected it.

---

## Features

| Feature | What it does | Owner |
|---|---|---|
| **Makan Session** | Create or join with a 6-letter code. Live lobby, host-only settings, the host can remove someone (they can't rejoin). Swipe voting with ⭐ Super Like (1 free, more for 20 points) and 🚫 Veto, a live tally and a shared timer. Ties are settled by the server and shown with the Chope-Pon gacha machine. Winner page with a walking route and a group pre-order link. | Silver (front end), Janani (voting rules), Nawaz (shortlist) |
| **Shortlist engine** | Filters places by service mode, the tightest budget, everyone's diet, real walking time (OSRM) and queue time, then picks the top 8, always keeping one Hidden Gem. | Nawaz |
| **Makan Kakis** | Saved friend groups. Create, join with a code, rename, remove a member (they can't rejoin), leave, delete. Start a session for the whole group. | Silver |
| **For You** | Recommends places similar to ones you ate at or saved (cuisine, price, diet, distance). Save ♥ for later, hide ✕. | Silver |
| **Makan Quest home** | Island map of the app (ticks reset daily, saved to your account), Today's Quests, this week's leaderboard, loading screen, sound effects and music. | Silver |
| **QueueLess** | Crowd level for each place, an hourly chart, and AI queue estimates from a photo (OpenAI vision). Crowd reports from diners, verified for points. | Jonathan (QueueLess), Janani (crowd reports) |
| **Hidden Gems** | Add, edit, delete and upvote small local spots, with reviews. A gem with 3 upvotes is added to the places list. | Jan |
| **Makan Points** | Points for finishing sessions, verified crowd reports and collecting orders. Points history, leaderboard, priority queue for Fastpass orders. | Janani |
| **Pre-order + payments** | Group carts with a share code, split bill, Stripe checkout (test mode), hawker order board, pickup timer with photo proof, refunds, Fastpass. Hawker centres and food courts contain their own stalls. | Myat (Nawaz: Fastpass) |
| **Hawker portal + admin** | Hawkers apply, an admin approves, the hawker manages the menu. Roles: diner, hawker, admin. | Myat |

---

## How it works

```
Browser (Vue)  ──── reads/writes directly ────▶  Firestore  (protected by firestore.rules)
     │                                              ▲
     └── trusted actions only ──▶ Express API ──────┘  (Firebase Admin SDK)
         shortlist, votes, winner, points, payments, AI photo estimate
```

- **Simple reads and writes go straight to Firestore** from `client/src/services/`. `firestore.rules` decides who may do what (for example: only the host changes session settings, only the owner removes group members, you only see your own saved places).
- **Live updates.** The lobby, vote tally, groups and gems use Firestore's `onSnapshot`, so every phone updates without refreshing.
- **Anything that must be fair or secret goes through the Express server**: building the shortlist, recording votes, picking the winner, Makan Points, payments, and calling OpenAI (so the API key stays on the server). Votes and points use Firestore transactions, so two people acting at the same moment can't overwrite each other.

### Tech stack

| Layer | What we use |
|---|---|
| Front end | Vue 3 (`<script setup>`), Vue Router (with login and role guards), Pinia, Vite |
| Styling | Tailwind CSS v4 plus shared classes in `client/src/style.css`. Responsive from 375px phones to desktop |
| Data | Cloud Firestore and Firebase Authentication (email + password) |
| Back end | Node.js + Express with the Firebase Admin SDK |
| External APIs | OSRM (walking routes), OpenStreetMap tiles via Leaflet, OpenAI vision (queue photos), Stripe Checkout (test mode) |
| Browser APIs | Web Audio (sounds and music, no audio files), IntersectionObserver, Pointer Events, localStorage |
| Testing | Vitest + Vue Test Utils (unit and component), Playwright (end to end), Node's test runner (server unit tests), GitHub Actions |
| Hosting | Vercel (website), Render (API), Firebase (data) |

### Firestore collections

| Collection | What's in it | Written by |
|---|---|---|
| `users/{uid}` | name, default budget, diet, role, stall (hawkers) | the user; role and stall only by the server |
| `users/{uid}/history`, `/saved`, `/visited` | Meal History, saved ♥ places, island ticks per day | server (history), the user (saved, visited) |
| `sessions/{code}` | host, status, settings, members, kicked, shortlist, votes, Super Likes, vetoes, winner, tie-break | lobby: the browser; voting and winner: the server |
| `groups/{code}` | name, owner, members, kicked, live session | the browser (owner-only rules for removing people) |
| `places/{id}` (+ `analyses`) | place details, type, menu, latest queue estimate, hourly history | seed script, server, hawkers (own menu via API) |
| `gems/{id}` (+ `reviews`) | hidden gems, upvoters, reviews | the user via the server |
| `crowdReports`, `pointsAccounts`, `pointsLedger` | crowd reports, point balances, every points change | server only |
| `orders/{id}` (+ `proofs`), `payments/{id}`, `hawkerApplications/{uid}` | orders, payment records, hawker sign-ups | server only |

---

## Run it locally

You need **Node.js 20+** and **Java 11+** (for the Firebase emulator; check with `java -version`).

```bash
git clone https://github.com/silvergohzh/IS216-G11T1-GrpProject.git
cd IS216-G11T1-GrpProject/ChopeLess

cd server && cp .env.example .env && npm install
cd ../client && cp .env.example .env && npm install
```

The example `.env` files point at the **local emulators**, so no real Firebase project is needed. Then, in three terminals:

```bash
# 1. Local Firebase (resets when stopped)
cd client && npm run emulators
#    once it says "All emulators ready", load the places, menus and demo accounts:
cd server && npm run seed

# 2. API on http://localhost:3000
cd server && npm run dev

# 3. Website on http://localhost:5173
cd client && npm run dev
```

The Emulator UI at http://localhost:4000 shows every document and user.

**Optional keys** in `server/.env`:
- `OPENAI_API_KEY`: real photo estimates. Without it, the server returns a sample estimate.
- `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`: real Stripe test checkout. Without them, Pay marks the order paid straight away (demo mode).

---

## Tests

| Command (in `ChopeLess/client`) | What it runs |
|---|---|
| `npm run test:e2e` | All Playwright end-to-end tests at desktop and phone (375px) size, against a fresh emulator database each run. Stop `npm run emulators` first. First time: `npx playwright install chromium` |
| `npm run test:vitest` | Vitest unit and component tests (`src/**/__tests__/*.spec.js`) |
| `npm run test:unit` | Split-bill unit tests (Node test runner) |
| `cd ../server && npm test` | Server unit tests: winner rules and priority queue |

GitHub Actions (`.github/workflows/tests.yml`) runs all of these on every pull request and every push to `main`.

| Owner | Unit test | Component tests | End-to-end tests (`client/e2e/`) |
|---|---|---|---|
| Silver | `today.spec.js` (Singapore-date reset) | `PlaceCard.spec.js`, `GachaTie.spec.js` | `sessions`, `groups`, `island`, `foryou` (26 tests) |
| Janani | `winner.test.js`, `priorityQueue.test.js` | _TODO_ | _TODO_ |
| Nawaz | _TODO_ | _TODO_ | _TODO_ |
| Jonathan | _TODO_ | _TODO_ | `queueless` |
| Jan | _TODO_ | _TODO_ | `gems` |
| Myat | `splitBill.test.js` | _TODO_ | `home`, `orders`, `hawkers` |

Tests find elements the way users see them (`getByRole`, `getByLabel`) or by `data-testid`, never by CSS paths, so restyling a page doesn't break them. Multi-user tests open separate browser contexts for the host, guests and outsiders.

---

## Deployment

1. **Firebase:** turn on Email/Password sign-in and Firestore. Publish the rules with `npx firebase-tools deploy --only firestore:rules` (from `ChopeLess`). Add the Vercel domain under Authentication → Settings → Authorized domains.
2. **Seed the live database** (once, or after the place data changes): in `server/.env`, remove the two `EMULATOR` lines and set `FIREBASE_PROJECT_ID` and `FIREBASE_SERVICE_ACCOUNT` (the key JSON on one line), then `npm run seed`. Put the emulator lines back afterwards. This replaces the seeded places and resets the demo accounts.
3. **Render (API):** root directory `ChopeLess/server`, start command `npm start`. Environment: the server `.env` values without the emulator lines, plus `CLIENT_URL` = the Vercel URL.
4. **Vercel (website):** root directory `ChopeLess/client`, build `npm run build`, output `dist`. Environment: `VITE_USE_EMULATOR=false`, the `VITE_FIREBASE_*` web config, and `VITE_API_URL` = the Render URL + `/api`. Vercel installs with pnpm, so after adding a package run `npx pnpm@10 install --lockfile-only` and commit `pnpm-lock.yaml`.
5. **Stripe (test mode):** add a webhook endpoint `https://<render-url>/api/payments/webhook` for `checkout.session.completed`, and put its signing secret in Render as `STRIPE_WEBHOOK_SECRET`.

Never commit `.env` files or key files.

---

## API (Express)

All routes need a logged-in user unless noted. Full details are in the comments of each file in `server/routes/`.

| Area | Routes |
|---|---|
| Sessions | `POST /api/sessions/:code/start` (host), `/vote`, `/buy-super-like`, `/finish` |
| Shortlist | `GET /api/shortlist/:code`, `GET /api/shortlist/:code/route` (OSRM walking path) |
| Places | `POST /api/places/:id/analyse` (photo → queue estimate; no login, rate-limited) |
| Crowd reports | `POST /api/crowd-reports`, `GET /mine`, `GET /pending`, `PATCH /:id/verify` |
| Gems | `GET/POST /api/gems`, `PUT/DELETE /:id`, `POST/DELETE /:id/upvote`, `GET/POST/PUT/DELETE /:id/reviews` |
| Points | `GET /api/points/me`, `/history`, `/leaderboard`, `/priority`; `PATCH /ledger/:id/reverse`, `DELETE /ledger/:id` (admin) |
| Orders | `POST /api/orders`, `/join`, `/:id/items`, `/:id/cancel`, `/:id/checkout`, `/:id/preparing`, `/:id/ready`, `/:id/collect`, `/:id/fastpass`; `GET /:id/queue` |
| Payments | `POST /api/payments/webhook` (Stripe, signed), `POST /:id/refund`, `DELETE /:id` (admin) |
| Hawkers / admin | `POST /api/hawkers/apply`, `/menu`, `/menu/many`; `PATCH/DELETE /menu/:dishId`; `GET /api/admin/users`, `/applications`; approve / reject |

---

## Credits

- **Libraries:** Vue, Vue Router, Pinia, Vite, Tailwind CSS, Express, Firebase, Leaflet, canvas-confetti (MIT), Stripe, Playwright, Vitest, Vue Test Utils.
- **Data and services:** map data © OpenStreetMap contributors; walking routes by OSRM; queue estimates by OpenAI; payments by Stripe (test mode).
- **Fonts:** Lilita One and Nunito (Google Fonts, SIL Open Font License).
- **Sound and music:** written by us in code with the Web Audio API; no audio files are used.
- **AI use:** _TODO: one honest sentence on how the team used AI tools._ Code adapted from elsewhere is credited in a comment where it is used.