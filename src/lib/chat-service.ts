'use client'

import {
  collection,
  doc,
  addDoc,
  setDoc,
  onSnapshot,
  query,
  orderBy,
  limit,
  startAfter,
  Timestamp,
  updateDoc,
  arrayUnion,
  arrayRemove,
  getDoc,
  getDocs,
  where,
  deleteDoc,
  deleteField,
  serverTimestamp,
  type Unsubscribe,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface ChatMessage {
  id: string
  uid: string
  username: string
  userColor: string
  text: string
  timestamp: number
  reactions: Record<string, string[]>  // { "👍": ["uid1", "uid2"] }
  replyTo: { msgId: string; username: string; text: string } | null
}

export interface ActiveUser {
  uid: string
  username: string
  lastSeen: number
}

export interface UserProfile {
  username: string
  uid: string
  color: string
}

export interface MentionNotification {
  id: string
  fromUser: string
  fromUserColor: string
  text: string
  matchId: string
  matchTitle: string
  timestamp: number
  read: boolean
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const USER_STORAGE_KEY = 'genztv-user-profile'
const MENTIONS_STORAGE_KEY = 'genztv-mention-notifications'
const MAX_MESSAGES = 100
const PAGE_SIZE = 30
const MESSAGE_COOLDOWN_MS = 3000
const MAX_MESSAGE_LENGTH = 500
const STALE_USER_THRESHOLD_MS = 5 * 60 * 1000  // 5 minutes
const HEARTBEAT_INTERVAL_MS = 60 * 1000         // 1 minute
const MENTION_REGEX = /@(\w+)/g

/* ------------------------------------------------------------------ */
/*  User Profile (localStorage + Firestore)                            */
/* ------------------------------------------------------------------ */

function randomHSL(): string {
  const hue = Math.floor(Math.random() * 360)
  return `hsl(${hue}, 70%, 65%)`
}

export function generateUid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return 'xxxx-xxxx-xxxx'.replace(/x/g, () => ((Math.random() * 16) | 0).toString(16))
}

export function getStoredProfile(): UserProfile | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(USER_STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as UserProfile
  } catch {
    return null
  }
}

export function setStoredProfile(profile: UserProfile) {
  if (typeof window === 'undefined') return
  localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(profile))
}

export function createProfile(username: string): UserProfile {
  const profile: UserProfile = {
    username,
    uid: generateUid(),
    color: randomHSL(),
  }
  setStoredProfile(profile)
  return profile
}

export function updateProfileUsername(username: string) {
  const profile = getStoredProfile()
  if (!profile) return
  profile.username = username
  setStoredProfile(profile)
}

/* ------------------------------------------------------------------ */
/*  Username Uniqueness Check (Firestore)                              */
/* ------------------------------------------------------------------ */

export async function checkUsernameAvailable(username: string): Promise<boolean> {
  if (!db) return true
  try {
    const ref = doc(db, 'usernames', username.toLowerCase())
    const snap = await getDoc(ref)
    if (!snap.exists()) return true
    const data = snap.data()
    const profile = getStoredProfile()
    if (profile && data.uid === profile.uid) return true
    return false
  } catch {
    return true
  }
}

export async function registerUsername(username: string, uid: string): Promise<void> {
  if (!db) return
  try {
    await setDoc(doc(db, 'usernames', username.toLowerCase()), {
      uid,
      createdAt: Timestamp.now(),
    })
  } catch {
    // Silent fail — non-critical
  }
}

/* ------------------------------------------------------------------ */
/*  Chat Messages (Firestore)                                          */
/* ------------------------------------------------------------------ */

