// Entry point for the API. Owner: M6. Everyone registers their router here.
// Most data is read and written straight from the browser through Firestore.
// This server only handles the jobs that need to be trusted or need a secret key.
import 'dotenv/config'
import express from 'express'
import cors from 'cors'

import sessionsRouter from './routes/sessions.js'   // M1
import shortlistRouter from './routes/shortlist.js' // M2
import placesRouter from './routes/places.js'       // M4

const app = express()
app.use(cors({ origin: (process.env.CLIENT_URL || 'http://localhost:5173').split(',') }))
app.use(express.json({ limit: '5mb' }))

app.get('/api/health', (req, res) => {
  res.json({ ok: true, project: process.env.FIREBASE_PROJECT_ID, emulator: !!process.env.FIRESTORE_EMULATOR_HOST })
})

app.use('/api/sessions', sessionsRouter)
app.use('/api/shortlist', shortlistRouter)
app.use('/api/places', placesRouter)

// One place to turn thrown errors into JSON
app.use((err, req, res, next) => {
  console.error(err)
  res.status(err.status || 500).json({ error: err.message || 'Server error' })
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`))
