// Entry point for the API. Owner: M6. Everyone registers their router here.
// Most data is read and written straight from the browser through Firestore.
// This server only handles the jobs that need to be trusted or need a secret key.
import 'dotenv/config'
import express from 'express'
import cors from 'cors'

import sessionsRouter from './routes/sessions.js'   // M1
import shortlistRouter from './routes/shortlist.js' // M2
import placesRouter from './routes/places.js'       // M4
import gemsRouter from './routes/gems.js'          // M5
import ordersRouter from './routes/orders.js'      // M6
import paymentsRouter from './routes/payments.js'  // M6
import adminRouter from './routes/admin.js'        // M6

const app = express()
app.use(cors({ origin: (process.env.CLIENT_URL || 'http://localhost:5173').split(',') }))

// The Stripe webhook must come BEFORE express.json(): it needs the raw body to check Stripe's signature
app.use('/api/payments', express.raw({ type: 'application/json' }), paymentsRouter)

app.use(express.json({ limit: '5mb' }))

app.get('/api/health', (req, res) => {
  res.json({ ok: true, project: process.env.FIREBASE_PROJECT_ID, emulator: !!process.env.FIRESTORE_EMULATOR_HOST })
})

app.use('/api/sessions', sessionsRouter)
app.use('/api/shortlist', shortlistRouter)
app.use('/api/places', placesRouter)
app.use('/api/gems', gemsRouter)
app.use('/api/orders', ordersRouter)
app.use('/api/admin', adminRouter)

// One place to turn thrown errors into JSON
app.use((err, req, res, next) => {
  console.error(err)
  res.status(err.status || 500).json({ error: err.message || 'Server error' })
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`))
