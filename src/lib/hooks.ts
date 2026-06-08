'use client'

import { useState, useEffect, useCallback } from 'react'
import { fetchChannels, fetchMatches, fetchCategories, type Channel, type Match, type Category } from '@/lib/api'

// ============ useChannels ============
export function useChannels(params?: { category?: string; search?: string; featured?: boolean; includeInactive?: boolean }) {
  const [channels, setChannels] = useState<Channel[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await fetchChannels(params)
      setChannels(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch channels')
    } finally {
      setLoading(false)
    }
  }, [params?.category, params?.search, params?.featured])

  useEffect(() => {
    load()
  }, [load])

  return { channels, loading, error, refetch: load }
}

// ============ useMatches ============
export function useMatches(params?: { sport?: string; status?: string; featured?: boolean }) {
  const [matches, setMatches] = useState<Match[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await fetchMatches(params)
      setMatches(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch matches')
    } finally {
      setLoading(false)
    }
  }, [params?.sport, params?.status, params?.featured])

  useEffect(() => {
    load()
  }, [load])

  return { matches, loading, error, refetch: load }
}

// ============ useCategories ============
export function useCategories() {
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        setLoading(true)
        setError(null)
        const data = await fetchCategories()
        setCategories(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch categories')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  return { categories, loading, error }
}

// ============ useCountdown ============
export function useCountdown(targetDate: Date) {
  const [timeLeft, setTimeLeft] = useState(getTimeLeft(targetDate))

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(getTimeLeft(targetDate))
    }, 1000)
    return () => clearInterval(timer)
  }, [targetDate.getTime()])

  return timeLeft
}

function getTimeLeft(target: Date) {
  const now = new Date()
  const diff = target.getTime() - now.getTime()
  if (diff <= 0) return { days: 0, hours: 0, mins: 0, secs: 0, started: true }
  return {
    days: Math.floor(diff / (1000 * 60 * 60 * 24)),
    hours: Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
    mins: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)),
    secs: Math.floor((diff % (1000 * 60)) / 1000),
    started: false,
  }
}
