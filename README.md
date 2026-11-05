# ChopeLess
 
**Skip the chope. Skip the queue.** ChopeLess helps a group of friends decide where to eat in a few minutes. Everyone sets their budget and diet, the app builds a shortlist of places within walking distance and with short queues, the group swipes to vote, and the winner can be pre-ordered and paid for as a group.
 
IS216 Web Application Development II · Section G11 · Team 1 · Silver, Janani, Nawaz, Jonathan, Jan, Myat
 
| | |
|---|---|
| **Live app** | https://chopeless.vercel.app |
| **API (Render)** | https://chopeless-api.onrender.com/api/health (free plan: the first request after a quiet spell can take up to a minute while it wakes up) |
| **GitHub** | https://github.com/silvergohzh/IS216-G11T1-GrpProject |
| **Video (YouTube, unlisted)** | https://www.youtube.com/watch?v=wDnclbpYWIE |
 
All the code is in [`ChopeLess/`](ChopeLess): `client/` (Vue website) and `server/` (Express API).
 
---
 
## For graders: where to find each criterion
 
| Criterion | Where to look |
|---|---|
| **Working app** | [Try it](#try-it): demo accounts and a 4-step walkthrough on the live app |
| **Vue** | [Vue](#vue): components, router guards, Pinia, live data. Code in `client/src/` |
| **Data store and APIs** | [Data and APIs](#data-and-apis): Firestore collections, Express routes, external APIs |
| **Trust and security** | [Trust and security](#trust-and-security): `ChopeLess/firestore.rules`, `server/middleware/auth.js` |
| **Testing** | [Tests](#tests): one command per suite, a test table per member, CI on every pull request |
| **Design and responsiveness** | [Design](#design): Tailwind tokens in `client/src/style.css`, 375px phone to desktop |
| **Beyond the brief** | [Beyond the brief](#beyond-the-brief) |
| **Who did what** | [Features](#features) and [Team](#team) |
 
---
 
## Try it
 
Open the live app and log in with a demo account (password for all: **`test1234`**), or sign up with any email.
 
| Email | Who | Good for trying |
|---|---|---|
| `alice@chopeless.test` | Alice Tan, diner, 1000 Makan Points | Hosting a Makan Session, Fastpass, buying an extra Super Like |
| `ben@chopeless.test` | Ben Lim, diner | Joining Alice's session from a second browser |
| `chloe@chopeless.test` | Chloe Ng, diner | A third voter |
| `hawker@chopeless.test` | Ah Seng Chicken Rice (inside Albert Centre) | Order board, My menu, Earnings |
| `hawker2@chopeless.test` | Waterloo Nasi Lemak (inside Waterloo Centre) | A second stall |
| `<place id>@chopeless.test` | The hawker of every other stall, e.g. `albert-laksa@chopeless.test`, `warung-leko@chopeless.test` | Whichever place wins the vote, its hawker can log in. Each board starts with demo orders |
| `admin@chopeless.test` | Admin | Approving hawker sign-ups, changing roles |
| `dan@chopeless.test` | Dan Koh, diner | Has a hawker application waiting for the admin |
 
**A quick demo (two browsers, e.g. Chrome and an incognito window):**
1. **Alice:** Makan Session → **Create session**. **Ben:** type the 6-letter session code → **Join**.
2. **Alice:** tap the map to set a meeting point → **Start voting**. Both swipe right (yes) or left (nope), or use ⭐ Super Like / 🚫 Veto. The winner appears on both screens at the same time.
3. **Winner page:** walking route on the map, live queue estimate, then **Pre-order as a group** (host). Pay with Stripe test card `4242 4242 4242 4242`, any future date, any CVC.
4. **Hawker account:** Start preparing → Mark ready (with a photo). **Diner:** I've collected it.
---
 
## Features
 
| Feature | What it does | Owner |
|---|---|---|
| **Makan Session** | Create or join with a 6-letter code. Live lobby where each person sets their own budget and diet. The host sets the meeting point (map or "use my location"), walk and queue limits and the timer, and can remove someone (they can't rejoin). Swipe voting with ⭐ Super Like (1 free, more for 20 points) and 🚫 Veto, a live tally and a shared timer. The highest score wins Round 1; if nobody says yes, Round 2 relaxes the limits. Ties are decided by the server and revealed by the Chope-Pon gacha machine. | Silver (front end), Janani (voting rules), Nawaz (shortlist) |
| **Shortlist engine** | Filters places by dine-in/takeaway, the tightest budget, everyone's diet, real walking time (OSRM) and queue time, and picks the top 8. | Nawaz |
| **Makan Kakis** | Saved friend groups with a Kaki code. Create, join, rename, remove a member, leave, delete. One tap starts a session for the whole group; a "● Live" badge and a "Live now" bar on Home lead everyone back to it. | Silver |
| **Makan Quest home** | Island map of the app (ticks saved to your account, reset daily), Today's Quests, this week's leaderboard, For You recommendations, loading screen, sound effects and music. | Silver |
| **QueueLess** | Crowd level for each place, an hourly chart, and AI queue estimates from a photo (OpenAI vision). Crowd reports from diners, verified for points. Re-vote as a group if the winner's queue is too long. | Jonathan (QueueLess), Janani (crowd reports, re-vote) |
| **Hidden Gems** | Add, edit, delete and upvote small local spots, with reviews and a community menu. Address search finds the map pin. A gem with 3 upvotes joins the places list. | Jan (Nawaz: address search) |
| **Makan Points** | Points for finishing sessions (+10, host +5), verified crowd reports (+15) and collecting pre-orders (+10). Badges, history, weekly leaderboard. Spend them on extra Super Likes (20) and Fastpass (150). | Janani |
| **Pre-order and payments** | Group carts (everyone in the session is added automatically), split bill, Stripe Checkout (test mode), hawker order board, 15-minute pickup timer with photo proof, Fastpass priority queue. Hawker centres and food courts contain their own stalls. | Myat (Nawaz: Fastpass) |
| **Hawker portal and admin** | Hawkers apply, an admin approves, the hawker manages the menu and sees earnings. Roles: diner, hawker, admin. | Myat |
 
---
 
## How it works
 
```
Browser (Vue)  ──── reads/writes directly ────▶  Firestore  (protected by firestore.rules)
     │                                              ▲
     └── trusted actions only ──▶ Express API ──────┘  (Firebase Admin SDK)
         shortlist, votes, winner, points, orders, payments, AI photo estimate
```
 
- **Simple reads and writes go straight to Firestore** from `client/src/services/`, and `firestore.rules` decides who may do what.
- **Live updates:** the lobby, vote tally, groups, orders and gems use Firestore's `onSnapshot`, so every phone updates without refreshing.
- **Anything that must be fair or secret goes through the Express server:** building the shortlist, recording votes, picking the winner, Makan Points, orders, payments and calling OpenAI. Votes and points use Firestore **transactions**, so two people acting at the same moment can't overwrite each other.
### Vue
 
| What | Where |
|---|---|
| Single-file components with `<script setup>` | `client/src/views/` (pages), `client/src/components/` (e.g. `SwipeCard`, `PlaceCard`, `GachaTie`, `MapView`, `IslandMap`, `LiveSessions`) |
| Vue Router with login and role guards (`meta.requiresAuth`, `meta.role`) | `client/src/router/index.js` |
| Pinia stores: who is logged in, the live session | `client/src/stores/auth.js`, `client/src/stores/session.js` |
| Props, emits, `computed`, `watch`, lifecycle hooks, `v-model` forms with validation | throughout, e.g. `LobbyView.vue`, `VoteView.vue`, `GroupDetailView.vue` |
| Live data: a listener starts in `onMounted` and stops in `onUnmounted` | `client/src/services/*.js` (`watchSession`, `watchGroup`, `watchMyOrders`) |
 
### Data and APIs
 
**Firestore collections**
 
| Collection | What's in it | Written by |
|---|---|---|
| `users/{uid}` | name, default budget, diet, role, stall (hawkers) | the user; role and stall only by the server |
| `users/{uid}/history`, `/saved`, `/visited` | Meal History, saved ♥ places, island ticks per day | server (history); the user (saved, visited) |
| `sessions/{code}` | host, status, settings, members, kicked, shortlist, votes, Super Likes, vetoes, winner, tie-break, group pre-order | lobby: the browser; voting and winner: the server |
| `groups/{code}` | name, owner, members, kicked, live session | the browser (rules: only the owner removes people) |
| `places/{id}` (+ `analyses`) | place details, type, menu, latest queue estimate, hourly history | seed script, server, hawkers (own menu, via the API) |
| `gems/{id}` (+ `reviews`, `menu`) | hidden gems, upvoters, reviews, community menu | the user, via the server |
| `crowdReports`, `pointsAccounts`, `pointsLedger` | crowd reports, point balances, every points change | server only |
| `orders/{id}` (+ `proofs`), `payments/{id}`, `hawkerApplications/{uid}` | orders, payment records, hawker sign-ups | server only |
 
**External APIs:**
- **OSRM** for walking time and route;
- **Nominatim** for address search;
- **OpenStreetMap** tiles via **Leaflet**;
- **OpenAI vision** for queue estimates from a photo;
- **Stripe Checkout** in test mode.
**Browser APIs:**
- **Web Audio** for all sounds and music, with no audio files;
- **Geolocation** for "use my location";
- **Clipboard** for copying codes;
- **Pointer Events** for swiping;
- **IntersectionObserver**;
- **localStorage**.
The full route list is under [API reference](#api-reference).
 
### Trust and security
 
| Protection | How |
|---|---|
| **Firestore security rules** (`ChopeLess/firestore.rules`) | Only the host changes session settings. Members edit only their own entry, and only in the lobby. Removed people can't rejoin. Only a group's owner removes members or deletes the group. Users can't give themselves a role. Votes, points, orders and payments can't be written from the browser at all. |
| **Every API call is checked** | The browser sends its Firebase login token, and `server/middleware/auth.js` verifies it. `requireRole('admin' / 'hawker')` protects admin and hawker routes, and the router hides those pages from diners. |
| **Fair results** | Votes, the winner, tie-breaks and points are decided on the server inside transactions. The gacha animation only reveals the server's pick, so every phone sees the same winner. |
| **Payments** | Prices come from the menu on the server, never from the browser. Stripe's webhook is checked with its signing secret, so a fake "paid" message is rejected (there's a test for this). |
| **Secrets and abuse** | API keys live only in server environment variables (`.env` is never committed). CORS allows only our website. Photo analysis and address search are rate-limited. |
 
### Design
 
- **Tailwind CSS v4.** The brand colours and fonts are design tokens in `client/src/style.css` (`--color-ink`, `--color-accent`, Lilita One and Nunito), plus shared classes (`.btn`, `.card`, `.input`, `.chip`).
- **Responsive from 375px phones to desktop.** The navigation folds into a ☰ menu, and every end-to-end test also runs at phone size.
- **Accessibility:**
  - real buttons and labels;
  - keyboard voting (← → ↑);
  - visible focus outlines;
  - `aria-live` for live updates;
  - reduced motion respected for confetti.
### Beyond the brief
 
- **AI queue estimates** from a photo (OpenAI vision).
- **Real payments flow** with Stripe test mode, signed webhooks and payment records.
- **Fastpass priority queue** paid for with points.
- **Chope-Pon gacha** for fair tie-breaks.
- **Makan Quest island home:**
  - daily ticks;
  - quests;
  - leaderboard;
  - music and sounds written in code with Web Audio.
- **Group pre-order** that moves the whole session to one cart.
- **Hawker portal** with admin approval and photo proof of pickup.
- **CI on GitHub** that runs every test suite on each pull request.
---
 
## Run it locally
 
You need **Node.js 20+** and **Java 11+** (for the Firebase emulator; check with `java -version`).
 
```bash
git clone https://github.com/silvergohzh/IS216-G11T1-GrpProject.git
cd IS216-G11T1-GrpProject/ChopeLess
 
cd server && cp .env.example .env && npm install
cd ../client && cp .env.example .env && npm install
```
 
The example `.env` files use the **local Firebase emulators**, so no real Firebase project or keys are needed. In three terminals:
 
```bash
# 1. Local Firebase (Auth + Firestore). Everything resets when you stop it.
cd client && npm run emulators
#    when it says "All emulators ready", load the places, menus and demo accounts (any terminal):
cd server && npm run seed
 
# 2. API on http://localhost:3000
cd server && npm run dev
 
# 3. Website on http://localhost:5173
cd client && npm run dev
```
 
The Emulator UI at http://localhost:4000 shows every document and user. The demo accounts in [Try it](#try-it) work locally too.
 
**Optional keys** in `server/.env`:
- `OPENAI_API_KEY` for real photo estimates. Without it, the server returns a sample estimate.
- `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` for real Stripe test checkout. Without them, Pay marks the order paid straight away ("demo mode").
---
 
## Tests
 
| Command | Run in | What it runs |
|---|---|---|
| `npm run test:e2e` | `ChopeLess/client` | All **Playwright end-to-end** tests, each at desktop and phone (375px) size, against a **fresh emulator database** every run. Stop `npm run emulators` first, because the tests use the same ports. First time only: `npx playwright install chromium` |
| `npm run test:vitest` | `ChopeLess/client` | **Vitest** unit and component tests (`src/**/__tests__/*.spec.js`) |
| `npm run test:unit` | `ChopeLess/client` | Split-bill unit tests (Node test runner) |
| `npm test` | `ChopeLess/server` | Server unit tests: winner rules, priority queue, shortlist, walking time, address lookup |
 
To run **one** end-to-end file or test (from `ChopeLess/client`):
```bash
npx firebase emulators:exec --config ../firebase.json --project demo-hiddengems --only auth,firestore "npx playwright test e2e/sessions.spec.js:7"
```
To see what happened in a failed test, run `npx playwright show-report`. It shows each step, the error and a screenshot.
 
**GitHub Actions** (`.github/workflows/tests.yml`) runs all four suites on every pull request and every push to `main`, so a broken change shows a red ✗ before it is merged.
 
### Tests by member
 
| Member | Unit | Component | End-to-end (`client/e2e/`) |
|---|---|---|---|
| **Silver** | `lib/__tests__/today.spec.js`: daily resets happen at Singapore midnight | `PlaceCard.spec.js` (place details and chips from props), `GachaTie.spec.js` (shows the server's pick, emits `done` once) | `sessions.spec.js`, `groups.spec.js`, `island.spec.js`, `foryou.spec.js`: **30 tests** covering create/join, live lobby, kick, leave and rejoin, Super Like, Veto, buying a Super Like, tie and gacha, Round 2, winner page, groups (create, join, rename, kick, leave, delete), island ticks, quests and For You |
| **Janani** | `server/tests/winner.test.js` (Round 1 and 2 rules, Super Likes, vetoes, ties), `priorityQueue.test.js` (Fastpass order) | _Janani: add your component tests_ | Voting rules in `sessions.spec.js` (shared with Silver) |
| **Nawaz** | `lib/__tests__/walkingTime.spec.js`, `server/tests/shortlist.test.js`, `osrm.test.js`, `geocode.test.js` | `MapView.spec.js`, `GemsAddressLookup.spec.js` | `geocode.spec.js` ("Find on map"); meeting point and Round 2 tests in `sessions.spec.js` |
| **Jonathan** | `queue.spec.js` (hourly averages, crowd level, "as of" time) | `PlaceDetailView.spec.js`, `QueueLessView.spec.js` | `queueless.spec.js` |
| **Jan** | _Jan: add your unit test_ | _Jan: add your component tests_ | `gems.spec.js` (add, edit and delete a gem) |
| **Myat** | `lib/splitBill.test.js` (split by item and equally) | `PickupTimer.spec.js`, `ProofUpload.spec.js` | `home.spec.js`, `orders.spec.js`, `hawkers.spec.js` (full pay → ready → collect journey with photos, fake payment rejected, Fastpass, group pre-order, split bill, hawker sign-up and approval, role checks) |
 
**How the tests are written:**
- **Main user journeys:** each end-to-end test follows a real user from start to finish, often with several people in separate browser windows (host, guest, outsider).
- **Repeatable:**
  - every run starts from a clean emulator database;
  - every test signs up brand-new accounts;
  - shared data, such as the seeded queue times, is reset before the tests that depend on it;
  - walking times use an offline estimate in tests, so the shortlist is the same every run.
- **Stable selectors:** elements are found the way a user sees them (`getByRole`, `getByLabel`) or by `data-testid`, never by CSS paths, so restyling a page doesn't break a test.
- **Clear structure:**
  - shared helpers (`e2e/helpers.js`, `e2e/session-helpers.js`: `signUp`, `openLobby`, `startVotingNoTimer`, `voteThrough`);
  - one behaviour per test;
  - test names that read as sentences;
  - a short comment on each step.
---
 
## Deployment
 
1. **Firebase:** turn on Email/Password sign-in and Firestore. Publish the rules from `ChopeLess` with `npx firebase-tools deploy --only firestore:rules --project <project-id>`. Add the Vercel domain under Authentication → Settings → Authorized domains.
2. **Seed the live database:** set `FIREBASE_PROJECT_ID` and `FIREBASE_SERVICE_ACCOUNT` (the key JSON on one line) in `server/.env`, with no emulator lines, then run `npm run seed`. To only refresh the demo hawkers and demo orders, without replacing places or resetting points, run `npm run seed:demo`.
3. **Render (API):** root directory `ChopeLess/server`, start command `npm start`. Environment: the server `.env` values plus `CLIENT_URL` = the Vercel URL.
4. **Vercel (website):** root directory `ChopeLess/client`, build `npm run build`, output `dist`. Environment: `VITE_USE_EMULATOR=false`, the `VITE_FIREBASE_*` web config and `VITE_API_URL` = the Render URL + `/api`.
5. **Stripe (test mode):** add a webhook endpoint `https://<render-url>/api/payments/webhook` for `checkout.session.completed`, and put its signing secret in Render as `STRIPE_WEBHOOK_SECRET`.
Never commit `.env` files or key files. The app, API keys and database stay running until **after Week 18**, as the project brief requires.
 
---
 
## API reference
 
All routes need a logged-in user unless noted. Each file in `server/routes/` explains its routes in comments.
 
| Area | Routes |
|---|---|
| Sessions | `POST /api/sessions/:code/start` (host), `/vote`, `/buy-super-like`, `/finish`, `/start-revote`, `/revote`, `/finish-revote` |
| Shortlist | `GET /api/shortlist/:code`, `GET /api/shortlist/:code/route` (walking path) |
| Geocode | `GET /api/geocode?q=` (address or postal code → map pin; 1 request per second, cached 10 minutes) |
| Places | `POST /api/places/:id/analyse` (photo → queue estimate; no login, rate-limited) |
| Crowd reports | `POST /api/crowd-reports`, `GET /mine`, `GET /pending`, `PATCH /:id/verify` |
| Gems | `GET/POST /api/gems`, `PUT/DELETE /:id`, `POST/DELETE /:id/upvote`, `GET/POST/PUT/DELETE /:id/reviews`, `GET /:id/menu`, `POST/PUT/DELETE /:id/menu/items`, `POST/DELETE /:id/menu/photos` |
| Points | `GET /api/points/me`, `/history`, `/leaderboard`, `/priority`; `PATCH /ledger/:id/reverse`, `DELETE /ledger/:id` (admin) |
| Orders | `POST /api/orders`, `/join`, `/:id/items`, `/:id/cancel`, `/:id/checkout`, `/:id/preparing`, `/:id/ready`, `/:id/collect`, `/:id/fastpass`; `PATCH /:id/split`; `GET /:id/queue` |
| Payments | `POST /api/payments/webhook` (Stripe, signed), `DELETE /:id` (admin) |
| Hawkers and admin | `POST /api/hawkers/apply`, `/menu`, `/menu/many`; `PATCH/DELETE /menu/:dishId`; `GET /api/admin/users`, `/applications`; approve, reject |
 
---
 
## Team
 
| # | Member | Part | Main files |
|---|---|---|---|
| M1 | Janani | Voting rules, Makan Points, crowd reports, QueueLess re-vote | `server/routes/sessions.js`, `server/services/winner.js`, `server/services/points.js`, `sessions` rules |
| M2 | Nawaz | Shortlist engine, maps, address search, Fastpass | `server/services/shortlist.js`, `osrm.js`, `server/routes/geocode.js`, `MapView.vue` |
| M3 | Silver | Session front end, Makan Kakis, home, For You | `SessionsView`, `LobbyView`, `VoteView`, `WinnerView`, `GroupsView`, `GroupDetailView`, `IslandMap`, `TodayQuests`, `ForYou`, `PlaceCard`, `GachaTie`, `client/src/services/sessions.js` |
| M4 | Jonathan | QueueLess | `QueueLessView.vue`, `PlaceDetailView.vue`, `server/routes/places.js`, `server/services/openai.js` |
| M5 | Jan | Hidden Gems and place data | `GemsView.vue`, `GemMenu.vue`, `server/routes/gems.js`, `server/seed/` |
| M6 | Myat | Orders, payments, hawkers, roles, testing setup, CI, deployment | `OrdersView`, `CartView`, `HawkerOrdersView`, `AdminView`, `server/routes/orders.js`, `payments.js`, `admin.js`, `router/`, `playwright.config.js`, `.github/workflows/` |
 
Every file starts with a comment naming its owner. Edits to another member's file are marked with the editor's name, e.g. `// [SILVER]`.
 
---
 
## Credits
 
- **Libraries:**
  - Vue, Vue Router, Pinia, Vite, Tailwind CSS;
  - Express, Firebase, Leaflet, canvas-confetti (MIT), Stripe;
  - Playwright, Vitest, Vue Test Utils.
- **Data and services:**
  - map data © OpenStreetMap contributors;
  - address search by Nominatim;
  - walking routes by OSRM;
  - queue estimates by OpenAI;
  - payments by Stripe (test mode).
- **Fonts:** Lilita One and Nunito (Google Fonts, SIL Open Font License).
- **Sound and music:** written by us in code with the Web Audio API. No audio files are used.
- **AI use:** for design exploration, debugging hints and test scaffolding. Every feature was chosen, reviewed and can be explained by its owner.