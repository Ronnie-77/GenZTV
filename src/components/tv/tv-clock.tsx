'use client'

import { useEffect, useState } from 'react'

/** Live clock for the TV top bar — shows time + weekday. */
export function TVClock() {
  // Initialize lazily so SSR renders null and the client picks up the real time
  // on first render (avoids hydration mismatch + setState-in-effect).
  const [now, setNow] = useState<Date | null>(() => {
    if (typeof window === 'undefined') return null
    return new Date()
  })

  useEffect(() => {
    // Update every 30s
    const id = window.setInterval(() => setNow(new Date()), 1000 * 30)
    return () => window.clearInterval(id)
  }, [])

  if (!now) {
    return <div className="tv-topbar-clock" aria-hidden="true" />
  }

  const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const date = now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })

  return (
    <div className="tv-topbar-clock" aria-label={`Current time ${time}`}>
      <span className="tv-clock-time">{time}</span>
      <span className="tv-clock-date">{date}</span>
    </div>
  )
}
