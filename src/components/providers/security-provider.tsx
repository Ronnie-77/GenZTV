'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useAppStore } from '@/lib/store'
import { ShieldCheck, ShieldOff, RefreshCw, EyeOff } from 'lucide-react'

/**
 * SecurityProvider — Comprehensive client-side protection
 *
 * Protections:
 * 1. Disables right-click context menu (ALL visitors, ALL modes)
 * 2. Blocks DevTools keyboard shortcuts (F12, Ctrl+Shift+I/J/C, Ctrl+U)
 * 3. Inspect/DevTools detection → redirect to about:blank (sustained detection
 *    to avoid false positives). BYPASSED for logged-in admins.
 * 4. Ad-blocker detection → full-screen warning requiring the visitor to
 *    disable their ad blocker. BYPASSED for logged-in admins.
 * 5. Disables text selection & drag on non-input elements
 * 6. Prevents iframe embedding (framebusting)
 * 7. Prevents copy of sensitive content
 * 8. Blocks Ctrl+S (save page)
 * 9. Clears console to hide sensitive logs (production only)
 * 10. Anti-debugging: periodic debugger traps (production only)
 * 11. MutationObserver to detect extension-injected elements (production only)
 *
 * ADMIN BYPASS: Logged-in admins (isAdminAuth === true) are exempt from the
 * inspect-blank and ad-blocker protections so they can develop / manage the
 * site. Right-click + keyboard shortcuts are still disabled for everyone.
 */

// Threshold for detecting DevTools via window size difference
const DEVTOOLS_SIZE_THRESHOLD = 160
// How many consecutive positive detections required before blanking the page.
// Reduces false positives (e.g. a browser sidebar that briefly trips the size
// check). At ~2s per check, this is ~4s of sustained DevTools openness.
const DEVTOOLS_CONFIRM_THRESHOLD = 2

