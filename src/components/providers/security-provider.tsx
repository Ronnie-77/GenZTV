'use client'

import { useEffect, useState, useCallback, useRef } from 'react'

/**
 * SecurityProvider — Comprehensive client-side protection
 *
 * Protections:
 * 1. Disables right-click context menu
 * 2. Blocks DevTools keyboard shortcuts (F12, Ctrl+Shift+I/J/C, Ctrl+U)
 * 3. Detects DevTools opening via window size diff & debugger trap
 * 4. Clears console to hide sensitive logs
 * 5. Disables text selection & drag on non-input elements
 * 6. Prevents iframe embedding (framebusting)
 * 7. Anti-debugging: periodic debugger traps (non-blocking)
 * 8. Prevents copy of sensitive content
 * 9. Blocks Ctrl+S (save page)
 * 10. Overrides console methods in production
 * 11. Detects React DevTools & other extensions
 * 12. MutationObserver to detect extension-injected elements
 */

// Threshold for detecting DevTools via window size difference
const DEVTOOLS_SIZE_THRESHOLD = 160

export function SecurityProvider({ children }: { children: React.ReactNode }) {
  const [devToolsOpen, setDevToolsOpen] = useState(false)
  const redirectCountRef = useRef(0)
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

  // --- 3. Detect DevTools via window size difference ---
  const detectDevTools = useCallback(() => {
    if (typeof window === 'undefined') return

    const widthDiff = window.outerWidth - window.innerWidth
    const heightDiff = window.outerHeight - window.innerHeight

    if (widthDiff > DEVTOOLS_SIZE_THRESHOLD || heightDiff > DEVTOOLS_SIZE_THRESHOLD) {
      setDevToolsOpen(true)
    } else {
      setDevToolsOpen(false)
    }
  }, [])

  // --- 4 & 7. Console clearing + anti-debugging ---
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

    // Anti-debugging: use Function constructor for a non-blocking debugger trap
    // This approach doesn't freeze the page — it only pauses if DevTools is open
    const debuggerTrapInterval = setInterval(() => {
      try {
        const start = performance.now()
        // Use Function constructor to create a debugger trap
        // This is harder to detect and bypass than a raw debugger statement
        // eslint-disable-next-line no-new-func
        new Function('debugger')()
        const end = performance.now()
        // If debugger is active, this will take > 100ms
        if (end - start > 100) {
          redirectCountRef.current += 1
          // Don't wipe the page — just show the security overlay
          setDevToolsOpen(true)
        }
      } catch {
        // Function constructor might be blocked by CSP — that's fine
      }
    }, 4000)

    // DevTools detection via console.log with getter (detects when console is open)
    const consoleDetectInterval = setInterval(() => {
      try {
        const element = new Image()
        Object.defineProperty(element, 'id', {
          get: function () {
            setDevToolsOpen(true)
            return ''
          }
        })
        console.log('%c', element)
        console.clear()
      } catch {}
    }, 3000)

    return () => {
      clearInterval(consoleClearInterval)
      clearInterval(debuggerTrapInterval)
      clearInterval(consoleDetectInterval)
      console.log = originalLog
      console.warn = originalWarn
      console.error = originalError
    }
  }, [])

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
        // Cross-origin iframe — can't break out, just hide content
        document.body.innerHTML = '<div style="position:fixed;inset:0;background:#0a0a0f;display:flex;align-items:center;justify-content:center;color:#fff;font-family:monospace;font-size:14px;"><div style="text-align:center;"><div style="font-size:48px;margin-bottom:16px;">🔒</div><p style="font-weight:bold;font-size:18px;">Access Denied</p><p style="color:#666;margin-top:8px;">This content cannot be embedded.</p></div></div>'
      }
    }
  }, [])

  // --- 9. Disable copy on non-input ---
  const handleCopy = useCallback((e: ClipboardEvent) => {
    const target = e.target as HTMLElement
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return
    e.preventDefault()
  }, [])

  // --- 11. Detect React DevTools and other extensions ---
  const detectExtensions = useCallback(() => {
    if (typeof window === 'undefined') return
    if (process.env.NODE_ENV === 'development') return

    // Check for React DevTools
    const hasReactDevTools = !!(window as unknown as Record<string, unknown>).__REACT_DEVTOOLS_GLOBAL_HOOK__
    if (hasReactDevTools) {
      // Don't immediately block — just flag it
      // Many developers have React DevTools installed for legitimate development
      // Only block if DevTools panel is actually open (detected by other methods)
    }
  }, [])

  // --- 12. MutationObserver to detect extension-injected elements ---
  const setupMutationObserver = useCallback(() => {
    if (typeof document === 'undefined') return
    if (process.env.NODE_ENV === 'development') return

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node instanceof HTMLElement) {
            // Detect common extension-injected elements
            const id = node.id?.toLowerCase() || ''
            const className = typeof node.className === 'string' ? node.className.toLowerCase() : ''

            // Block known extension toolbars/panels that might enable inspect mode
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
                // Remove the injected element
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

    // Extension detection
    detectExtensions()

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

    return () => {
      document.removeEventListener('contextmenu', handleContextMenu, true)
      document.removeEventListener('keydown', handleKeyDown, true)
      document.removeEventListener('dragstart', handleDragStart, true)
      document.removeEventListener('copy', handleCopy, true)
      window.removeEventListener('resize', detectDevTools)
      window.removeEventListener('beforeunload', handleBeforeUnload)
      document.removeEventListener('keyup', handleKeyUp)
      clearInterval(sizeCheckInterval)
      consoleCleanup()
      observerCleanup()
    }
  }, [handleContextMenu, handleKeyDown, handleDragStart, handleCopy, detectDevTools, setupConsoleProtection, setupFramebusting, detectExtensions, setupMutationObserver])

  // --- DevTools open overlay ---
  // When DevTools is detected, show a security screen (don't destroy the page)
  if (devToolsOpen && process.env.NODE_ENV === 'production') {
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: '#0a0a0f',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 999999,
          color: '#fff',
          fontFamily: 'monospace',
          fontSize: '14px',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔒</div>
          <p style={{ fontWeight: 'bold', fontSize: '18px' }}>Access Denied</p>
          <p style={{ color: '#666', marginTop: '8px' }}>Developer tools detected. Please close them to continue.</p>
          <button
            onClick={() => setDevToolsOpen(false)}
            style={{
              marginTop: '20px',
              padding: '8px 24px',
              background: '#333',
              color: '#fff',
              border: '1px solid #555',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '13px',
            }}
          >
            I&apos;ve closed DevTools
          </button>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
