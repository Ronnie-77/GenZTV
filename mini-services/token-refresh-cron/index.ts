/**
 * GenZTV — Proactive Token Refresh Daemon
 * ========================================
 *
 * Runs as a separate bun process. Every 30 minutes it calls the Next.js app's
 * /api/channels/refresh-expired endpoint with the CRON_REFRESH_SECRET, which
 * re-extracts fresh m3u8 URLs for all channels whose tokens are expiring soon
 * (within 1 hour) or have already expired.
 *
 * Why a separate process?
 *   - Next.js serverless functions don't have persistent intervals. Even in
 *     long-running dev/prod, a `setInterval` inside a route handler would be
 *     killed on hot-reload. A dedicated bun process is the simplest reliable
 *     way to keep a periodic task running in this sandbox.
 *
 * Port: NONE — this service doesn't expose an HTTP server. It only makes
 *        outbound fetch calls to the Next.js app (port 3000 internally).
 *
 * Env:
 *   - GENZTV_BASE_URL  — base URL of the Next.js app (default http://localhost:3000)
 *   - CRON_REFRESH_SECRET — must match the secret in the Next.js .env
 *   - REFRESH_INTERVAL_MS — override the 30-minute default
 */

const BASE_URL = process.env.GENZTV_BASE_URL || 'http://localhost:3000'
const SECRET = process.env.CRON_REFRESH_SECRET || ''
const INTERVAL_MS = Number(process.env.REFRESH_INTERVAL_MS) || 30 * 60 * 1000 // 30 min

if (!SECRET) {
  console.error('[refresh-cron] FATAL: CRON_REFRESH_SECRET is not set. Exiting.')
  process.exit(1)
}

console.log(`[refresh-cron] Started — will hit ${BASE_URL}/api/channels/refresh-expired every ${INTERVAL_MS / 60000} min`)

let cycle = 0

async function runOnce(): Promise<void> {
  cycle += 1
  const startedAt = new Date().toISOString()
  console.log(`[refresh-cron] #${cycle} cycle start @ ${startedAt}`)

  try {
    const res = await fetch(`${BASE_URL}/api/channels/refresh-expired`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Cron-Secret': SECRET,
      },
      body: JSON.stringify({ forceAll: false }),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      console.error(`[refresh-cron] #${cycle} HTTP ${res.status}: ${text.slice(0, 300)}`)
      return
    }

    const data = await res.json() as {
      total?: number
      refreshed?: number
      failed?: number
    }
    console.log(
      `[refresh-cron] #${cycle} ✅ checked=${data.total ?? 0} refreshed=${data.refreshed ?? 0} failed=${data.failed ?? 0}`
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[refresh-cron] #${cycle} error: ${msg}`)
  }
}

// Run once on startup (after a short delay to let the Next.js app boot), then
// on the interval.
setTimeout(() => {
  runOnce()
  setInterval(runOnce, INTERVAL_MS)
}, 15_000) // 15s startup grace period

// Keep the process alive
console.log('[refresh-cron] Daemon running. Press Ctrl+C to stop.')
