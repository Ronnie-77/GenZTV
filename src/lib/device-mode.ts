'use client'

/**
 * Device mode detection for GenZ TV.
 *
 * Three modes:
 *  - 'tv'       → Smart TV (Tizen / WebOS / NetCast / HBBTV / Roku / Apple TV / large screen + coarse pointer)
 *  - 'mobile'   → Phones and small touch devices (width < 768, pointer: coarse)
 *  - 'desktop'  → PCs and large screens with fine pointer (mouse)
 *
 * A user can force a mode via:
 *  - localStorage key `zeng-device-mode` = 'tv' | 'mobile' | 'desktop' | 'auto'
 *  - URL param `?mode=tv` (or `#tv`)
 *
 * TV mode unlocks a remote-friendly, native-app-like UI with D-pad spatial
 * navigation, large focusable cards and a left-rail navigation.
 */

export type DeviceMode = 'tv' | 'mobile' | 'desktop'

const TV_UA_PATTERNS = [
  /smart-tv/i,
  /smarttv/i,
  /tizen/i,
  /webos/i,
  /netcast/i,
  /hbbtv/i,
  /roku/i,
  /appletv/i,
  /applecoremedia.*television/i,
  /ce-html/i,
  /googletv/i,
  /viera/i, // Panasonic
  /bravia/i, // Sony
  /nettv/i, // Philips
  /tvbox/i,
  /\bdtv\b/i,
  /tv;\s/i,
]

const MANUAL_KEY = 'zeng-device-mode'

/** Read a manual override (localStorage or URL). Returns null if unset/auto. */
function readManualOverride(): DeviceMode | null {
  if (typeof window === 'undefined') return null
  try {
    // URL param takes priority for one-time forcing (e.g. preview, deep link)
    const url = new URL(window.location.href)
    const urlMode = url.searchParams.get('mode')
    if (urlMode === 'tv' || urlMode === 'mobile' || urlMode === 'desktop') {
      return urlMode
    }
    // Hash trigger #tv
    if (window.location.hash && /#tv\b/i.test(window.location.hash)) {
      return 'tv'
    }
    // localStorage override
    const stored = localStorage.getItem(MANUAL_KEY)
    if (stored === 'tv' || stored === 'mobile' || stored === 'desktop') {
      return stored
    }
  } catch {
    // ignore
  }
  return null
}

/** Heuristic: is this user-agent a Smart TV? */
function isTVUserAgent(ua: string): boolean {
  return TV_UA_PATTERNS.some((re) => re.test(ua))
}

/** Detect the best device mode based on UA + screen. */
export function detectDeviceMode(): DeviceMode {
  if (typeof window === 'undefined') return 'desktop'

  // 1. Manual override wins
  const manual = readManualOverride()
  if (manual) return manual

  // 2. User-Agent TV signatures
  const ua = navigator.userAgent || ''
  if (isTVUserAgent(ua)) return 'tv'

  // 3. Large screen + coarse pointer heuristic (10-foot UI)
  //    TV browsers usually expose a wide viewport + no precise pointer.
  try {
    const coarse = window.matchMedia('(pointer: coarse)').matches
    const wide = window.innerWidth >= 1280
    const veryWide = window.innerWidth >= 1600
    // Some TVs report pointer:fine (mouse-attached). Use width + UA combo.
    if (coarse && wide) return 'tv'
    // Heuristic: extremely wide + low devicePixelRatio (typical TV)
    if (veryWide && window.devicePixelRatio <= 1.5 && /android/i.test(ua)) {
      return 'tv'
    }
  } catch {
    // matchMedia not supported (very old TV) — assume TV since UA didn't match desktop browsers
  }

  // 4. Default by width
  if (window.innerWidth < 768) return 'mobile'
  return 'desktop'
}

/** Persist a manual override (or clear it with 'auto'). */
export function setManualDeviceMode(mode: DeviceMode | 'auto') {
  if (typeof window === 'undefined') return
  try {
    if (mode === 'auto') {
      localStorage.removeItem(MANUAL_KEY)
    } else {
      localStorage.setItem(MANUAL_KEY, mode)
    }
  } catch {
    // ignore
  }
}

export function getManualDeviceMode(): DeviceMode | 'auto' {
  if (typeof window === 'undefined') return 'auto'
  try {
    const stored = localStorage.getItem(MANUAL_KEY)
    if (stored === 'tv' || stored === 'mobile' || stored === 'desktop') return stored
  } catch {
    // ignore
  }
  return 'auto'
}
