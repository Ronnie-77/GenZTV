'use client'

// ─────────────────────────────────────────────────────────────────────────────
// RedirectAd
//
// A "click redirect" ad slot. When enabled by the admin (via AppSetting
// redirectAdUrl + redirectAdEnabled), it works as follows:
//
//   1. User enters the site.
//   2. After 2 minutes, the ad "arms" — starts listening for clicks.
//   3. When the user clicks ANYWHERE on the page (except the video player
//      area), the redirect ad URL opens in a new tab.
//   4. After firing, the ad re-arms after the admin-configured interval
//      (redirectAdIntervalMinutes, default 5 minutes). This repeats indefinitely.
//
// The video player area is excluded so that users can interact with the
// player (play/pause, fullscreen, quality, etc.) without triggering the ad.
//
// Admin configures this in Settings → Redirect Ad section, including the
// re-arm interval (1–1440 minutes).
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from 'react'
import { fetchSettings } from '@/lib/api'

// Timing constants
const INITIAL_DELAY = 2 * 60 * 1000   // 2 minutes after page load
// Default re-arm interval (used if the admin hasn't set one). The actual
// interval is read from settings.redirectAdIntervalMinutes.
const DEFAULT_REARM_INTERVAL = 5 * 60 * 1000  // 5 minutes

export function RedirectAd() {
  const [config, setConfig] = useState<{
    url: string
    enabled: boolean
    intervalMs: number
  }>({ url: '', enabled: false, intervalMs: DEFAULT_REARM_INTERVAL })
  const armedRef = useRef(false)
  const configRef = useRef(config)

  // Keep configRef in sync with state (must be in useEffect, not during render)
  useEffect(() => {
    configRef.current = config
  }, [config])

  // Fetch the redirect ad config from settings on mount
  useEffect(() => {
    fetchSettings()
      .then((s) => {
        const intervalMin = s.redirectAdIntervalMinutes && s.redirectAdIntervalMinutes > 0
          ? s.redirectAdIntervalMinutes
          : 5
        setConfig({
          url: s.redirectAdUrl || '',
          enabled: s.redirectAdEnabled && !!s.redirectAdUrl,
          intervalMs: intervalMin * 60 * 1000,
        })
      })
      .catch(() => {
        // If settings fetch fails, don't arm the ad
      })
  }, [])

  // Arm the ad after the initial delay, then re-arm on the configured interval
  useEffect(() => {
    if (!config.enabled || !config.url) return

    // Initial arm after 2 minutes
    const armTimer = setTimeout(() => {
      armedRef.current = true
    }, INITIAL_DELAY)

    // Re-arm on the admin-configured interval
    const rearmTimer = setInterval(() => {
      armedRef.current = true
    }, config.intervalMs)

    return () => {
      clearTimeout(armTimer)
      clearInterval(rearmTimer)
      armedRef.current = false
    }
  }, [config.enabled, config.url, config.intervalMs])

  // Listen for clicks on the document. When armed and the click is NOT inside
  // the video player, open the redirect ad URL in a new tab and disarm.
  useEffect(() => {
    if (!config.enabled || !config.url) return

    const handleClick = (e: MouseEvent) => {
      if (!armedRef.current) return
      if (!configRef.current.enabled || !configRef.current.url) return

      // Check if the click is inside the video player area.
      const target = e.target as HTMLElement
      if (!target) return

      // Exclude clicks on the video player and its controls
      const isPlayerClick =
        target.closest('.sp-wrapper') ||
        target.closest('.stream-player-host') ||
        target.closest('video') ||
        target.closest('iframe') ||
        target.closest('[data-player-container]') ||
        target.closest('button[title*="Fullscreen"]') ||
        target.closest('button[title*="Lock"]') ||
        target.closest('button[title*="Unlock"]') ||
        target.closest('button[title*="Picture"]')

      if (isPlayerClick) return

      // Open the redirect ad URL in a new tab
      const adUrl = configRef.current.url
      try {
        window.open(adUrl, '_blank', 'noopener,noreferrer')
      } catch {
        // Popup blocked — skip
      }

      // Disarm after firing — will re-arm on the next interval tick
      armedRef.current = false
    }

    // Use capture phase so we catch the click before other handlers
    document.addEventListener('click', handleClick, true)

    return () => {
      document.removeEventListener('click', handleClick, true)
    }
  }, [config.enabled, config.url])

  // This component renders nothing — it's purely a background listener
  return null
}
