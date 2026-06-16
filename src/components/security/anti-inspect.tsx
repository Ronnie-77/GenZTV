'use client'

import { useEffect } from 'react'

/**
 * Anti-DevTools / Anti-Inspect Security Component
 *
 * Makes it significantly harder (but not impossible) to inspect the website:
 * 1. Blocks keyboard shortcuts (F12, Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+U)
 * 2. Blocks right-click context menu
 * 3. DevTools open detection via window size
 * 4. Console clearing + warning
 * 5. Disables image dragging
 *
 * Note: No client-side protection is 100% bypass-proof.
 * The goal is to raise the bar high enough that casual users can't easily inspect.
 */
export function AntiInspect() {
  useEffect(() => {
    // Only run in production
    if (process.env.NODE_ENV !== 'production') return

    // 1. Block keyboard shortcuts
    const handleKeyDown = (e: KeyboardEvent) => {
      // F12
      if (e.key === 'F12') {
        e.preventDefault()
        e.stopPropagation()
        return false
      }
      // Ctrl+Shift+I/J/C (Inspect/Console/Element selector)
      if (e.ctrlKey && e.shiftKey && ['I', 'J', 'C', 'i', 'j', 'c'].includes(e.key)) {
        e.preventDefault()
        e.stopPropagation()
        return false
      }
      // Ctrl+U (View source)
      if (e.ctrlKey && (e.key === 'u' || e.key === 'U')) {
        e.preventDefault()
        e.stopPropagation()
        return false
      }
      // Cmd+Option+I/J/C (Mac)
      if (e.metaKey && e.altKey && ['I', 'J', 'C', 'i', 'j', 'c'].includes(e.key)) {
        e.preventDefault()
        e.stopPropagation()
        return false
      }
    }

    // 2. Block right-click context menu
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      return false
    }

    // 3. DevTools detection via window size difference
    let devtoolsOpen = false
    const detectDevTools = () => {
      const threshold = 160
      if (
        window.outerWidth - window.innerWidth > threshold ||
        window.outerHeight - window.innerHeight > threshold
      ) {
        if (!devtoolsOpen) {
          devtoolsOpen = true
          document.body.innerHTML = `
            <div style="
              position: fixed; inset: 0; z-index: 999999;
              background: #0f0f0f; color: #fff;
              display: flex; align-items: center; justify-content: center;
              flex-direction: column; gap: 16px;
              font-family: system-ui, -apple-system, sans-serif;
            ">
              <div style="font-size: 48px;">🛡️</div>
              <h1 style="font-size: 24px; font-weight: 700;">Access Denied</h1>
              <p style="font-size: 14px; color: #999; max-width: 400px; text-align: center;">
                Developer tools detected. Please close the developer tools to continue browsing.
              </p>
            </div>
          `
        }
      } else {
        if (devtoolsOpen) {
          devtoolsOpen = false
          window.location.reload()
        }
      }
    }

    // Check every 1.5 seconds
    const devtoolsInterval = setInterval(detectDevTools, 1500)

    // 4. Console warning
    const consoleWarn = () => {
      console.clear()
      console.log(
        '%c🛡️ Security Warning!',
        'color: red; font-size: 40px; font-weight: bold;'
      )
      console.log(
        '%cThis is a protected application. Using developer tools here may expose sensitive information. If someone told you to open this, it is likely a scam.',
        'color: #ff6b6b; font-size: 14px;'
      )
    }
    consoleWarn()

    // Re-warn periodically
    const consoleInterval = setInterval(() => {
      console.clear()
      consoleWarn()
    }, 30000)

    // 5. Disable drag on images
    const handleDragStart = (e: DragEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'IMG') {
        e.preventDefault()
      }
    }

    // Add event listeners (capture phase for highest priority)
    document.addEventListener('keydown', handleKeyDown, true)
    document.addEventListener('contextmenu', handleContextMenu, true)
    document.addEventListener('dragstart', handleDragStart, true)

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true)
      document.removeEventListener('contextmenu', handleContextMenu, true)
      document.removeEventListener('dragstart', handleDragStart, true)
      clearInterval(devtoolsInterval)
      clearInterval(consoleInterval)
    }
  }, [])

  return null // This component renders nothing
}
