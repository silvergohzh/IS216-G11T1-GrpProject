# Handover: who owns which part of the pre-order code

Myat (M6) built the whole pre-order flow so it works end to end. Some parts belong to other people's features, so they are handed over.
Each handed-over block is marked with the owner's name in a comment:

```js
// [NAWAZ] START: Fastpass & Makan Points in pre-orders (built by Myat, see HANDOVER.md)
...the code...
// [NAWAZ] END
```

In Vue templates the same marker is an HTML comment (`<!-- [SILVER] START ... -->`).
One-line markers (`// [NAME] ...`) point at a single line, and `// [NAME] TODO: ...` is something still to do.

Find your blocks:

```bash
grep -rn "\[NAWAZ\]"   server client/src client/e2e
grep -rn "\[SILVER\]"  server client/src client/e2e
grep -rn "\[JJYAYY\]"  server client/src client/e2e
grep -rn "\[JANANIJ\]" server client/src client/e2e
```

Everything marked already works and is tested. "Owning" it means you can explain it in the demo and finish the TODOs.
Please keep the code style simple (beginner style, comments in plain English), like the rest of the M6 code.

---

## Nawaz: Fastpass and Makan Points in pre-orders

**What it does**
- The group leader (the person who started the group order) can spend **150 Makan Points** on a **Fastpass**.
  The whole group order then jumps ahead of normal orders in the hawker's queue.
- Everyone in a group order earns **10 Makan Points** when the order is collected.
- Diners see "You're #2 of 5 in the queue". The hawker board shows a ⚡ Fastpass badge.

**How it works**
- `POST /api/orders/:id/fastpass` (server/routes/orders.js): in one Firestore transaction it checks that you are the leader, that the order is not already Fastpass, and that cooking hasn't started (`cart`, `awaiting_payment` or `paid`).
  Then it spends the points with JJyayy's `spendPointsInTx` and sets `priority: true` and `priorityBy` (the leader's name).
- `GET /api/orders/:id/queue` runs JJyayy's `sortPriorityQueue` over the stall's orders. It returns `{ position, waiting }`.
- `POST /api/orders/:id/collect` gives every member 10 points with `awardPoints` (eventId `preorder_<orderId>`, so nobody gets them twice).
- The seed gives alice 1000 points and ben and chloe 300 each (server/seed/platform.js).

**Where it is**

| File | Marked block |
| --- | --- |
| `server/routes/orders.js` | imports, `FASTPASS_COST` and `PREORDER_POINTS`, the `priority: false` flag, points on collect, the Fastpass and queue routes |
| `server/routes/payments.js` | TODO on the refund route |
| `server/seed/platform.js` | starting points for the demo accounts |
| `client/src/services/orders.js` | `buyFastpass`, `getQueuePosition`, `getMyPoints` |
| `client/src/views/CartView.vue` | Fastpass state, `canBuyFastpass`, loading points and queue, the `fastpass()` button, the Fastpass and queue template |
| `client/src/views/HawkerOrdersView.vue` | the ⚡ Fastpass badge |
| `client/src/views/OrdersView.vue` | ⚡ next to my active orders |
| `client/e2e/orders.spec.js` | the "Fastpass: ..." test |

**TODO**
1. Give the 150 points back when a Fastpass order is cancelled (`/:id/cancel`) or refunded (`/api/payments/:id/refund`).
   Use JJyayy's `reversePoints` or `awardPoints` with an eventId like `fastpass_refund_<orderId>`.
2. `FASTPASS_COST = 150` is written in both `CartView.vue` and the server. Send it from the server (for example in the `/queue` reply) so it is only in one place.

**Test it**: log in as alice (README demo accounts), pre-order at Ah Seng Chicken Rice, then click "Use 150 points".
Log in as `hawker@chopeless.test` and the order shows first with ⚡. Run `npx playwright test -g Fastpass` in `client/`.

---

## Silver: hawker centres, food courts, stalls and place tags

**What it does**
- Places have a **type**: `hawker-centre`, `food-court`, `restaurant`, or `stall` (a stall is inside a centre).
- On Pre-order, a hawker centre or food court shows **See stalls**, and then only the stalls inside it.
- Coloured tags (Hawker centre, Food court, Stall, Restaurant) come from `PlaceTag.vue`.
- Stalls are hidden from voting and from the main places list. You vote for the centre, then pick a stall when pre-ordering.
- A hawker who signs up can choose "inside which centre". The admin's approval then creates a `stall` with `parentId` and `parentName`.

**Where it is**