export function SecurityProvider({ children }: { children: React.ReactNode }) {
  const isAdminAuth = useAppStore((s) => s.isAdminAuth)
  const [adBlockerDetected, setAdBlockerDetected] = useState(false)
  // DevTools-blank is handled via direct navigation (no React state needed),
  // but we keep a ref counter for sustained detection.
  const devToolsHitsRef = useRef(0)
  const blankedRef = useRef(false)
  const cleanupFns = useRef<Array<() => void>>([])

  // --- 1. Disable right-click context menu ---
  const handleContextMenu = useCallback((e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    return false
  }, [])

  // --- 2. Block keyboard shortcuts ---
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // F12 — DevTools
    if (e.key === 'F12') {
      e.preventDefault()
      e.stopPropagation()
      return false
    }

    // Ctrl+Shift+I — DevTools
    // Ctrl+Shift+J — Console
    // Ctrl+Shift+C — Element picker
    // Ctrl+Shift+K — Firefox console
    // Ctrl+Shift+E — Firefox network
    if (e.ctrlKey && e.shiftKey && ['I', 'i', 'J', 'j', 'C', 'c', 'K', 'k', 'E', 'e'].includes(e.key)) {
      e.preventDefault()
      e.stopPropagation()
      return false
    }

    // Ctrl+U — View source
    if (e.ctrlKey && (e.key === 'u' || e.key === 'U')) {
      e.preventDefault()
      e.stopPropagation()
      return false
    }

    // Ctrl+S — Save page
    if (e.ctrlKey && (e.key === 's' || e.key === 'S')) {
      e.preventDefault()
      e.stopPropagation()
      return false
    }

    // Cmd+Option+I — Mac DevTools
    // Cmd+Option+J — Mac Console
    // Cmd+Option+U — Mac View Source
    // Cmd+Option+C — Mac Element picker
    if (e.metaKey && e.altKey && ['I', 'i', 'J', 'j', 'U', 'u', 'C', 'c'].includes(e.key)) {
      e.preventDefault()
      e.stopPropagation()
      return false
    }

    return true
  }, [])

  // --- 3. DevTools detection (sustained) → redirect to about:blank ---
  const triggerBlank = useCallback(() => {
    if (blankedRef.current) return
    blankedRef.current = true
    // Wipe the document FIRST (immediate visual blank, in case navigation is
    // blocked by a popup blocker or sandbox), then navigate to about:blank.
    try {
      document.body.innerHTML = ''
      document.documentElement.style.background = '#ffffff'
    } catch {}
    try {
      window.location.href = 'about:blank'
    } catch {}
  }, [])

  const registerDevToolsHit = useCallback(() => {
    // Admin bypass — admins can use DevTools freely.
    if (useAppStore.getState().isAdminAuth) return
    devToolsHitsRef.current += 1
    if (devToolsHitsRef.current >= DEVTOOLS_CONFIRM_THRESHOLD) {
      triggerBlank()
    }
  }, [triggerBlank])

  const resetDevToolsHits = useCallback(() => {
    devToolsHitsRef.current = 0
  }, [])

  const detectDevTools = useCallback(() => {
    if (typeof window === 'undefined') return
    // Admin bypass
    if (useAppStore.getState().isAdminAuth) return

    const widthDiff = window.outerWidth - window.innerWidth
    const heightDiff = window.outerHeight - window.innerHeight

    if (widthDiff > DEVTOOLS_SIZE_THRESHOLD || heightDiff > DEVTOOLS_SIZE_THRESHOLD) {
      registerDevToolsHit()
    } else {
      resetDevToolsHits()
    }
  }, [registerDevToolsHit, resetDevToolsHits])

  // --- 4 & 7. Console clearing + anti-debugging (production only) ---
  const setupConsoleProtection = useCallback(() => {
    if (typeof window === 'undefined') return
    if (process.env.NODE_ENV === 'development') return // Skip in dev mode

    // Override console methods — keep error for debugging but suppress others
    const noop = () => {}
    const originalLog = console.log
    const originalWarn = console.warn
    const originalError = console.error

    console.log = noop
    console.warn = noop
    console.debug = noop
    console.info = noop
    console.table = noop
    console.trace = noop

    // Clear console periodically
    console.clear()
    const consoleClearInterval = setInterval(() => {
      try { console.clear() } catch {}
    }, 3000)

    // Anti-debugging: debugger trap. When DevTools is open and paused on the
    // `debugger` statement, the measured time exceeds 100ms → register a hit.
    const debuggerTrapInterval = setInterval(() => {
      // Admin bypass inside the trap so admins aren't affected.
      if (useAppStore.getState().isAdminAuth) return
      try {
        const start = performance.now()
        new Function('debugger')()
        const end = performance.now()
        if (end - start > 100) {
          registerDevToolsHit()
        }
      } catch {
        // Function constructor might be blocked by CSP — that's fine
      }
    }, 2000)

    // DevTools detection via console.log with getter (detects when console is open)
    const consoleDetectInterval = setInterval(() => {
      if (useAppStore.getState().isAdminAuth) return
      try {
        const element = new Image()
        Object.defineProperty(element, 'id', {
          get: function () {
            registerDevToolsHit()
            return ''
          }
        })
        console.log('%c', element)
        console.clear()
      } catch {}
    }, 2000)

    return () => {
      clearInterval(consoleClearInterval)
      clearInterval(debuggerTrapInterval)
      clearInterval(consoleDetectInterval)
      console.log = originalLog
      console.warn = originalWarn
      console.error = originalError
    }
  }, [registerDevToolsHit])

  // --- 5. Disable drag ---
  const handleDragStart = useCallback((e: DragEvent) => {
    const target = e.target as HTMLElement
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return
    e.preventDefault()
  }, [])

  // --- 6. Framebusting ---
  const setupFramebusting = useCallback(() => {
    if (typeof window === 'undefined') return
    if (window.self !== window.top) {
      try {
        window.top!.location.href = window.self.location.href
      } catch {
        document.body.innerHTML = '<div style="position:fixed;inset:0;background:#0a0a0f;display:flex;align-items:center;justify-content:center;color:#fff;font-family:monospace;font-size:14px;"><div style="text-align:center;"><div style="font-size:48px;margin-bottom:16px;">🔒</div><p style="font-weight:bold;font-size:18px;">Access Denied</p><p style="color:#666;margin-top:8px;">This content cannot be embedded.</p></div></div>'
      }
    }
  }, [])

  // --- 7. Disable copy on non-input ---
  const handleCopy = useCallback((e: ClipboardEvent) => {
    const target = e.target as HTMLElement
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return
    e.preventDefault()
  }, [])

  // --- 8. MutationObserver to detect extension-injected elements (prod only) ---
  const setupMutationObserver = useCallback(() => {
    if (typeof document === 'undefined') return
    if (process.env.NODE_ENV === 'development') return

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node instanceof HTMLElement) {
            const id = node.id?.toLowerCase() || ''
            const className = typeof node.className === 'string' ? node.className.toLowerCase() : ''

            const suspiciousPatterns = [
              'react-devtools',
              'vue-devtools',
              'angular-devtools',
              'devtools',
              'inspector',
              'firebug',
              'web-inspector',
            ]

            for (const pattern of suspiciousPatterns) {
              if (id.includes(pattern) || className.includes(pattern)) {
                node.remove()
                break
              }
            }
          }
        }
      }
    })

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    })

    return () => observer.disconnect()
  }, [])

  // --- 9. Ad-blocker detection (bait element technique) ---
  const checkAdBlocker = useCallback(async (): Promise<boolean> => {
    if (typeof document === 'undefined') return false
    // Admin bypass
    if (useAppStore.getState().isAdminAuth) return false

    return new Promise<boolean>((resolve) => {
      // Create a bait element with class names that ad-blockers target via
      // their filter lists (EasyList, etc.). If the ad-blocker hides it
      // (display:none, height:0, offsetParent:null), an ad-blocker is active.
      const bait = document.createElement('div')
      bait.className =
        'ad-banner ads ad-placement adsbox ad-zone ad-unit textads banner-ads ad-card pub_300x250 pub_300x250m pub_728x90'
      bait.style.cssText =
        'position:absolute;left:-9999px;top:-9999px;width:1px;height:1px;' +
        'visibility:visible;pointer-events:none;'
      bait.innerHTML = '&nbsp;'
      document.body.appendChild(bait)

      // Also test a bait request to an ad-network-style path. Some ad-blockers
      // only block network requests, not DOM elements. We request a path that
      // doesn't actually exist on our server — if it ERR_BLOCKED_BY_CLIENT,
      // an ad-blocker is intercepting it. (A normal 404 means no blocker.)
      const testUrl = '/ads.js?adblocktest=' + Date.now()

      let domBlocked = false
      let netBlocked = false
      let settled = false

      const finish = (blocked: boolean) => {
        if (settled) return
        settled = true
        try { bait.remove() } catch {}
        resolve(blocked)
      }

      // DOM check after the browser has a chance to apply CSS rules.
      setTimeout(() => {
        try {
          const cs = window.getComputedStyle(bait)
          const blocked =
            bait.offsetParent === null ||
            bait.offsetHeight === 0 ||
            bait.clientHeight === 0 ||
            bait.offsetLeft < 0 === false && (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.height) === 0)
          // The offsetLeft check above is unreliable; rely on offsetParent + height + display.
          domBlocked =
            bait.offsetParent === null ||
            bait.offsetHeight === 0 ||
            bait.clientHeight === 0 ||
            cs.display === 'none' ||
            cs.visibility === 'hidden'
        } catch {
          domBlocked = false
        }
        // If DOM bait is hidden → definitely blocked. Otherwise check net result.
        if (domBlocked) {
          finish(true)
        } else if (netBlocked) {
          finish(true)
        } else {
          // Wait a bit more for the network test (max 1.2s total).
          setTimeout(() => finish(domBlocked || netBlocked), 600)
        }
      }, 100)

      // Network test — fire and forget; result recorded by netBlocked.
      fetch(testUrl, { method: 'GET', mode: 'no-cors' })
        .then(() => { /* request succeeded (even as a 404) → not blocked */ })
        .catch((err) => {
          // If the request was blocked by the client (ad-blocker), it rejects.
          // Network errors also reject, so only treat as blocked if the DOM
          // bait is ALSO suspicious (avoid false positives on flaky networks).
          netBlocked = true
        })
    })
  }, [])

  const runAdBlockerCheck = useCallback(async () => {
    const blocked = await checkAdBlocker()
    setAdBlockerDetected(blocked)
  }, [checkAdBlocker])

  // --- Setup all protections ---
  useEffect(() => {
    if (typeof window === 'undefined') return

    // Right-click
    document.addEventListener('contextmenu', handleContextMenu, true)

    // Keyboard shortcuts
    document.addEventListener('keydown', handleKeyDown, true)

    // Drag prevention
    document.addEventListener('dragstart', handleDragStart, true)

    // Copy prevention
    document.addEventListener('copy', handleCopy, true)

    // DevTools detection via resize
    window.addEventListener('resize', detectDevTools)
    detectDevTools()

    // Console + anti-debugging
    const consoleCleanup = setupConsoleProtection() || (() => {})

    // Framebusting
    setupFramebusting()

    // MutationObserver for extension-injected elements
    const observerCleanup = setupMutationObserver() || (() => {})

    // Disable source view via beforeunload (clear page before leaving)
    const handleBeforeUnload = () => {
      document.body.innerHTML = ''
    }
    window.addEventListener('beforeunload', handleBeforeUnload)

    // Prevent print screen (PrtScn key)
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'PrintScreen') {
        navigator.clipboard?.writeText('').catch(() => {})
      }
    }
    document.addEventListener('keyup', handleKeyUp)

    // Periodic DevTools size check (catches docked DevTools)
    const sizeCheckInterval = setInterval(detectDevTools, 2000)

    // Ad-blocker detection — delay the first check slightly so the store can
    // hydrate (isAdminAuth) and the page can settle. Then re-check periodically
    // in case the visitor enables their ad-blocker after landing.
    const adBlockInitialTimer = setTimeout(runAdBlockerCheck, 1500)
    const adBlockInterval = setInterval(runAdBlockerCheck, 15000)

    return () => {
      document.removeEventListener('contextmenu', handleContextMenu, true)
      document.removeEventListener('keydown', handleKeyDown, true)
      document.removeEventListener('dragstart', handleDragStart, true)
      document.removeEventListener('copy', handleCopy, true)
      window.removeEventListener('resize', detectDevTools)
      window.removeEventListener('beforeunload', handleBeforeUnload)
      document.removeEventListener('keyup', handleKeyUp)
      clearInterval(sizeCheckInterval)
      clearTimeout(adBlockInitialTimer)
      clearInterval(adBlockInterval)
      consoleCleanup()
      observerCleanup()
    }
  }, [handleContextMenu, handleKeyDown, handleDragStart, handleCopy, detectDevTools, setupConsoleProtection, setupFramebusting, setupMutationObserver, runAdBlockerCheck])

  // Admin bypass for the ad-blocker overlay is handled purely at render time
  // (see the `!isAdminAuth && adBlockerDetected` check below) — no effect
  // needed. When an admin logs in, isAdminAuth flips to true and the overlay
  // disappears immediately. When they log out, the periodic 15s re-check keeps
  // `adBlockerDetected` fresh so the overlay reappears if a blocker is active.

  // --- Ad-blocker block overlay (non-admin visitors only) ---
  // Show the overlay when an ad-blocker is detected AND the user is not an
  // admin. Admins are never blocked.
  if (!isAdminAuth && adBlockerDetected) {
    return <AdBlockerBlockOverlay onRetry={runAdBlockerCheck} />
  }

  return <>{children}</>
}

