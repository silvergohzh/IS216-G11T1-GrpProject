# ChopeLess

**Skip the chope. Skip the queue.** Decide where to eat in minutes: set your group's budget and diet, get a shortlist, swipe to vote, and skip the long queues.

IS216 Web Application Development II · G11 · Team 1

| | |
|---|---|
| **Deployed app** | _TODO: Vercel URL_ |
| **API** | _TODO: Render URL_ |
| **Git repo** | _TODO: GitHub URL (must be public)_ |
| **Video** | _TODO: YouTube URL_ |

---

## Changing the app name

The name lives in `client/src/config.js` (navbar label, tab titles, home page), `client/index.html` (`<title>`) and `client/public/favicon.svg` (tab icon). The internal emulator ID `demo-hiddengems` is never shown to users; leave it as is so existing `.env` files keep working.

## Who owns what

Every file starts with a comment that says who owns it. Search the code for `TODO (M3)` (or your number) to find your next tasks.

| # | Member | Part | Your files |
|---|---|---|---|
| M1 | Janani | Session and voting back-end | `server/routes/sessions.js`, the `sessions` block in `firestore.rules` |
| M2 | Nawaz | Shortlist engine and maps | `server/services/shortlist.js`, `server/services/osrm.js`, `server/routes/shortlist.js`, `client/src/components/MapView.vue` |
| M3 | Silver | Session front-end | `client/src/services/sessions.js`, `client/src/stores/session.js`, `client/src/views/SessionsView.vue`, `LobbyView.vue`, `VoteView.vue`, `WinnerView.vue`, `client/src/components/PlaceCard.vue` |
| M4 | Jonathan | QueueLess | `client/src/services/places.js`, `server/routes/places.js`, `server/services/openai.js`, `client/src/views/QueueLessView.vue`, `PlaceDetailView.vue` |
| M5 | Jan | Hidden Gems and data | `client/src/services/gems.js`, `client/src/views/GemsView.vue`, `server/seed/`, the `gems` and `places` blocks in `firestore.rules` |
| M6 | Myat | Orders + payments + platform (roles, testing, CI, delivery) | `server/routes/orders.js`, `server/routes/payments.js`, `server/routes/admin.js`, `server/services/payments.js`, `server/seed/platform.js`, `server/seed/menus.json`, `client/src/services/orders.js`, `client/src/lib/` (incl. `splitBill.js`), `OrdersView.vue`, `CartView.vue`, `HawkerOrdersView.vue`, `AdminView.vue`, `client/src/stores/auth.js`, `client/src/services/users.js`, `client/src/router/`, `App.vue`, `NavBar.vue`, `HomeView.vue`, `LoginView.vue`, `ProfileView.vue`, `server/index.js`, `server/firebase.js`, `server/middleware/auth.js`, the `users` and `orders` blocks in `firestore.rules`, `firebase.json`, `playwright.config.js`, `.github/workflows/`, this README |

**Shared files.** If you need to change a file someone else owns (for example, adding your route to `client/src/router/index.js`), tell them in the group chat first.

## How it works

```
Browser (Vue)  ──── reads/writes directly ────▶  Firestore  (protected by firestore.rules)
     │                                              ▲
     └── trusted actions only ──▶ Express API ──────┘  (admin access)
         start voting, vote, analyse photo
```

- **Most data goes straight from the browser to Firestore.** Profiles, sessions, gems and places are read and written in `client/src/services/`.
- **Live updates.** The lobby, vote tally and gems board use Firestore's `onSnapshot`, so every phone updates the moment anything changes. No refreshing or polling.
- **`firestore.rules` is our security.** Because the browser talks to the database directly, the rules decide who can do what. For example, only the host can change settings, you can only edit your own gem, and you can only upvote once.
- **The Express server does the jobs the browser can't be trusted with.** It builds the shortlist, records votes and picks the winner (so nobody can fake a result), and calls OpenAI (so the API key stays secret).

## Tech stack

| Layer | What we use |
|---|---|
| Front-end | HTML, CSS, JavaScript, **Vue 3** (`<script setup>`), Vue Router, Pinia, built with Vite |
| Styling | **Tailwind CSS v4**, plus shared classes in `client/src/style.css` (`.btn`, `.card`, `.input`, ...) |
| Data store | **Cloud Firestore** (Firebase). Collections: `users`, `sessions`, `places` (+ `analyses`), `gems` |
| Login | **Firebase Authentication** (email + password) |
| Back-end | Node.js + **Express**, using the Firebase Admin SDK |
| APIs | Firebase Auth + Firestore, OSRM (walking time), OpenStreetMap tiles via Leaflet, OpenAI vision (queue photos) |
| Testing | **Playwright** end-to-end tests, run against the Firebase emulators |

