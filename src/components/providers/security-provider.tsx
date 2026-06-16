'use client'

import { useEffect, useState, useCallback } from 'react'

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
 * 7. Anti-debugging: periodic debugger traps
 * 8. Prevents copy of sensitive content
 * 9. Blocks Ctrl+S (save page)
 * 10. Overrides console methods in production
 */

// Threshold for detecting DevTools via window size difference
const DEVTOOLS_SIZE_THRESHOLD = 160

export function SecurityProvider({ children }: { children: React.ReactNode }) {
  const [devToolsOpen, setDevToolsOpen] = useState(false)

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
    if (e.ctrlKey && e.shiftKey && ['I', 'i', 'J', 'j', 'C', 'c'].includes(e.key)) {
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

    // Ctrl+Shift+K — Firefox console
    if (e.ctrlKey && e.shiftKey && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault()
      e.stopPropagation()
      return false
    }

    // Ctrl+Shift+E — Firefox network
    if (e.ctrlKey && e.shiftKey && (e.key === 'e' || e.key === 'E')) {
      e.preventDefault()
      e.stopPropagation()
      return false
    }

    // Cmd+Option+I — Mac DevTools
    // Cmd+Option+J — Mac Console
    // Cmd+Option+U — Mac View Source
    if (e.metaKey && e.altKey && ['I', 'i', 'J', 'j', 'U', 'u'].includes(e.key)) {
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

    // Override console methods
    const noop = () => {}
    const originalLog = console.log
    const originalWarn = console.warn
    const originalError = console.error

    // Keep error for debugging but clear periodically
    console.log = noop
    console.warn = noop
    console.debug = noop
    console.info = noop
    console.table = noop
    console.trace = noop

    // Clear console immediately and periodically
    console.clear()
    const consoleClearInterval = setInterval(() => {
      console.clear()
    }, 2000)

    // Anti-debugging: debugger trap
    const debuggerTrapInterval = setInterval(() => {
      const start = performance.now()
      debugger // Anti-debugging trap — will pause if DevTools is open
      const end = performance.now()
      // If debugger is active, this will take > 100ms
      if (end - start > 100) {
        // DevTools is open with debugger paused
        document.body.innerHTML = ''
        window.location.reload()
      }
    }, 3000)

    return () => {
      clearInterval(consoleClearInterval)
      clearInterval(debuggerTrapInterval)
      console.log = originalLog
      console.warn = originalWarn
      console.error = originalError
    }
  }, [])

  // --- 5. Disable drag ---
  const handleDragStart = useCallback((e: DragEvent) => {
    const target = e.target as HTMLElement
    // Allow drag on inputs
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return
    e.preventDefault()
  }, [])

  // --- 6. Framebusting ---
  const setupFramebusting = useCallback(() => {
    if (typeof window === 'undefined') return
    if (window.self !== window.top) {
      // If we're in an iframe, break out
      window.top!.location.href = window.self.location.href
    }
  }, [])

  // --- 9. Disable copy on non-input ---
  const handleCopy = useCallback((e: ClipboardEvent) => {
    const target = e.target as HTMLElement
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return
    e.preventDefault()
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
    detectDevTools() // eslint-disable-line react-hooks/set-state-in-effect

    // Console + anti-debugging
    const cleanup = setupConsoleProtection() || (() => {})

    // Framebusting
    setupFramebusting()

    // Disable source view via beforeunload (clear page before leaving)
    const handleBeforeUnload = () => {
      document.body.innerHTML = ''
    }
    window.addEventListener('beforeunload', handleBeforeUnload)

    // Prevent print screen (PrtScn key)
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'PrintScreen') {
        // Clear clipboard
        navigator.clipboard?.writeText('').catch(() => {})
      }
    }
    document.addEventListener('keyup', handleKeyUp)

    return () => {
      document.removeEventListener('contextmenu', handleContextMenu, true)
      document.removeEventListener('keydown', handleKeyDown, true)
      document.removeEventListener('dragstart', handleDragStart, true)
      document.removeEventListener('copy', handleCopy, true)
      window.removeEventListener('resize', detectDevTools)
      window.removeEventListener('beforeunload', handleBeforeUnload)
      document.removeEventListener('keyup', handleKeyUp)
      cleanup()
    }
  }, [handleContextMenu, handleKeyDown, handleDragStart, handleCopy, detectDevTools, setupConsoleProtection, setupFramebusting])

  // --- DevTools open overlay ---
  // When DevTools is detected, show a blank/security screen
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
          <p style={{ color: '#666', marginTop: '8px' }}>Developer tools detected.</p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