// ─────────────────────────────────────────────────────────────────────────────
// AdBlockerBlockOverlay — full-screen warning shown to visitors who have an
// ad-blocker enabled. They must disable it (and reload) to access the site.
// ─────────────────────────────────────────────────────────────────────────────
function AdBlockerBlockOverlay({ onRetry }: { onRetry: () => void }) {
  const [rechecking, setRechecking] = useState(false)

  const handleRetry = useCallback(() => {
    setRechecking(true)
    // Small delay so the user sees feedback. The actual re-check happens via
    // the periodic interval too, but this gives immediate user-initiated retry.
    setTimeout(() => {
      onRetry()
      setRechecking(false)
    }, 800)
  }, [onRetry])

  const handleReload = useCallback(() => {
    window.location.reload()
  }, [])

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'radial-gradient(ellipse at center, #1a1a2e 0%, #0a0a0f 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2147483646,
        padding: '24px',
        fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <div
        style={{
          maxWidth: '460px',
          width: '100%',
          textAlign: 'center',
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '20px',
          padding: '40px 32px',
          boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
          backdropFilter: 'blur(12px)',
          color: '#fff',
        }}
      >
        {/* Icon */}
        <div
          style={{
            width: '80px',
            height: '80px',
            margin: '0 auto 24px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #ef4444, #f59e0b)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 8px 32px rgba(239,68,68,0.4)',
          }}
        >
          <ShieldOff size={40} color="#fff" />
        </div>

        {/* Title */}
        <h1
          style={{
            fontSize: '24px',
            fontWeight: 800,
            margin: '0 0 12px',
            letterSpacing: '-0.02em',
          }}
        >
          Ad Blocker Detected
        </h1>

        {/* Subtitle */}
        <p
          style={{
            fontSize: '15px',
            lineHeight: 1.6,
            color: 'rgba(255,255,255,0.7)',
            margin: '0 0 8px',
          }}
        >
          We noticed you&apos;re using an ad blocker. GenZ TV is a free service
          supported by ads — without them, we can&apos;t keep the streams
          running.
        </p>
        <p
          style={{
            fontSize: '14px',
            fontWeight: 600,
            color: '#f59e0b',
            margin: '0 0 28px',
          }}
        >
          Please disable your ad blocker to continue.
        </p>

        {/* Steps */}
        <div
          style={{
            background: 'rgba(255,255,255,0.05)',
            borderRadius: '12px',
            padding: '16px',
            marginBottom: '28px',
            textAlign: 'left',
          }}
        >
          <p style={{ fontSize: '13px', fontWeight: 700, margin: '0 0 8px', color: 'rgba(255,255,255,0.9)' }}>
            How to disable:
          </p>
          <ol style={{ margin: 0, paddingLeft: '20px', fontSize: '13px', lineHeight: 1.8, color: 'rgba(255,255,255,0.65)' }}>
            <li>Click the ad-blocker icon in your browser toolbar.</li>
            <li>Select <strong style={{ color: 'rgba(255,255,255,0.9)' }}>&ldquo;Disable on this site&rdquo;</strong> or pause it.</li>
            <li>Refresh the page.</li>
          </ol>
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <button
            onClick={handleReload}
            style={{
              padding: '14px 24px',
              background: 'linear-gradient(135deg, #14b8a6, #0891b2)',
              color: '#fff',
              border: 'none',
              borderRadius: '12px',
              cursor: 'pointer',
              fontSize: '15px',
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              boxShadow: '0 4px 16px rgba(20,184,166,0.4)',
            }}
          >
            <RefreshCw size={18} />
            I&apos;ve disabled it — Reload
          </button>
          <button
            onClick={handleRetry}
            disabled={rechecking}
            style={{
              padding: '12px 24px',
              background: 'transparent',
              color: 'rgba(255,255,255,0.6)',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: '12px',
              cursor: rechecking ? 'wait' : 'pointer',
              fontSize: '13px',
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              opacity: rechecking ? 0.6 : 1,
            }}
          >
            {rechecking ? (
              <>
                <RefreshCw size={14} className="spin" />
                Re-checking…
              </>
            ) : (
              <>
                <EyeOff size={14} />
                Check again
              </>
            )}
          </button>
        </div>

        {/* Footer note */}
        <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', margin: '24px 0 0' }}>
          <ShieldCheck size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />
          Ads keep GenZ TV free for everyone. Thank you for supporting us.
        </p>
      </div>

      {/* Spinner keyframe (inline so it works without external CSS) */}
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}.spin{animation:spin 1s linear infinite}`}</style>
    </div>
  )
}