## Firestore data

| Collection | Fields | Who writes it |
|---|---|---|
| `users/{uid}` | name, defaultBudget, dietary[], role (`diner` / `hawker` / `admin`), placeId (hawkers only) | The user (name, budget, diet); **only the server** sets role and placeId (M6) |
| `orders/{id}` | placeId, placeName, ownerUid, joinCode, members[{uid, name}], memberUids[], items[{lineId, itemId, name, price, qty, addedBy, addedByName}], total, status (cart / awaiting_payment / paid / preparing / ready / collected / cancelled), readyAt, pickupBy (15 min after ready), collectedAt, collectedByName, createdAt, paidAt. **Money is in cents.** | Only the server (M6). The group, the stall's hawker and admins can read it |
| `orders/{id}/proofs/{ready \| collected}` | photo (small JPEG as text), byUid, byName, at | Only the server: the hawker's photo when ready, the diner's photo when collected (M6) |
| `hawkerApplications/{uid}` | uid, applicantName, stallName, cuisine, address, lat, lng, dietary[], serviceModes[], status (pending / approved / rejected), reason, placeId (once approved) | Only the server: the applicant applies, an admin approves or rejects (M6) |
| `sessions/{code}` | hostUid, status (lobby / voting / done), serviceMode, maxWalkMins, maxWaitMins, meetingPoint, members{uid: {name, budget, dietary}}, shortlist[], votes{placeId: {uid: true/false}}, winner, expiresAt | Browser in the lobby (M3, rules by M1); server for shortlist, votes and winner (M1) |
| `places/{id}` | name, cuisine, address, lat, lng, priceMin, priceMax, dietary[], serviceModes[], latest{waitMins, seatOccupancy, ...}, menu[{id, name, price (cents), available}], ownerUid (stalls created by hawker sign-up) | Seed script (M5, menus by M6); hawker sign-up after admin approval and **My menu** (M6); server updates `latest` (M4) |
| `places/{id}/analyses/{id}` | hour, peopleInQueue, waitMins, seatOccupancy, confidence | Seed script and server (M4) |
| `gems/{id}` | name, mustTry, price, address, lat, lng, dietary[], submittedBy, upvoters[] | The user (M5) |

## Setup (first time)

You need:
- **Node.js 20 or newer**
- **Java 11 or newer**, which the Firebase emulator needs. Check with `java -version`. If it's missing, install it from [adoptium.net](https://adoptium.net).

```bash
git clone <repo-url>
cd chopeless

cd server && cp .env.example .env && npm install
cd ../client && cp .env.example .env && npm install
```

The `.env` files are already set up for the **local emulators**, so you don't need a real Firebase project to start building.

QueueLess photo analysis uses OpenAI. Add `OPENAI_API_KEY=sk-...` to `server/.env` (optionally `OPENAI_MODEL`, default `gpt-4o`). Without a key the server returns a random sample estimate, so the page still works.

Payments use **Stripe in test mode** (no real money). Add `STRIPE_SECRET_KEY=sk_test_...` and `STRIPE_WEBHOOK_SECRET=whsec_...` to `server/.env` (see the comments in `server/.env.example`). Without them, pressing Pay marks the order paid straight away ("demo mode"). Test card: **4242 4242 4242 4242**, any future date, any CVC.

## Running the app locally

Open three terminals:

```bash
# Terminal 1: local Firebase (Auth + Firestore). Data resets every time you stop it.
cd client && npm run emulators
#   then, once it says "All emulators ready", load the sample places, menus and test accounts (in any terminal):
cd server && npm run seed

# Terminal 2: API on http://localhost:3000
cd server && npm run dev

# Terminal 3: website on http://localhost:5173
cd client && npm run dev
```

- Sign up with any email and a password of 6+ characters. Accounts only exist on your laptop.
- Open http://localhost:4000 to see the **Emulator UI**. It shows every Firestore document and user, which is very handy for debugging.

### Test accounts

`npm run seed` creates ready-made accounts, so nobody has to sign up. The login page has a **one-tap button** for each (password **test1234** for all):