export function listenToMessages(
  matchId: string,
  onMessages: (msgs: ChatMessage[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  if (!db) {
    onMessages([])
    return () => {}
  }

  const q = query(
    collection(db, 'chats', matchId, 'messages'),
    orderBy('timestamp', 'asc'),
    limit(MAX_MESSAGES),
  )

  return onSnapshot(
    q,
    (snapshot) => {
      const msgs: ChatMessage[] = snapshot.docs.map(d => {
        const data = d.data() as DocumentData
        return {
          id: d.id,
          uid: data.uid || '',
          username: data.username || 'Anonymous',
          userColor: data.userColor || '#888',
          text: data.text || '',
          timestamp: data.timestamp?.toMillis?.() || Date.now(),
          reactions: data.reactions || {},
          replyTo: data.replyTo || null,
        }
      })
      onMessages(msgs)
    },
    (err) => {
      onError?.(err)
    },
  )
}

/** Load older messages for pagination — returns messages older than the given cursor */
export async function loadOlderMessages(
  matchId: string,
  oldestTimestamp: number | null,
): Promise<{ messages: ChatMessage[]; hasMore: boolean }> {
  if (!db) return { messages: [], hasMore: false }

  try {
    let q
    if (oldestTimestamp) {
      // Query messages older than the oldest we have
      const cursor = Timestamp.fromMillis(oldestTimestamp)
      q = query(
        collection(db, 'chats', matchId, 'messages'),
        orderBy('timestamp', 'desc'),
        limit(PAGE_SIZE + 1), // +1 to check if there are more
      )
      // We can't easily use startAfter with a timestamp for descending,
      // so we'll fetch and filter
      const snap = await getDocs(q)
      const all: ChatMessage[] = []
      snap.docs.forEach(d => {
        const data = d.data() as DocumentData
        const ts = data.timestamp?.toMillis?.() || 0
        if (ts < oldestTimestamp) {
          all.push({
            id: d.id,
            uid: data.uid || '',
            username: data.username || 'Anonymous',
            userColor: data.userColor || '#888',
            text: data.text || '',
            timestamp: ts,
            reactions: data.reactions || {},
            replyTo: data.replyTo || null,
          })
        }
      })
      const hasMore = all.length > PAGE_SIZE
      const messages = all.slice(0, PAGE_SIZE).reverse() // reverse back to ascending
      return { messages, hasMore }
    } else {
      // First load
      q = query(
        collection(db, 'chats', matchId, 'messages'),
        orderBy('timestamp', 'asc'),
        limit(PAGE_SIZE),
      )
      const snap = await getDocs(q)
      const messages: ChatMessage[] = snap.docs.map(d => {
        const data = d.data() as DocumentData
        return {
          id: d.id,
          uid: data.uid || '',
          username: data.username || 'Anonymous',
          userColor: data.userColor || '#888',
          text: data.text || '',
          timestamp: data.timestamp?.toMillis?.() || 0,
          reactions: data.reactions || {},
          replyTo: data.replyTo || null,
        }
      })
      return { messages, hasMore: snap.size >= PAGE_SIZE }
    }
  } catch {
    return { messages: [], hasMore: false }
  }
}

export async function sendMessage(
  matchId: string,
  profile: UserProfile,
  text: string,
  replyTo: { msgId: string; username: string; text: string } | null,
): Promise<void> {
  if (!db) return
  if (text.length > MAX_MESSAGE_LENGTH) throw new Error('Message too long')
  if (!text.trim()) throw new Error('Message empty')

  await addDoc(collection(db, 'chats', matchId, 'messages'), {
    uid: profile.uid,
    username: profile.username,
    userColor: profile.color,
    text: text.trim(),
    timestamp: serverTimestamp(),
    reactions: {},
    replyTo,
  })

  // Update active user presence
  await updatePresence(matchId, profile)
}

/* ------------------------------------------------------------------ */
/*  Reactions (Firestore)                                              */
/* ------------------------------------------------------------------ */

export async function toggleReaction(
  matchId: string,
  msgId: string,
  emoji: string,
  uid: string,
): Promise<void> {
  if (!db) return

  const ref = doc(db, 'chats', matchId, 'messages', msgId)
  const snap = await getDoc(ref)
  if (!snap.exists()) return

  const data = snap.data() as DocumentData
  const reactions: Record<string, string[]> = data.reactions || {}
  const users = reactions[emoji] || []

  if (users.includes(uid)) {
    if (users.length <= 1) {
      await updateDoc(ref, {
        [`reactions.${emoji}`]: deleteField(),
      })
    } else {
      await updateDoc(ref, {
        [`reactions.${emoji}`]: arrayRemove(uid),
      })
    }
  } else {
    await updateDoc(ref, {
      [`reactions.${emoji}`]: arrayUnion(uid),
    })
  }
}

/* ------------------------------------------------------------------ */
/*  Active Users / Presence                                            */
/* ------------------------------------------------------------------ */

export async function updatePresence(
  matchId: string,
  profile: UserProfile,
): Promise<void> {
  if (!db) return
  try {
    await setDoc(doc(db, 'activeUsers', matchId, 'users', profile.uid), {
      username: profile.username,
      lastSeen: serverTimestamp(),
    }, { merge: true })
  } catch {
    // Silent
  }
}

/** Remove stale users who haven't been seen in the last 5 minutes */
export async function cleanupStaleUsers(matchId: string): Promise<void> {
  if (!db) return
  try {
    const cutoff = Timestamp.fromMillis(Date.now() - STALE_USER_THRESHOLD_MS)
    const q = query(
      collection(db, 'activeUsers', matchId, 'users'),
      orderBy('lastSeen', 'asc'),
      limit(50),
    )
    const snap = await getDocs(q)
    const deletions: Promise<void>[] = []
    snap.docs.forEach(d => {
      const data = d.data() as DocumentData
      const lastSeen: Timestamp | undefined = data.lastSeen
      if (lastSeen && lastSeen.toMillis() < cutoff.toMillis()) {
        deletions.push(deleteDoc(d.ref))
      }
    })
    await Promise.all(deletions)
  } catch {
    // Silent
  }
}

export function listenToActiveUsers(
  matchId: string,
  onUsers: (users: ActiveUser[]) => void,
): Unsubscribe {
  if (!db) {
    onUsers([])
    return () => {}
  }

  const q = collection(db, 'activeUsers', matchId, 'users')
  return onSnapshot(q, (snapshot) => {
    const now = Date.now()
    const users: ActiveUser[] = []
    snapshot.docs.forEach(d => {
      const data = d.data() as DocumentData
      const lastSeen = data.lastSeen?.toMillis?.() || 0
      // Only count users seen within the threshold
      if (now - lastSeen < STALE_USER_THRESHOLD_MS) {
        users.push({
          uid: d.id,
          username: data.username || 'Anonymous',
          lastSeen,
        })
      }
    })
    onUsers(users)
  })
}

export function listenToViewerCount(
  matchId: string,
  onCount: (count: number) => void,
): Unsubscribe {
  if (!db) {
    onCount(0)
    return () => {}
  }

  const q = collection(db, 'activeUsers', matchId, 'users')
  return onSnapshot(q, (snapshot) => {
    const now = Date.now()
    let count = 0
    snapshot.docs.forEach(d => {
      const data = d.data() as DocumentData
      const lastSeen = data.lastSeen?.toMillis?.() || 0
      if (now - lastSeen < STALE_USER_THRESHOLD_MS) count++
    })
    onCount(count)
  })
}

/** Remove own presence when leaving a chat room */
export async function removePresence(matchId: string, uid: string): Promise<void> {
  if (!db) return
  try {
    await deleteDoc(doc(db, 'activeUsers', matchId, 'users', uid))
  } catch {
    // Silent
  }
}

/* ------------------------------------------------------------------ */
/*  Mention Notifications (localStorage-based)                         */
/* ------------------------------------------------------------------ */

export function extractMentions(text: string): string[] {
  const mentions: string[] = []
  let match: RegExpExecArray | null
  const regex = new RegExp(MENTION_REGEX.source, 'g')
  while ((match = regex.exec(text)) !== null) {
    mentions.push(match[1])
  }
  return mentions
}

export function saveMentionNotification(notification: MentionNotification): void {
  if (typeof window === 'undefined') return
  try {
    const existing = getMentionNotifications()
    // Keep max 50
    const updated = [notification, ...existing].slice(0, 50)
    localStorage.setItem(MENTIONS_STORAGE_KEY, JSON.stringify(updated))
  } catch {
    // Silent
  }
}

export function getMentionNotifications(): MentionNotification[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(MENTIONS_STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw) as MentionNotification[]
  } catch {
    return []
  }
}

export function getUnreadMentionCount(): number {
  return getMentionNotifications().filter(n => !n.read).length
}

export function markAllMentionsRead(): void {
  if (typeof window === 'undefined') return
  try {
    const existing = getMentionNotifications()
    const updated = existing.map(n => ({ ...n, read: true }))
    localStorage.setItem(MENTIONS_STORAGE_KEY, JSON.stringify(updated))
  } catch {
    // Silent
  }
}

export function clearMentionNotifications(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(MENTIONS_STORAGE_KEY)
}

/* ------------------------------------------------------------------ */
/*  Rate Limiting (client-side)                                        */
/* ------------------------------------------------------------------ */

let lastSendTime = 0

export function canSendMessage(): { ok: boolean; remainingMs: number } {
  const now = Date.now()
  const diff = now - lastSendTime
  if (diff >= MESSAGE_COOLDOWN_MS) {
    return { ok: true, remainingMs: 0 }
  }
  return { ok: false, remainingMs: MESSAGE_COOLDOWN_MS - diff }
}

export function markMessageSent() {
  lastSendTime = Date.now()
}

/* ------------------------------------------------------------------ */
/*  Profanity Filter                                                   */
/* ------------------------------------------------------------------ */

const BANNED_WORDS = [
  // English
  'fuck', 'shit', 'asshole', 'bastard', 'bitch', 'dick', 'pussy', 'whore',
  'nigger', 'nigga', 'retard', 'faggot', 'cunt', 'cock', 'slut',
  // Bengali transliterations & common
  'চুদ', 'মাদারচোদ', 'ব্যালা', 'খানকি', 'শালা', 'বেটা', 'রান্ডি',
  'চুতমারানি', 'গান্ডু', 'ঝাট', 'মাগি', 'পোঁদ', 'শুয়োর',
]

export function containsProfanity(text: string): boolean {
  const lower = text.toLowerCase()
  return BANNED_WORDS.some(w => lower.includes(w))
}

/* ------------------------------------------------------------------ */
/*  Heartbeat — periodic presence ping                                 */
/* ------------------------------------------------------------------ */

let heartbeatInterval: ReturnType<typeof setInterval> | null = null

export function startHeartbeat(matchId: string, profile: UserProfile): void {
  stopHeartbeat()
  // Immediately update presence
  updatePresence(matchId, profile)
  heartbeatInterval = setInterval(() => {
    updatePresence(matchId, profile)
  }, HEARTBEAT_INTERVAL_MS)
}

export function stopHeartbeat(): void {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval)
    heartbeatInterval = null
  }
}

