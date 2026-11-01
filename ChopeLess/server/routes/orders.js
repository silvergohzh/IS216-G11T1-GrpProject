
 // CREATE: POST /api/orders   body: { placeId, sessionCode (optional) }
 // Starts a new, empty cart for one stall. You are the owner (the "group leader") and the first member.
 // If you already have an open cart at this stall, you get that one back instead of a second cart.
 //
 // From a Makan Session: send its sessionCode, and EVERYONE in the session is added to the order
 // straight away (no join code needed). The stall must be the session's winner, or a stall inside it.
 router.post('/', async (req, res, next) => {
   try {
     const place = await db.collection('places').doc(req.body.placeId || 'none').get()
     if (!place.exists) throw httpError(400, 'Choose a stall to order from')
     if (!place.data().menu || place.data().menu.length === 0) {
       throw httpError(400, 'This place has no menu. If it is a hawker centre, choose one of its stalls.')
     }

     // [JANANIJ] START: Match existing carts to the correct Makan Session
     // Prevent an unrelated cart from bypassing re-vote checks.
     const requestedSessionCode = req.body.sessionCode
       ? String(req.body.sessionCode).trim().toUpperCase()
       : null

     const open = await orders
       .where('ownerUid', '==', req.uid)
       .where('placeId', '==', place.id)
       .where('status', '==', 'cart')
       .get()

     const existingCart = open.docs.find(doc =>
       (doc.data().sessionCode || null) === requestedSessionCode
     )
     // [JANANIJ] END

     // Who is in the order: just me, or my whole Makan Session group
     const myName = await getName(req.uid)
     let members = [{ uid: req.uid, name: myName }]
     let sessionCode = null

     // [JANANIJ] START: Lock group ordering against QueueLess re-voting
     // Read and update the same session document used by the re-vote route.
     // Firestore transactions prevent ordering and re-voting from starting together.
     if (requestedSessionCode) {
       const sessionRef = db.collection('sessions').doc(requestedSessionCode)
       const orderRef = orders.doc()
       const joinCode = await makeJoinCode()

       const result = await db.runTransaction(async tx => {
         const session = await tx.get(sessionRef)
         if (!session.exists) throw httpError(404, 'Makan Session not found')

         const s = session.data()
         if (!s.members?.[req.uid]) throw httpError(403, 'You are not in this Makan Session')
         if (!s.winner) throw httpError(409, 'This Makan Session has no winner yet')

         // [JANANIJ] START: Block ordering while voting or re-voting
         if (s.status !== 'done') {
           throw httpError(409, 'Please wait until group voting is complete')
         }
         // [JANANIJ] END

         // You can only pre-order from the place the group picked (or a stall inside it)
         const isWinner = place.id === s.winner.id
         const isInsideWinner = place.data().parentId === s.winner.id
         if (!isWinner && !isInsideWinner) throw httpError(400, 'Your group picked a different place')

         // [JANANIJ] START: Preserve existing cart reuse
         // A cart already created for this session can still be reopened.
         if (existingCart) {
           return { id: existingCart.id, created: false }
         }
         // [JANANIJ] END

         // Me first (I'm the group leader), then everyone else in the session
         for (const uid in s.members) {
           if (uid !== req.uid) members.push({ uid: uid, name: s.members[uid].name })
         }
         sessionCode = requestedSessionCode

         const order = {
           placeId: place.id,
           placeName: place.data().name,
           ownerUid: req.uid,
           joinCode: joinCode,
           members: members,
           memberUids: members.map(m => m.uid),
           sessionCode: sessionCode,
           // [NAWAZ] the Fastpass flag on every new order
           priority: false,   // true after the group leader buys a Fastpass
           items: [],
           total: 0,
           status: 'cart',
           createdAt: FieldValue.serverTimestamp()
         }

         // [JANANIJ] START: Mark ordering as started atomically
         // The re-vote backend must reject sessions with orderingStarted=true.
         // Multiple stalls can still have their own carts.
         tx.update(sessionRef, {
           orderingStarted: true,
           orderingStartedAt: s.orderingStartedAt || Date.now()
         })
         tx.create(orderRef, order)
         // [JANANIJ] END

         return { id: orderRef.id, created: true }
       })

       return res.status(result.created ? 201 : 200).json({ id: result.id })
     }
     // [JANANIJ] END

     // [JANANIJ] START: Keep standalone cart reuse separate from group carts
     if (existingCart) return res.json({ id: existingCart.id })
     // [JANANIJ] END

     const order = {
       placeId: place.id,
       placeName: place.data().name,
       ownerUid: req.uid,
       joinCode: await makeJoinCode(),
       members: members,
       memberUids: members.map(m => m.uid),
       sessionCode: sessionCode,
       // [NAWAZ] the Fastpass flag on every new order
       priority: false,   // true after the group leader buys a Fastpass
       items: [],
       total: 0,
       status: 'cart',
       createdAt: FieldValue.serverTimestamp()
     }
     const ref = await orders.add(order)
     res.status(201).json({ id: ref.id })
   } catch (err) {
     next(err)
   }
 })