| Email | Name | Role |
|---|---|---|
| `alice@chopeless.test` | Alice Tan | Diner |
| `ben@chopeless.test` | Ben Lim | Diner |
| `chloe@chopeless.test` | Chloe Ng | Diner |
| `hawker@chopeless.test` | Albert Centre Hawker | Hawker, **Order board** for Albert Centre |
| `hawker2@chopeless.test` | Waterloo Centre Hawker | Hawker, **Order board** for Waterloo Centre |
| `admin@chopeless.test` | Admin | Admin, can change anyone's role |
| `dan@chopeless.test` | Dan Koh | Diner with a **hawker application waiting** (Dan's Nasi Lemak), so the admin has one to approve |

New sign-ups are always diners. An admin can make someone a hawker on the Admin page.

**Pickup flow:** diner pays → hawker taps *Start preparing* → hawker uploads a photo and taps *Mark ready* (starts a **15-minute** pickup timer and notifies the diner) → the diner uploads a photo and taps *I've collected it*. Both diner and hawker keep an **order history** with the photos.

**Group orders:** the person who starts an order shares its **6-letter code** (or the link `/orders?join=CODE`). Friends enter it under *Join a group order* on the Pre-order page.

**Hawker sign-up and menus:** a hawker applies at `/hawker/signup` (account + stall name, cuisine, address, map location, diet tags). An **admin approves** it on the Admin page, which creates the stall in `places` and makes the account its hawker; a rejection shows the applicant the reason. The hawker then builds the menu on **My menu**: add, edit, delete, mark sold out, or **scan a photo of the menu board** — OpenAI GPT-4o reads dishes and prices into a draft the hawker checks before saving (without `OPENAI_API_KEY`, sample dishes). Every stall has a **public page** `/stalls/<id>` (no login needed) with the menu, map and a Pre-order button. Menu changes appear live there and in pre-orders; sold-out dishes can't be ordered.

## Testing

```bash
cd client
npx playwright install chromium     # first time only
npm run test:e2e
```

`npm run test:e2e` starts the Firebase emulators, loads the sample places, starts test copies of the website (port 5174) and API (port 3001), runs every test at desktop and phone (375px) sizes, then shuts everything down. Every run starts from a clean database, so results are repeatable. Stop `npm run emulators` first, because the tests need the same ports.

| Test file | Owner | What it checks |
|---|---|---|
| `home.spec.js` | M6 | Logged-out users are sent to login; sign up, then save and reload a profile |
| `sessions.spec.js` | M3 / M1 | **Two browsers:** host creates, guest joins live, host starts voting, both vote yes, both see the same winner |
| `queueless.spec.js` | M4 | Seeded places show a crowd level; the place page shows the hourly chart |
| `gems.spec.js` | M5 | Add, edit and delete a gem |
| `orders.spec.js` | M6 | Full journey: pay (signed Stripe webhook) → hawker readies with a photo → diner gets a pop-up and collects with a photo → both histories; fake payment rejected; group order by code and by link with split bill; same stall reopens the same cart; one-tap demo login; diners can't open hawker/admin pages |
| `hawkers.spec.js` | M6 | Hawker applies → admin approves → hawker adds and edits a dish, scans a menu photo, marks one sold out → public page shows it without login → a diner pre-orders from it; a rejection shows the reason; diners can't open My menu |

Unit tests for the split-bill algorithm: `cd client && npm run test:unit` (Node's built-in test runner).

**CI:** `.github/workflows/tests.yml` runs the unit and end-to-end tests on GitHub for every pull request, so you see ✅ or ❌ before merging.

**Adding your tests:** make a file in `client/e2e/` named after your feature, and use `signUp(page)` from `e2e/helpers.js` to get a logged-in user. Find elements with `getByRole`, `getByLabel` or `data-testid`, so restyling a page doesn't break its tests.

## How to work together (Git)

1. Always start from the latest `main`: `git checkout main && git pull`
2. Make a branch for your task: `git checkout -b m3-swipe-animation`
3. Commit small and often: `git add . && git commit -m "Add swipe animation to vote page"`
4. Push and open a Pull Request: `git push -u origin m3-swipe-animation`
5. Ask one teammate to review, then merge into `main`.

Rules: never commit `.env` files. Don't push straight to `main`. Pull before you start each day.

## API reference (Express)

Everything else goes through Firestore directly. All routes need a logged-in user, except photo analysis.

| Method | Route | Owner | What it does |
|---|---|---|---|
| GET | `/api/health` | M6 | Is the API up, and is it using the emulator? |
| POST | `/api/sessions/:code/start` | M1 + M2 | Host only. Builds the shortlist and opens voting |
| POST | `/api/sessions/:code/vote` | M1 | Vote `{ placeId, yes }`. The first place with all yes wins |
| GET | `/api/shortlist/:code` | M2 | Preview the shortlist without starting voting |
| POST | `/api/places/:id/analyse` | M4 | No login needed (10 photos per 10 min per visitor). Send `{ imageBase64, mimeType }`; OpenAI estimates queue length, wait, seats taken and confidence |
| POST | `/api/orders` | M6 | Start a cart for a stall `{ placeId }` (reopens your open cart there if you have one) |
| POST | `/api/orders/join` | M6 | Join a group cart with its code `{ code }` |
| POST / PATCH / DELETE | `/api/orders/:id/items[/:lineId]` | M6 | Add `{ itemId, qty }`, change `{ qty }` or remove a cart item. Prices come from the menu on the server |
| POST | `/api/orders/:id/cancel` | M6 | Owner only, before paying |
| POST | `/api/orders/:id/checkout` | M6 | Owner only. Returns a Stripe checkout page URL |
| POST | `/api/orders/:id/preparing` | M6 | Hawker of that stall (or admin): paid → preparing |
| POST | `/api/orders/:id/ready` | M6 | Hawker of that stall (or admin), with `{ photo }`: preparing → ready, starts the 15-minute pickup timer |
| POST | `/api/orders/:id/collect` | M6 | Someone in the order, with `{ photo }`: ready → collected |
| POST | `/api/payments/webhook` | M6 | Called **by Stripe**, checked with the signing secret. Marks the order paid |
| GET / PATCH | `/api/admin/users[/:uid]` | M6 | Admin only: list accounts, change a role `{ role, placeId }` |
| GET | `/api/admin/applications` | M6 | Admin only: hawker applications waiting |
| POST | `/api/admin/applications/:uid/approve` · `/reject` | M6 | Admin only: approve (creates the stall) or reject `{ reason }` |
| POST / GET | `/api/hawkers/apply` · `/api/hawkers/application` | M6 | Apply to be a hawker with stall details; see my application |
| POST / PATCH / DELETE | `/api/hawkers/menu[/:dishId]` | M6 | Hawker only, own stall: add `{ name, price }` (dollars), edit `{ name, price, available }`, delete |
| POST | `/api/hawkers/menu/many` | M6 | Hawker only: add the reviewed AI draft `{ items }` |
| POST | `/api/hawkers/menu/scan` | M6 | Hawker only: `{ photo }` → OpenAI reads the menu board → draft `{ items }` (not saved) |

## Deployment (M6, Week 11)

1. **Create the real Firebase project** (free Spark plan) at console.firebase.google.com:
   - Turn on **Authentication → Email/Password** and create a **Firestore** database.
   - Publish the rules: `cd client && npx firebase deploy --only firestore:rules --project <project-id> --config ../firebase.json`
   - Optional: add a **TTL policy** on the `sessions` collection, field `expiresAt`, so old sessions delete themselves.
2. **Seed the real database:** in `server/.env`, remove the two `EMULATOR` lines, set `FIREBASE_PROJECT_ID` and `FIREBASE_SERVICE_ACCOUNT`, then run `npm run seed`.
3. **Back-end → Render:** root directory `server`, start command `npm start`. Add the server `.env` values (without the EMULATOR lines) in Render's settings, and set `CLIENT_URL` to the Vercel URL.
4. **Front-end → Vercel:** root directory `client`, build `npm run build`, output `dist`. Set `VITE_USE_EMULATOR=false`, the `VITE_FIREBASE_*` web config values, and `VITE_API_URL` to the Render URL + `/api`.
5. In Firebase **Authentication → Settings → Authorized domains**, add the Vercel domain.
6. **Stripe (test mode):** in the Stripe dashboard → Developers → Webhooks, add an endpoint `https://<render-url>/api/payments/webhook` for the event `checkout.session.completed`. Put its signing secret in Render as `STRIPE_WEBHOOK_SECRET`, and the test secret key as `STRIPE_SECRET_KEY`.

Keep the app, API keys and database running until **after Week 18** (per the project brief).

## Credits

Map data © OpenStreetMap contributors · Walking routes: OSRM · Libraries: Vue, Vue Router, Pinia, Tailwind CSS, Leaflet, Express, Firebase, Playwright. Code adapted from elsewhere must be credited in a comment where it's used.
