'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { MessageCircle, Check, X, Loader2 } from 'lucide-react'
import {
  checkUsernameAvailable,
  registerUsername,
  createProfile,
  type UserProfile,
} from '@/lib/chat-service'

/* ------------------------------------------------------------------ */
/*  Username validation                                                */
/* ------------------------------------------------------------------ */

const USERNAME_REGEX = /^[a-zA-Z0-9_]+$/
const MIN_LEN = 3
const MAX_LEN = 20

function validateUsername(name: string): { valid: boolean; error: string } {
  if (name.length < MIN_LEN) return { valid: false, error: `At least ${MIN_LEN} characters` }
  if (name.length > MAX_LEN) return { valid: false, error: `Maximum ${MAX_LEN} characters` }
  if (!USERNAME_REGEX.test(name)) return { valid: false, error: 'Only letters, numbers & underscore' }
  return { valid: true, error: '' }
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

interface UsernameModalProps {
  onComplete: (profile: UserProfile) => void
}

export function UsernameModal({ onComplete }: UsernameModalProps) {
  const [username, setUsername] = useState('')
  const [checking, setChecking] = useState(false)
  const [available, setAvailable] = useState<boolean | null>(null)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const checkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Focus input on mount
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 200)
  }, [])

  // Debounced uniqueness check
  const checkAvailability = useCallback(async (name: string) => {
    const validation = validateUsername(name)
    if (!validation.valid) {
      setAvailable(null)
      setError(validation.error)
      return
    }

    setError('')
    setChecking(true)
    try {
      const isAvailable = await checkUsernameAvailable(name)
      setAvailable(isAvailable)
      if (!isAvailable) setError('Username already taken')
    } catch {
      setAvailable(null)
    } finally {
      setChecking(false)
    }
  }, [])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setUsername(val)
    setAvailable(null)

    // Clear previous timer
    if (checkTimerRef.current) clearTimeout(checkTimerRef.current)

    const validation = validateUsername(val)
    if (!validation.valid) {
      setError(validation.error)
      return
    }

    setError('')
    // Debounce uniqueness check
    checkTimerRef.current = setTimeout(() => checkAvailability(val), 400)
  }

  const handleSubmit = async () => {
    const validation = validateUsername(username)
    if (!validation.valid) return

    // Double-check availability
    setSubmitting(true)
    try {
      const isAvail = await checkUsernameAvailable(username)
      if (!isAvail) {
        setError('Username already taken')
        setAvailable(false)
        setSubmitting(false)
        return
      }

      // Create profile
      const profile = createProfile(username)

      // Register username in Firestore
      await registerUsername(username, profile.uid)

      onComplete(profile)
    } catch {
      // Still proceed even if Firestore write fails
      const profile = createProfile(username)
      onComplete(profile)
    } finally {
      setSubmitting(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && available && !submitting) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const canSubmit = available === true && !submitting && !error

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div
        className="bg-card border border-border rounded-2xl p-6 w-[90vw] max-w-md shadow-2xl animate-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
        aria-label="Set your username"
      >
        {/* Icon */}
        <div className="flex justify-center mb-4">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
            <MessageCircle className="h-8 w-8 text-primary" />
          </div>
        </div>

        {/* Title */}
        <h2 className="text-xl font-bold text-center mb-1">Join the Chat</h2>
        <p className="text-sm text-muted-foreground text-center mb-6">
          Choose a unique username to start chatting
        </p>

        {/* Input */}
        <div className="relative mb-2">
          <input
            ref={inputRef}
            type="text"
            value={username}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="e.g. Ronnie_07"
            maxLength={MAX_LEN}
            className="w-full h-12 px-4 pr-10 rounded-xl border border-input bg-background text-foreground text-base placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-colors"
            autoFocus
          />
          {/* Status icon */}
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            {checking ? (
              <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
            ) : available === true ? (
              <Check className="h-5 w-5 text-emerald-500" />
            ) : available === false ? (
              <X className="h-5 w-5 text-destructive" />
            ) : null}
          </div>
        </div>

        {/* Error / hint */}
        <div className="min-h-[20px] mb-4">
          {error && (
            <p className="text-xs text-destructive">{error}</p>
          )}
          {!error && username.length > 0 && available === true && (
            <p className="text-xs text-emerald-500">Username is available!</p>
          )}
          {!error && username.length === 0 && (
            <p className="text-xs text-muted-foreground">
              {MIN_LEN}–{MAX_LEN} chars, letters, numbers & underscore only
            </p>
          )}
        </div>

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="w-full h-12 rounded-xl font-semibold text-base transition-all duration-200 btn-press disabled:opacity-40 disabled:cursor-not-allowed bg-primary text-primary-foreground hover:bg-primary/90"
        >
          {submitting ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Setting up...
            </span>
          ) : (
            'Start Chatting'
          )}
        </button>

        {/* Character count */}
        <p className="text-[10px] text-muted-foreground text-center mt-3">
          {username.length}/{MAX_LEN}
        </p>
      </div>
    </div>
  )
}
