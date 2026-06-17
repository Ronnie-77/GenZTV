'use client'

import { useEffect, useState } from 'react'
import { fetchSettings } from '@/lib/api'
import { DynamicAdSlot } from '@/components/ads/dynamic-ad-slot'
import { DirectAdScript } from '@/components/ads/direct-ad-script'

/**
 * Ad script entry (mirrors the admin AdScript shape, kept loose for runtime flexibility).
 */
interface AdEntry {
  id: string
  name: string
  script: string
  position: string
  enabled: boolean
}

/**
 * useTVAds — fetches settings once and returns the enabled ad scripts filtered
 * by the requested positions. Also surfaces the master + per-section toggles
 * (adsEnabled, homeAdsEnabled, videoAdsEnabled) so pages can decide whether to
 * show the ad containers at all.
 */
export function useTVAds() {
  const [adsEnabled, setAdsEnabled] = useState(true)
  const [homeAdsEnabled, setHomeAdsEnabled] = useState(true)
  const [videoAdsEnabled, setVideoAdsEnabled] = useState(true)
  const [bannerAdScript, setBannerAdScript] = useState('')
  const [socialBarAdScript, setSocialBarAdScript] = useState('')
  const [allAds, setAllAds] = useState<AdEntry[]>([])

  useEffect(() => {
    let cancelled = false
    fetchSettings()
      .then((s) => {
        if (cancelled) return
        setAdsEnabled(s.adsEnabled)
        setHomeAdsEnabled(s.homeAdsEnabled ?? true)
        setVideoAdsEnabled(s.videoAdsEnabled ?? true)
        setBannerAdScript(s.bannerAdScript || '')
        setSocialBarAdScript(s.socialBarAdScript || '')
        try {
          const parsed = JSON.parse(s.customAdScripts || '[]')
          if (Array.isArray(parsed)) setAllAds(parsed as AdEntry[])
        } catch {
          /* ignore malformed JSON */
        }
      })
      .catch(() => {
        /* settings fetch failed — no ads to show */
      })
    return () => {
      cancelled = true
    }
  }, [])

  /** Returns enabled ad scripts matching ANY of the given positions. */
  const adsByPositions = (...positions: string[]): AdEntry[] => {
    if (!adsEnabled) return []
    return allAds.filter(
      (a) => a.enabled && positions.includes(a.position)
    )
  }

  return {
    adsEnabled,
    homeAdsEnabled,
    videoAdsEnabled,
    bannerAdScript,
    socialBarAdScript,
    adsByPositions,
  }
}

/**
 * TVAdSection — renders a centered, max-width-constrained TV ad container.
 *
 * Renders, in order of priority:
 *   1. Any custom ad scripts passed in via `ads` (the new customAdScripts system,
 *      filtered by position by the caller via useTVAds().adsByPositions).
 *   2. (Fallback) The legacy single-field script (`bannerAdScript` or
 *      `socialBarAdScript`) when no custom scripts exist for those positions —
 *      keeps backward compatibility with sites that only configured the legacy
 *      single banner/social-bar fields.
 *
 * @param ads          Pre-filtered list of enabled ad scripts for this slot.
 * @param legacyScript Optional legacy script to use as fallback when `ads` is empty.
 * @param variant      'banner' (wide, 896px) or 'social' (narrower, 768px).
 * @param label        Optional small uppercase label above the ad.
 */
export function TVAdSection({
  ads,
  legacyScript = '',
  variant = 'banner',
  label,
}: {
  ads: AdEntry[]
  legacyScript?: string
  variant?: 'banner' | 'social'
  label?: string
}) {
  const hasCustom = ads.length > 0
  const hasLegacy = legacyScript.trim().length > 0
  if (!hasCustom && !hasLegacy) return null

  const className =
    variant === 'social' ? 'tv-ad-slot tv-ad-social' : 'tv-ad-slot tv-ad-banner'

  // SOCIAL variant → render DIRECTLY in the main document (no iframe).
  // Social bar ad scripts (PropellerAds, Adsterra, Monetag, etc.) create
  // sticky/floating bars by appending `position: fixed` elements to
  // document.body. Inside an iframe they get clipped to a small inline box and
  // lose viewport/scroll/cookie access — they MUST run in the main document.
  // BANNER variant → keep the sandboxed DynamicAdSlot iframe, because banner
  // ads frequently use document.write() which would wipe the React app.
  if (variant === 'social') {
    const scripts = hasCustom ? ads.map((a) => a.script) : [legacyScript]
    return (
      <div className={className}>
        {label && <div className="tv-ad-label">{label}</div>}
        {scripts.map((s, i) => (
          <DirectAdScript
            key={hasCustom ? ads[i].id : `legacy-${i}`}
            script={s}
          />
        ))}
      </div>
    )
  }

  return (
    <div className={className}>
      {label && <div className="tv-ad-label">{label}</div>}
      {hasCustom ? (
        ads.map((ad) => <DynamicAdSlot key={ad.id} script={ad.script} />)
      ) : (
        <DynamicAdSlot script={legacyScript} />
      )}
    </div>
  )
}
