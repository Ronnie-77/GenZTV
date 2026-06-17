'use client'

/**
 * TV spatial navigation — D-pad friendly focus management.
 *
 * How it works:
 *  - Any element with attribute `data-tv-focus` (or class `.tv-focusable`) is a
 *    focus target.
 *  - The currently-focused target gets `data-tv-focused="true"` (styled via CSS
 *    with a bright ring + scale).
 *  - On ArrowUp/Down/Left/Right, we find the NEAREST focusable element in that
 *    direction (using bounding rects + a weighted score) and focus it.
 *  - Enter / Space → click the focused element.
 *  - Backspace / Escape / "Back" → app-level go-back (via store).
 *  - The list auto-updates as the DOM changes (re-queries on every keypress).
 *
 * This is deliberately framework-light (no virtual DOM tracking) so it works
 * on older TV browsers that may not support IntersectionObserver.
 */

import { useEffect } from 'react'
import { useAppStore } from '@/lib/store'

const FOCUS_ATTR = 'data-tv-focus'
const FOCUSED_ATTR = 'data-tv-focused'

type Direction = 'up' | 'down' | 'left' | 'right'

interface Rect {
  left: number
  top: number
  right: number
  bottom: number
  cx: number
  cy: number
}

function getRect(el: Element): Rect | null {
  // getBoundingClientRect is supported on all TV browsers (Chrome 60+).
  const r = el.getBoundingClientRect()
  if (!r || r.width === 0 || r.height === 0) return null
  return {
    left: r.left,
    top: r.top,
    right: r.right,
    bottom: r.bottom,
    cx: r.left + r.width / 2,
    cy: r.top + r.height / 2,
  }
}

function isVisible(el: Element): boolean {
  // Lightweight visibility check — avoid IntersectionObserver (unreliable on old TVs).
  const r = (el as HTMLElement).getBoundingClientRect()
  if (r.width === 0 || r.height === 0) return false
  const style = (el as HTMLElement).style
  if (style.display === 'none' || style.visibility === 'hidden') return false
  // Off-screen (far) — skip
  if (r.bottom < -2000 || r.top > window.innerHeight + 2000) return false
  if (r.right < -2000 || r.left > window.innerWidth + 2000) return false
  return true
}

function getFocusables(): HTMLElement[] {
  // querySelectorAll is supported on Chrome 60+.
  const nodes = document.querySelectorAll<HTMLElement>(`[${FOCUS_ATTR}], .tv-focusable`)
  const list: HTMLElement[] = []
  nodes.forEach((el) => {
    if (isVisible(el) && !(el as HTMLElement).disabled) {
      list.push(el as HTMLElement)
    }
  })
  return list
}

function getCurrentFocused(): HTMLElement | null {
  const explicit = document.querySelector<HTMLElement>(`[${FOCUSED_ATTR}="true"]`)
  if (explicit && isVisible(explicit)) return explicit
  // Fall back to document.activeElement if it's a focusable
  const active = document.activeElement as HTMLElement | null
  if (active && active.hasAttribute(FOCUS_ATTR) && isVisible(active)) return active
  return null
}

function setFocused(el: HTMLElement | null) {
  // Clear previous
  const prev = document.querySelectorAll<HTMLElement>(`[${FOCUSED_ATTR}="true"]`)
  prev.forEach((p) => p.removeAttribute(FOCUSED_ATTR))
  if (el) {
    el.setAttribute(FOCUSED_ATTR, 'true')
    // Scroll into view (block: 'nearest' keeps context). Fallback for old browsers.
    try {
      el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
    } catch {
      el.scrollIntoView(false)
    }
  }
}

