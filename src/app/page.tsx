'use client'

import { useEffect, useRef, useState } from 'react'

// Dynamic import to avoid compiling the entire app during initial page load
// This reduces memory usage during Turbopack/webpack compilation.
// Includes retry logic (3 attempts) + a timeout fallback so that older
// browsers (e.g. Smart TVs) that fail to fetch/parse the chunk don't get
// stuck on the "Loading..." screen forever.
const LOAD_TIMEOUT_MS = 20000

async function loadAppShellWithRetry(retries = 3): Promise<React.ComponentType> {
  let lastError: unknown = null
  for (let i = 0; i < retries; i++) {
    try {
      const mod = await import('@/components/layout/app-shell')
      return mod.AppShell
    } catch (err) {
      lastError = err
      // Exponential backoff between retries
      if (i < retries - 1) {
        await new Promise((r) => setTimeout(r, 1000 * (i + 1)))
      }
    }
  }
  throw lastError
}

export default function Home() {
  const [AppShell, setAppShell] = useState<React.ComponentType | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [timedOut, setTimedOut] = useState(false)
  // Ref tracks the *current* loaded state so the setTimeout callback
  // reads the live value when it fires (avoids stale-closure bug where
  // the captured `AppShell` was always null and triggered a false timeout
  // 20s after a successful load).
  const loadedRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    // Timeout safety net: if the import hasn't resolved in LOAD_TIMEOUT_MS,
    // surface a helpful error instead of leaving the user stuck on "Loading..."
    const timeoutId = setTimeout(() => {
      if (!cancelled && !loadedRef.current) {
        setTimedOut(true)
      }
    }, LOAD_TIMEOUT_MS)

    loadAppShellWithRetry(3)
      .then((Comp) => {
        if (!cancelled) {
          loadedRef.current = true
          setAppShell(() => Comp)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error('Failed to load AppShell:', err)
          setError('Failed to load app')
        }
      })

    return () => {
      cancelled = true
      clearTimeout(timeoutId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (error || timedOut) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background text-foreground p-4">
        <div className="text-center max-w-md">
          <div className="text-5xl mb-4">📺</div>
          <p className="text-lg font-semibold mb-2">
            {timedOut ? 'Taking too long to load' : 'Something went wrong'}
          </p>
          <p className="text-sm text-muted-foreground mb-4">
            {timedOut
              ? 'The app could not load on this browser. This often happens on older Smart TV browsers. Please try refreshing, or use a phone or computer for the best experience.'
              : error}
          </p>
          <div className="flex flex-col gap-2 items-center">
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium"
            >
              Retry
            </button>
            <a
              href="/"
              className="text-xs text-muted-foreground underline mt-2"
              onClick={(e) => {
                e.preventDefault()
                // Hard reload bypassing cache
                window.location.href = '/'
              }}
            >
              Hard refresh
            </a>
          </div>
        </div>
      </div>
    )
  }

  if (!AppShell) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  return <AppShell />
}