/* ------------------------------------------------------------------ */
/*  Sound Effects                                                      */
/* ------------------------------------------------------------------ */

export function playChatSound(type: 'message' | 'mention' | 'send'): void {
  if (typeof window === 'undefined') return
  try {
    const audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    const oscillator = audioCtx.createOscillator()
    const gainNode = audioCtx.createGain()

    oscillator.connect(gainNode)
    gainNode.connect(audioCtx.destination)

    if (type === 'mention') {
      // Higher pitched double beep for mentions
      oscillator.frequency.setValueAtTime(880, audioCtx.currentTime)
      oscillator.frequency.setValueAtTime(1100, audioCtx.currentTime + 0.1)
      gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime)
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2)
      oscillator.start(audioCtx.currentTime)
      oscillator.stop(audioCtx.currentTime + 0.2)
    } else if (type === 'send') {
      // Soft click for send
      oscillator.frequency.setValueAtTime(600, audioCtx.currentTime)
      gainNode.gain.setValueAtTime(0.05, audioCtx.currentTime)
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.05)
      oscillator.start(audioCtx.currentTime)
      oscillator.stop(audioCtx.currentTime + 0.05)
    } else {
      // Subtle pop for new message
      oscillator.frequency.setValueAtTime(500, audioCtx.currentTime)
      oscillator.frequency.exponentialRampToValueAtTime(300, audioCtx.currentTime + 0.08)
      gainNode.gain.setValueAtTime(0.06, audioCtx.currentTime)
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.08)
      oscillator.start(audioCtx.currentTime)
      oscillator.stop(audioCtx.currentTime + 0.08)
    }
  } catch {
    // Audio not supported, silent fail
  }
}

/* ------------------------------------------------------------------ */
/*  Exports                                                            */
/* ------------------------------------------------------------------ */

export { MAX_MESSAGE_LENGTH, MESSAGE_COOLDOWN_MS, PAGE_SIZE, STALE_USER_THRESHOLD_MS }