/** Find the best candidate in a given direction from `from`. */
function findBestCandidate(
  candidates: HTMLElement[],
  from: Rect,
  dir: Direction,
): HTMLElement | null {
  let best: HTMLElement | null = null
  let bestScore = Infinity

  for (const cand of candidates) {
    const r = getRect(cand)
    if (!r) continue
    // Must be in the right half-plane for the direction
    let inDirection = false
    let primaryAxis = 0 // distance along the direction axis
    let crossAxis = 0 // perpendicular offset

    if (dir === 'right') {
      inDirection = r.left >= from.right - 4 // allow small overlap
      primaryAxis = r.left - from.right
      crossAxis = Math.abs(r.cy - from.cy)
    } else if (dir === 'left') {
      inDirection = r.right <= from.left + 4
      primaryAxis = from.left - r.right
      crossAxis = Math.abs(r.cy - from.cy)
    } else if (dir === 'down') {
      inDirection = r.top >= from.bottom - 4
      primaryAxis = r.top - from.bottom
      crossAxis = Math.abs(r.cx - from.cx)
    } else if (dir === 'up') {
      inDirection = r.bottom <= from.top + 4
      primaryAxis = from.top - r.bottom
      crossAxis = Math.abs(r.cx - from.cx)
    }

    if (!inDirection) continue
    if (primaryAxis < 0) primaryAxis = 0

    // Weighted score: primary distance matters most; cross-axis penalty smaller.
    // We also add a small bonus for elements aligned on the same row/column.
    const score = primaryAxis + crossAxis * 1.2
    if (score < bestScore) {
      bestScore = score
      best = cand
    }
  }

  return best
}

/** Focus the first focusable in the document (used on initial load / page change). */
export function focusFirstTVElement(): void {
  const list = getFocusables()
  if (list.length > 0) {
    setFocused(list[0])
  }
}

/**
 * Hook: attaches a global keydown listener for D-pad navigation.
 * Only active in TV mode.
 */
export function useTVSpatialNav(enabled: boolean) {
  const goBack = useAppStore((s) => s.goBack)

  useEffect(() => {
    if (!enabled) return

    const handler = (e: KeyboardEvent) => {
      const key = e.key

      // Movement keys
      if (key === 'ArrowUp' || key === 'ArrowDown' || key === 'ArrowLeft' || key === 'ArrowRight') {
        e.preventDefault()
        const current = getCurrentFocused()
        const candidates = getFocusables()

        if (!current) {
          // Nothing focused yet — focus the first one
          if (candidates.length > 0) setFocused(candidates[0])
          return
        }

        const curRect = getRect(current)
        if (!curRect) {
          if (candidates.length > 0) setFocused(candidates[0])
          return
        }

        const dir: Direction =
          key === 'ArrowUp' ? 'up' : key === 'ArrowDown' ? 'down' : key === 'ArrowLeft' ? 'left' : 'right'

        // Exclude the current element from candidates
        const others = candidates.filter((c) => c !== current)
        const next = findBestCandidate(others, curRect, dir)

        if (next) {
          setFocused(next)
        }
        // If no candidate in that direction, stay put (do nothing).
        return
      }

      // Activate
      if (key === 'Enter' || key === ' ' || key === 'Spacebar') {
        const current = getCurrentFocused()
        if (current) {
          e.preventDefault()
          // Simulate a click
          current.click()
        }
        return
      }

      // Back
      if (key === 'Backspace' || key === 'Escape' || key === 'BrowserBack') {
        // Only intercept Backspace when not in an input
        const tag = (document.activeElement && (document.activeElement.tagName || '').toLowerCase()) || ''
        if (tag === 'input' || tag === 'textarea' || tag === 'select') return
        e.preventDefault()
        goBack()
        return
      }
    }

    // keydown on capture phase so we get first crack (before player controls etc.)
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [enabled, goBack])
}

/**
 * Focus management for page transitions in TV mode.
 * Re-focus the first element whenever `pageKey` changes.
 */
export function useTVFocusOnPageChange(pageKey: string, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return
    // Clear stale focus first
    const prev = document.querySelectorAll<HTMLElement>(`[${FOCUSED_ATTR}="true"]`)
    prev.forEach((p) => p.removeAttribute(FOCUSED_ATTR))
    // Defer until after render (next tick)
    const t = window.setTimeout(() => focusFirstTVElement(), 80)
    return () => window.clearTimeout(t)
  }, [pageKey, enabled])
}
