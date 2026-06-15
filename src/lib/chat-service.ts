'use client'

import { io as socketIO, type Socket } from 'socket.io-client'

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
  reactions: Record<string, string[]>
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

type Unsubscribe = () => void

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const USER_STORAGE_KEY = 'genztv-user-profile'
const MENTIONS_STORAGE_KEY = 'genztv-mention-notifications'
const MAX_MESSAGES = 100
const PAGE_SIZE = 30
const MESSAGE_COOLDOWN_MS = 3000
const MAX_MESSAGE_LENGTH = 500
const STALE_USER_THRESHOLD_MS = 5 * 60 * 1000
const HEARTBEAT_INTERVAL_MS = 60 * 1000
const MENTION_REGEX = /@(\w+)/g
const CHAT_SERVICE_PORT = 3003

/* ------------------------------------------------------------------ */
/*  Socket.io connection                                               */
/* ------------------------------------------------------------------ */

let socket: Socket | null = null
let heartbeatInterval: ReturnType<typeof setInterval> | null = null

function getSocket(): Socket {
  if (!socket || !socket.connected) {
    socket = socketIO('/?XTransformPort=' + CHAT_SERVICE_PORT, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    })

    socket.on('connect', () => {
      console.log('[Chat] Connected to chat service')
    })

    socket.on('disconnect', () => {
      console.log('[Chat] Disconnected from chat service')
    })

    socket.on('connect_error', (err) => {
      console.warn('[Chat] Connection error:', err.message)
    })
  }
  return socket
}

/* ------------------------------------------------------------------ */
/*  User Profile (localStorage)                                        */
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
/*  Username Uniqueness Check                                          */
/* ------------------------------------------------------------------ */

export async function checkUsernameAvailable(username: string): Promise<boolean> {
  const profile = getStoredProfile()
  const s = getSocket()

  return new Promise((resolve) => {
    if (!s.connected) {
      // If not connected, allow it (will be checked server-side later)
      resolve(true)
      return
    }

    s.emit('checkUsername', { username, uid: profile?.uid || '' }, (available: boolean) => {
      resolve(available)
    })

    // Timeout fallback
    setTimeout(() => resolve(true), 3000)
  })
}

export async function registerUsername(username: string, uid: string): Promise<void> {
  const s = getSocket()
  if (s.connected) {
    s.emit('registerUsername', { username, uid })
  }
}

/* ------------------------------------------------------------------ */
/*  Chat Messages                                                      */
/* ------------------------------------------------------------------ */

export function listenToMessages(
  matchId: string,
  onMessages: (msgs: ChatMessage[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const s = getSocket()
  const profile = getStoredProfile()

  // Local message accumulator — mimics Firestore's onSnapshot behavior
  let allMessages: ChatMessage[] = []

  // Join the room
  if (profile) {
    s.emit('join', { matchId, profile })
  }

  // Listen for initial messages (full batch)
  const handleMessages = (msgs: ChatMessage[]) => {
    allMessages = msgs
    onMessages(allMessages)
  }

  // Listen for new single message
  const handleNewMessage = (msg: ChatMessage) => {
    // Avoid duplicates
    if (!allMessages.find(m => m.id === msg.id)) {
      allMessages = [...allMessages, msg]
    }
    onMessages(allMessages)
  }

  // Listen for message updates (reactions)
  const handleMessageUpdated = (data: { id: string; reactions: Record<string, string[]> }) => {
    allMessages = allMessages.map(m =>
      m.id === data.id ? { ...m, reactions: data.reactions } : m
    )
    onMessages(allMessages)
  }

  s.on('messages', handleMessages)
  s.on('message', handleNewMessage)
  s.on('messageUpdated', handleMessageUpdated)

  return () => {
    s.off('messages', handleMessages)
    s.off('message', handleNewMessage)
    s.off('messageUpdated', handleMessageUpdated)
  }
}

/** Not needed for socket.io — messages stream in real-time */
export async function loadOlderMessages(
  _matchId: string,
  _oldestTimestamp: number | null,
): Promise<{ messages: ChatMessage[]; hasMore: boolean }> {
  return { messages: [], hasMore: false }
}

export async function sendMessage(
  matchId: string,
  profile: UserProfile,
  text: string,
  replyTo: { msgId: string; username: string; text: string } | null,
): Promise<void> {
  if (text.length > MAX_MESSAGE_LENGTH) throw new Error('Message too long')
  if (!text.trim()) throw new Error('Message empty')

  const s = getSocket()
  s.emit('message', { matchId, profile, text, replyTo })
}

/* ------------------------------------------------------------------ */
/*  Reactions                                                          */
/* ------------------------------------------------------------------ */

export async function toggleReaction(
  matchId: string,
  msgId: string,
  emoji: string,
  uid: string,
): Promise<void> {
  const s = getSocket()
  s.emit('reaction', { matchId, msgId, emoji, uid })
}

/* ------------------------------------------------------------------ */
/*  Active Users / Presence                                            */
/* ------------------------------------------------------------------ */

export async function updatePresence(
  matchId: string,
  profile: UserProfile,
): Promise<void> {
  const s = getSocket()
  if (s.connected) {
    s.emit('heartbeat', { matchId, profile })
  }
}

export async function cleanupStaleUsers(_matchId: string): Promise<void> {
  // Server handles this automatically
}

export function listenToActiveUsers(
  matchId: string,
  onUsers: (users: ActiveUser[]) => void,
): Unsubscribe {
  const s = getSocket()

  const handleActiveUsers = (users: ActiveUser[]) => {
    onUsers(users)
  }

  s.on('activeUsers', handleActiveUsers)

  return () => {
    s.off('activeUsers', handleActiveUsers)
  }
}

export function listenToViewerCount(
  matchId: string,
  onCount: (count: number) => void,
): Unsubscribe {
  const s = getSocket()

  const handleActiveUsers = (users: ActiveUser[]) => {
    onCount(users.length)
  }

  s.on('activeUsers', handleActiveUsers)

  return () => {
    s.off('activeUsers', handleActiveUsers)
  }
}

export async function removePresence(matchId: string, uid: string): Promise<void> {
  const s = getSocket()
  // Just disconnect — the server handles cleanup
  if (s.connected) {
    s.disconnect()
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
  'fuck', 'shit', 'asshole', 'bastard', 'bitch', 'dick', 'pussy', 'whore',
  'nigger', 'nigga', 'retard', 'faggot', 'cunt', 'cock', 'slut',
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

export function startHeartbeat(matchId: string, profile: UserProfile): void {
  stopHeartbeat()
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
      oscillator.frequency.setValueAtTime(880, audioCtx.currentTime)
      oscillator.frequency.setValueAtTime(1100, audioCtx.currentTime + 0.1)
      gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime)
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2)
      oscillator.start(audioCtx.currentTime)
      oscillator.stop(audioCtx.currentTime + 0.2)
    } else if (type === 'send') {
      oscillator.frequency.setValueAtTime(600, audioCtx.currentTime)
      gainNode.gain.setValueAtTime(0.05, audioCtx.currentTime)
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.05)
      oscillator.start(audioCtx.currentTime)
      oscillator.stop(audioCtx.currentTime + 0.05)
    } else {
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