| File | Marked block |
| --- | --- |
| `client/src/components/PlaceTag.vue` | the whole component |
| `client/src/views/OrdersView.vue` | `isCentre`, `openCentre` and `closeCentre`, the stalls section, tags on place cards |
| `client/src/views/StallView.vue` | the tag and the "Inside ..." line |
| `client/src/views/HawkerSignupView.vue` | the "inside a centre?" dropdown |
| `client/src/views/AdminView.vue` | `centreName` and the "Stall inside ..." text |
| `client/src/services/orders.js` | `listStallsInside`, `listOrderablePlaces`, and the type fields in `getStall` |
| `client/src/services/places.js` | the filter that hides stalls (this is Jonathan's file) |
| `server/services/shortlist.js` | the filter that hides stalls from voting (this is Nawaz's M2 file) |
| `server/routes/hawkers.js` | checks that `parentId` is a hawker centre or food court |
| `server/routes/admin.js` | approving makes a `stall` inside the centre |
| `server/seed/platform.js` | section 1 (type tags) and section 3 (stalls) |
| `server/seed/stalls.json` | the 9 seeded stalls. JSON can't have comments, so it is not marked. |
| `client/e2e/orders.spec.js` | the "a hawker centre only shows the stalls inside it" test |
| `client/e2e/hawkers.spec.js` | the inside-a-centre sign-up test |

**TODO (ideas)**
1. Use `PlaceTag` on the voting cards (`PlaceCard.vue`) and the Winner page, so tags look the same everywhere.
2. Style the stall cards and the tags to fit the Makan Quest theme.

**Test it**: Pre-order, then Albert Centre, then See stalls, which shows 3 stalls. Run `npx playwright test -g "hawker centre"` in `client/`.

---

## JJyayy: Makan Points engine and priority queue hook-up

The pre-order code **uses** JJyayy's `services/points.js` and `services/priorityQueue.js`. It does not copy them.

| File | Marked line or block |
| --- | --- |
| `server/routes/orders.js` | TODO at `FASTPASS_COST`; checks where `awardPoints`, `spendPointsInTx` and `sortPriorityQueue` are called |
| `client/src/views/HawkerOrdersView.vue` | the board sort (paid Fastpass first, then paid normal, then preparing, then ready); same rule as `sortPriorityQueue` |

**TODO**
1. Add `FASTPASS: 150` and `PREORDER_COLLECTED: 10` to `POINT_RULES`. Then `orders.js` can use them instead of `POINT_RULES.PRIORITY` and the plain `10`.
2. Check that the board sort still matches `sortPriorityQueue` if the queue rule changes.

---

## JananiJ: Makan Points history page

| File | Marked line |
| --- | --- |
| `client/src/components/PointsHistory.vue` | TODO above `reasonLabels` |

**TODO**: pre-order points (+10, reason "Collected a pre-order from ...") and Fastpass spends (−150, reason "Fastpass for a pre-order at ...") now appear in the points history.
Give them a nice label or icon (for example ⚡ for Fastpass).

---

## Prompts to paste into your own Claude

Pull the latest code first (the `myat` branch, or `main` after it is merged), then paste your prompt.

**Nawaz**
> Read ChopeLess/HANDOVER.md, the "Nawaz" section. Then find every block marked `[NAWAZ]` (`grep -rn "\[NAWAZ\]" server client/src client/e2e`). The Fastpass and pre-order Makan Points code is already working. Explain to me how each marked block works, in simple words, so I can present it. Then do the `[NAWAZ] TODO` items: give the Fastpass points back when an order is cancelled or refunded, and send `FASTPASS_COST` from the server instead of hard-coding 150 in CartView.vue. Keep the code beginner-style with plain-English comments, like the existing code. Only change `[NAWAZ]` blocks unless you really need to, and don't edit code marked for other people. Add or update a Playwright test in client/e2e/orders.spec.js, and run `npm run test:e2e` in client/ with the emulators, API and seed running (see README). When a TODO is done, delete that TODO line but keep the START/END markers.

**Silver**
> Read ChopeLess/HANDOVER.md, the "Silver" section. Then find every block marked `[SILVER]` (`grep -rn "\[SILVER\]" server client/src client/e2e`), and also look at server/seed/stalls.json. The hawker centre, food court, stall and place tag code is already working. Explain to me how it fits together in simple words (the place `type`, `parentId` and `parentName`, how a centre opens its stalls, and how sign-up and admin approval create a stall). Then do the TODO ideas: use PlaceTag on PlaceCard.vue and the Winner page, and style the stall cards and tags to match the Makan Quest theme. Keep the code beginner-style with plain-English comments. Don't change the logic of blocks marked for other people. Run `npm run test:e2e` in client/ (see README for starting the emulators, API and seed). When a TODO is done, delete that TODO line but keep the START/END markers.

**JJyayy**
> Read ChopeLess/HANDOVER.md, the "JJyayy" section. Then find every line marked `[JJYAYY]` (`grep -rn "\[JJYAYY\]" server client/src`). The pre-order code in server/routes/orders.js calls my services/points.js (`awardPoints`, `spendPointsInTx`, `POINT_RULES`) and services/priorityQueue.js (`sortPriorityQueue`). Check that it uses them correctly. Then add `FASTPASS: 150` and `PREORDER_COLLECTED: 10` to `POINT_RULES`, and change orders.js to use them instead of `POINT_RULES.PRIORITY` and the plain `10`. Check that the board sort in HawkerOrdersView.vue matches `sortPriorityQueue`. Keep the code simple. Run the server tests (`npm test` in server/) and the e2e Fastpass test (`npx playwright test -g Fastpass` in client/).

**JananiJ**
> Read ChopeLess/HANDOVER.md, the "JananiJ" section. Then find the line marked `[JANANIJ]` in client/src/components/PointsHistory.vue. Pre-order points ("Collected a pre-order from ...", +10) and Fastpass spends ("Fastpass for a pre-order at ...", −150) now show in the Makan Points history. Make them look clear, for example with a label or an ⚡ icon for Fastpass, without breaking the existing labels. Keep the code beginner-style. Test it by logging in as alice (README demo accounts), buying a Fastpass on a pre-order, then opening the Points page.
