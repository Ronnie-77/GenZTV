'use client'

import { useEffect, useRef } from 'react'
import { useAppStore } from '@/lib/store'

let lastTrackedKey = ''
let lastTrackedTime = 0

export function trackPageView(page: string, channelId?: string) {
  // Debounce: don't send same page+channel within 5 seconds
  const key = `${page}:${channelId || ''}`
  const now = Date.now()
  if (key === lastTrackedKey && now - lastTrackedTime < 5000) return
  lastTrackedKey = key
  lastTrackedTime = now

  fetch('/api/analytics/track', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      page,
      channelId: channelId || undefined,
      referrer: typeof document !== 'undefined' ? document.referrer : '',
    }),
  }).catch(() => {
    // Silently ignore analytics errors
  })
}

export function useAnalytics() {
  const { currentPage, currentChannelId } = useAppStore()
  const initialized = useRef(false)

  useEffect(() => {
    // Track page view on navigation change
    const channelId = currentPage === 'watch' ? currentChannelId || undefined : undefined
    trackPageView(currentPage, channelId)
  }, [currentPage, currentChannelId])

  // Track initial page load
  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true
      const channelId = currentPage === 'watch' ? currentChannelId || undefined : undefined
      trackPageView(currentPage, channelId)
    }
  }, [])
}
