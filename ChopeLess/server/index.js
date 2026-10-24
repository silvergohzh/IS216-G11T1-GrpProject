
// Entry point for the API. Owner: M6.
// Everyone registers their router here.
// Trusted backend operations are handled by Express.

import 'dotenv/config'
import express from 'express'
import cors from 'cors'

import sessionsRouter from './routes/sessions.js'       // M1
import shortlistRouter from './routes/shortlist.js'     // M2
import placesRouter from './routes/places.js'           // M4
import gemsRouter from './routes/gems.js'               // M5
import pointsRouter from './routes/points.js'           // M1 - Makan Points

import crowdReportsRouter from './routes/crowdReports.js'
import crowdReportVerificationRouter from './routes/crowdReportVerification.js'

import { recoverSessionRewards } from './services/pointsRecovery.js'
import { recoverCrowdReportRewards } from './services/crowdReportRecovery.js'

const app = express()

app.use(cors({
  origin: (process.env.CLIENT_URL || 'http://localhost:5173').split(',')
}))

app.use(express.json({ limit: '5mb' }))

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    project: process.env.FIREBASE_PROJECT_ID,
    emulator: !!process.env.FIRESTORE_EMULATOR_HOST
  })
})

// ---------- API ROUTES ----------

// Voting Engine
app.use('/api/sessions', sessionsRouter)

// Other team modules
app.use('/api/shortlist', shortlistRouter)
app.use('/api/places', placesRouter)
app.use('/api/gems', gemsRouter)

// Makan Points
app.use('/api/points', pointsRouter)

// Crowd reports: submission and verification
app.use('/api/crowd-reports', crowdReportsRouter)
app.use('/api/crowd-reports', crowdReportVerificationRouter)

// ---------- ERROR HANDLER ----------

app.use((err, req, res, next) => {
  console.error(err)

  res.status(err.status || 500).json({
    error: err.message || 'Server error'
  })
})

// ---------- START SERVER ----------

const PORT = process.env.PORT || 3000

app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`)

  // Recover missing rewards from completed voting sessions.
  recoverSessionRewards().catch(error => {
    console.error(
      '[Makan Points] Startup recovery error:',
      error.message
    )
  })

  // Recover missing rewards from verified crowd reports.
  recoverCrowdReportRewards().catch(error => {
    console.error(
      '[Crowd Reports] Startup recovery failed:',
      error.message
    )
  })
})
