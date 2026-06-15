'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import {
  Send, MessageCircle, Users, Smile, Reply, X, Settings, Loader2, Pencil,
  Bell, BellOff, Volume2, VolumeX, ChevronUp, Hash,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { UsernameModal } from './username-modal'
import {
  getStoredProfile,
  updateProfileUsername,
  checkUsernameAvailable,
  registerUsername,
  listenToMessages,
  sendMessage,
  toggleReaction,
  listenToViewerCount,
  listenToActiveUsers,
  canSendMessage,
  markMessageSent,
  containsProfanity,
  startHeartbeat,
  stopHeartbeat,
  removePresence,
  extractMentions,
  saveMentionNotification,
  getMentionNotifications,
  getUnreadMentionCount,
  markAllMentionsRead,
  playChatSound,
  cleanupStaleUsers,
  type ChatMessage as FirestoreChatMessage,
  type ActiveUser,
  type MentionNotification,
  type UserProfile,
  MAX_MESSAGE_LENGTH,
  MESSAGE_COOLDOWN_MS,
} from '@/lib/chat-service'
import type { Unsubscribe } from '@/lib/chat-service'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Reaction {
  emoji: string
  users: string[]
}

interface ReplyInfo {
  msgId: string
  username: string
  text: string
}

interface ChatMessage {
  id: string
  uid: string
  user: string
  text: string
  time: string
  color: string
  reactions: Reaction[]
  replyTo: ReplyInfo | null
  timestamp: number
  isNew?: boolean  // for enter animation
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const REACTIONS = [
  { emoji: '👍', label: 'Like' },
  { emoji: '❤️', label: 'Love' },
  { emoji: '😂', label: 'Haha' },
  { emoji: '😢', label: 'Sad' },
  { emoji: '😡', label: 'Angry' },
  { emoji: '🔥', label: 'Fire' },
]

const emojiCategories = [
  {
    name: 'Smileys',
    emojis: ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','😊','😇','🥰','😍','🤩','😘','😗','😚','😙','🥲','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🫡','🤐','🤨','😐','😑','😶','🫥','😏','😒','🙄','😬','🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🥵','🥶','🥴','😵','🤯','🤠','🥳','🥸','😎','🤓','🧐'],
  },
  {
    name: 'Gestures',
    emojis: ['👋','🤚','🖐️','✋','🖖','🫱','🫲','🫳','🫴','👌','🤌','🤏','✌️','🤞','🫰','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','🫵','👍','👎','✊','👊','🤛','🤜','👏','🙌','🫶','👐','🤲','🤝','🙏','💪'],
  },
  {
    name: 'Hearts',
    emojis: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❤️‍🔥','❤️‍🩹','❣️','💕','💞','💓','💗','💖','💘','💝','💟'],
  },
  {
    name: 'Sports',
    emojis: ['⚽','🏀','🏈','⚾','🥎','🎾','🏐','🏉','🥏','🎱','🪀','🏓','🏸','🏒','🏑','🥍','🏏','🪃','🥅','⛳','🪁','🏹','🎣','🤿','🥊','🥋','🎽','🛹','🛼','🛷','⛸️','🥌','🎿','⛷️','🏂'],
  },
  {
    name: 'Celebration',
    emojis: ['🎉','🎊','🎈','🎁','🎀','🏆','🥇','🥈','🥉','🏅','🎖️','🏵️','🎫','🎟️','🎪','🎭','🎬','🎤','🎧','🎼','🎹','🥁','🪘','🎷','🎺','🪗','🎸','🪕','🎻','🎲','♟️','🎯','🎳','🎮','🕹️','🧩','🪄','🔮'],
  },
  {
    name: 'Fire',
    emojis: ['🔥','💥','💫','⚡','✨','🌟','⭐','💯','👑','💎','🦾','🦿','🧠','👀','👅','👄','🫦','🫀','🫁','🦴','💀','☠️','👻','👽','🤖','🎃','😈','👿'],
  },
  {
    name: 'Flags',
    emojis: ['🇧🇩','🇮🇳','🇵🇰','🇱🇰','🇳🇵','🇬🇧','🇺🇸','🇦🇺','🇨🇦','🇧🇷','🇩🇪','🇫🇷','🇯🇵','🇰🇷','🇨🇳','🇦🇪','🇸🇦','🇶🇦','🏴󠁧󠁢󠁥󠁮󠁧󠁿','🏴󠁧󠁢󠁳󠁣󠁴󠁿','🏴󠁧󠁢󠁷󠁬󠁳󠁿','🏳️','🏴','🏁','🚩'],
  },
  {
    name: 'Food',
    emojis: ['🍕','🍔','🍟','🌭','🥪','🌮','🌯','🥙','🧆','🥘','🍛','🍜','🍝','🍱','🍚','🍙','🍘','🍥','🥠','🥮','🍢','🍡','🍧','🍨','🍦','🥧','🧁','🍰','🎂','🍮','🍭','🍬','🍫','🍿','🧈','🥜','🍯','🥛','☕','🍵','🧃','🥤','🧋','🍶','🍺','🍻','🥂','🍷','🥃','🍸','🍹','🧉','🍾'],
  },
]

/* ------------------------------------------------------------------ */
/*  Utility helpers                                                    */
/* ------------------------------------------------------------------ */

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

/** Convert Firestore reactions map to sorted array */
function normalizeReactions(reactionsMap: Record<string, string[]>): Reaction[] {
  if (!reactionsMap || typeof reactionsMap !== 'object') return []
  return Object.entries(reactionsMap)
    .filter(([, users]) => Array.isArray(users) && users.length > 0)
    .map(([emoji, users]) => ({ emoji, users }))
    .sort((a, b) => b.users.length - a.users.length)
}

/** Highlight @mentions in message text */
function renderMessageText(text: string, currentUsername?: string) {
  const parts = text.split(/(@\w+)/g)
  return parts.map((part, i) => {
    if (part.startsWith('@')) {
      const isSelf = currentUsername && part.slice(1).toLowerCase() === currentUsername.toLowerCase()
      return (
        <span
          key={i}
          className={`font-medium rounded px-0.5 ${
            isSelf
              ? 'bg-yellow-500/20 text-yellow-400'
              : 'bg-primary/10 text-primary'
          }`}
        >
          {part}
        </span>
      )
    }
    return <span key={i}>{part}</span>
  })
}

/* ------------------------------------------------------------------ */
/*  Recently used emojis (localStorage)                                */
/* ------------------------------------------------------------------ */

const RECENT_EMOJIS_KEY = 'genztv-recent-emojis'
const MAX_RECENT = 24

function getRecentEmojis(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(RECENT_EMOJIS_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function addRecentEmoji(emoji: string): void {
  if (typeof window === 'undefined') return
  try {
    const recent = getRecentEmojis().filter(e => e !== emoji)
    recent.unshift(emoji)
    localStorage.setItem(RECENT_EMOJIS_KEY, JSON.stringify(recent.slice(0, MAX_RECENT)))
  } catch { /* silent */ }
}

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface ChatBoxProps {
  className?: string
  messagesMaxHeight?: string
  matchId?: string
  matchTitle?: string
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function ChatBox({ className, messagesMaxHeight = 'max-h-64', matchId, matchTitle }: ChatBoxProps) {
  /* ---- User identity ---- */
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [showUsernameModal, setShowUsernameModal] = useState(false)

  /* ---- Core chat state ---- */
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [cooldownMs, setCooldownMs] = useState(0)
  const [viewerCount, setViewerCount] = useState(0)
  const [profanityWarning, setProfanityWarning] = useState('')
  const [activeUsers, setActiveUsers] = useState<ActiveUser[]>([])

  /* ---- UI state ---- */
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [activeEmojiCategory, setActiveEmojiCategory] = useState(0)
  const [recentEmojis, setRecentEmojis] = useState<string[]>([])
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null)
  const [reactionPickerMsgId, setReactionPickerMsgId] = useState<string | null>(null)
  const [hoveredMsgId, setHoveredMsgId] = useState<string | null>(null)
  const [showNameEdit, setShowNameEdit] = useState(false)
  const [nameInput, setNameInput] = useState('')
  const [nameCheck, setNameCheck] = useState<{ checking: boolean; available: boolean | null; error: string }>({
    checking: false, available: null, error: '',
  })

  /* ---- @ mention state ---- */
  const [showMentions, setShowMentions] = useState(false)
  const [mentionFilter, setMentionFilter] = useState('')
  const [mentionStartIdx, setMentionStartIdx] = useState(-1)

  /* ---- Mobile swipe state ---- */
  const [swipeMsgId, setSwipeMsgId] = useState<string | null>(null)
  const [swipeOffset, setSwipeOffset] = useState(0)
  const swipeRef = useRef({ msgId: null as string | null, offset: 0 })

  /* ---- Auto-scroll state ---- */
  const [isNearBottom, setIsNearBottom] = useState(true)
  const [unreadCount, setUnreadCount] = useState(0)

  /* ---- Sound & notification state ---- */
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [showMentionPanel, setShowMentionPanel] = useState(false)
  const [mentionNotifs, setMentionNotifs] = useState<MentionNotification[]>([])
  const [unreadMentions, setUnreadMentions] = useState(0)

  /* ---- Highlight message (when jumping to reply) ---- */
  const [highlightMsgId, setHighlightMsgId] = useState<string | null>(null)

  /* ---- Refs ---- */
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const emojiPickerRef = useRef<HTMLDivElement>(null)
  const reactionPickerRef = useRef<HTMLDivElement>(null)
  const mentionDropdownRef = useRef<HTMLDivElement>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const touchStartRef = useRef<{ x: number; y: number; msgId: string } | null>(null)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const nameCheckTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const unsubRef = useRef<Unsubscribe | null>(null)
  const unsubViewerRef = useRef<Unsubscribe | null>(null)
  const unsubActiveRef = useRef<Unsubscribe | null>(null)
  const prevMsgCountRef = useRef(0)
  const soundEnabledRef = useRef(true)

  // Keep ref in sync with state
  useEffect(() => { soundEnabledRef.current = soundEnabled }, [soundEnabled])

  /* ---- Load sound preference from localStorage ---- */
  useEffect(() => {
    if (typeof window === 'undefined') return
    const pref = localStorage.getItem('genztv-chat-sound')
    if (pref === 'off') setSoundEnabled(false)
    // Load recent emojis
    setRecentEmojis(getRecentEmojis())
  }, [])

  /* ================================================================ */
  /*  Initialize user profile                                          */
  /* ================================================================ */

  useEffect(() => {
    const stored = getStoredProfile()
    if (stored) {
      setProfile(stored)
    } else {
      setShowUsernameModal(true)
    }
  }, [])

  const handleUsernameComplete = useCallback((p: UserProfile) => {
    setProfile(p)
    setShowUsernameModal(false)
  }, [])

  /* ================================================================ */
  /*  Firestore listeners                                              */
  /* ================================================================ */

  useEffect(() => {
    // Clean up previous listeners
    if (unsubRef.current) unsubRef.current()
    if (unsubViewerRef.current) unsubViewerRef.current()
    if (unsubActiveRef.current) unsubActiveRef.current()
    unsubRef.current = null
    unsubViewerRef.current = null
    unsubActiveRef.current = null
    stopHeartbeat()

    // No matchId → no chat
    if (!matchId || !profile) {
      setMessages([])
      setViewerCount(0)
      setActiveUsers([])
      return
    }

    // Start heartbeat for presence
    startHeartbeat(matchId, profile)

    // Periodic cleanup of stale users (every 2 min)
    const cleanupTimer = setInterval(() => {
      cleanupStaleUsers(matchId)
    }, 2 * 60 * 1000)
    // Run once immediately
    cleanupStaleUsers(matchId)

    // Listen to messages
    const unsub = listenToMessages(
      matchId,
      (firestoreMsgs) => {
        const prevLen = prevMsgCountRef.current
        const converted: ChatMessage[] = firestoreMsgs.map((m, i) => ({
          id: m.id,
          uid: m.uid,
          user: m.username,
          text: m.text,
          time: formatTime(m.timestamp),
          color: m.userColor,
          reactions: normalizeReactions(m.reactions),
          replyTo: m.replyTo ? { msgId: m.replyTo.msgId, username: m.replyTo.username, text: m.replyTo.text } : null,
          timestamp: m.timestamp,
          isNew: i >= prevLen && prevLen > 0,  // only new messages get animation
        }))
        prevMsgCountRef.current = firestoreMsgs.length
        setMessages(converted)

        // Check for mentions and play sound
        if (prevLen > 0 && profile) {
          const newMsgs = firestoreMsgs.slice(prevLen)
          for (const msg of newMsgs) {
            const mentions = extractMentions(msg.text)
            if (mentions.map(m => m.toLowerCase()).includes(profile.username.toLowerCase())) {
              // Save mention notification
              saveMentionNotification({
                id: `${msg.id}-${Date.now()}`,
                fromUser: msg.username,
                fromUserColor: msg.userColor,
                text: msg.text,
                matchId: matchId!,
                matchTitle: matchTitle || matchId!,
                timestamp: Date.now(),
                read: false,
              })
              setUnreadMentions(getUnreadMentionCount())
              // Play mention sound
              if (soundEnabledRef.current) playChatSound('mention')
              break
            } else {
              // Play normal message sound
              if (soundEnabledRef.current && msg.uid !== profile.uid) playChatSound('message')
            }
          }
        }
      },
    )
    unsubRef.current = unsub

    // Listen to viewer count
    const unsubViewer = listenToViewerCount(matchId, (count) => {
      setViewerCount(count)
    })
    unsubViewerRef.current = unsubViewer

    // Listen to active users
    const unsubActive = listenToActiveUsers(matchId, (users) => {
      setActiveUsers(users)
    })
    unsubActiveRef.current = unsubActive

    // Cleanup on unmount
    return () => {
      unsub()
      unsubViewer()
      unsubActive()
      stopHeartbeat()
      clearInterval(cleanupTimer)
      if (profile && matchId) removePresence(matchId, profile.uid)
    }
  }, [matchId, profile, matchTitle])

  /* ================================================================ */
  /*  Auto-scroll with smart detection                                 */
  /* ================================================================ */

  const checkNearBottom = useCallback(() => {
    const el = messagesContainerRef.current
    if (!el) return
    const threshold = 150
    setIsNearBottom(el.scrollHeight - el.scrollTop - el.clientHeight < threshold)
  }, [])

  useEffect(() => {
    if (isNearBottom) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    } else {
      setUnreadCount(prev => prev + 1)
    }
  }, [messages.length, isNearBottom])

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    setUnreadCount(0)
    setIsNearBottom(true)
  }, [])

  /** Scroll to a specific message by ID (for reply thread navigation) */
  const scrollToMessage = useCallback((msgId: string) => {
    const el = document.getElementById(`msg-${msgId}`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setHighlightMsgId(msgId)
      // Remove highlight after 2 seconds
      setTimeout(() => setHighlightMsgId(null), 2000)
    }
  }, [])

  /* ================================================================ */
  /*  Close pickers on outside click                                   */
  /* ================================================================ */

  useEffect(() => {
    if (!reactionPickerMsgId) return
    const handler = (e: MouseEvent) => {
      if (reactionPickerRef.current && !reactionPickerRef.current.contains(e.target as Node)) {
        setReactionPickerMsgId(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [reactionPickerMsgId])

  useEffect(() => {
    if (!showEmojiPicker) return
    const handler = (e: MouseEvent) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target as Node)) {
        setShowEmojiPicker(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showEmojiPicker])

  useEffect(() => {
    if (!showMentions) return
    const handler = (e: MouseEvent) => {
      if (mentionDropdownRef.current && !mentionDropdownRef.current.contains(e.target as Node)) {
        setShowMentions(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showMentions])

  useEffect(() => {
    if (showNameEdit) setTimeout(() => nameInputRef.current?.focus(), 100)
  }, [showNameEdit])

  /* ================================================================ */
  /*  Cooldown timer                                                   */
  /* ================================================================ */

  useEffect(() => {
    if (cooldownMs <= 0) return
    const timer = setInterval(() => {
      setCooldownMs(prev => {
        const next = prev - 100
        return next <= 0 ? 0 : next
      })
    }, 100)
    return () => clearInterval(timer)
  }, [cooldownMs > 0])

  /* ================================================================ */
  /*  Refresh mention notifications periodically                        */
  /* ================================================================ */

  useEffect(() => {
    const refresh = () => {
      setMentionNotifs(getMentionNotifications())
      setUnreadMentions(getUnreadMentionCount())
    }
    refresh()
    const timer = setInterval(refresh, 5000)
    return () => clearInterval(timer)
  }, [])

  /* ================================================================ */
  /*  Handlers                                                         */
  /* ================================================================ */

  /** Send a chat message */
  const handleSend = useCallback(async () => {
    if (!input.trim() || !profile || !matchId) return

    // Rate limit check
    const rateCheck = canSendMessage()
    if (!rateCheck.ok) {
      setCooldownMs(rateCheck.remainingMs)
      return
    }

    // Profanity check
    if (containsProfanity(input)) {
      setProfanityWarning('⚠️ Your message contains inappropriate language')
      return
    }

    setProfanityWarning('')
    setSending(true)

    try {
      await sendMessage(
        matchId,
        profile,
        input.trim(),
        replyingTo ? { msgId: replyingTo.id, username: replyingTo.user, text: replyingTo.text } : null,
      )
      markMessageSent()
      if (soundEnabledRef.current) playChatSound('send')
      setInput('')
      setReplyingTo(null)
      setShowEmojiPicker(false)
      setShowMentions(false)
      inputRef.current?.focus()
    } catch (err) {
      // Silent fail
    } finally {
      setSending(false)
    }
  }, [input, profile, matchId, replyingTo])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend],
  )

  const handleEmojiClick = useCallback((emoji: string) => {
    setInput(prev => prev + emoji)
    addRecentEmoji(emoji)
    setRecentEmojis(getRecentEmojis())
    inputRef.current?.focus()
  }, [])

  /** Toggle a reaction on a message */
  const handleReaction = useCallback(
    async (msgId: string, emoji: string) => {
      if (!profile || !matchId) return
      try {
        await toggleReaction(matchId, msgId, emoji, profile.uid)
      } catch { /* silent */ }
      setReactionPickerMsgId(null)
    },
    [profile, matchId],
  )

  /** Set a message as the reply target */
  const handleReply = useCallback((msg: ChatMessage) => {
    setReplyingTo(msg)
    inputRef.current?.focus()
  }, [])

  /* ---- Input change with @ mention detection ---- */
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setInput(value)
    setProfanityWarning('')

    const cursorPos = e.target.selectionStart ?? value.length

    let atIdx = -1
    for (let i = cursorPos - 1; i >= 0; i--) {
      if (value[i] === '@') { atIdx = i; break }
      if (value[i] === ' ') break
    }

    if (atIdx >= 0) {
      const filter = value.substring(atIdx + 1, cursorPos)
      setMentionFilter(filter)
      setMentionStartIdx(atIdx)
      setShowMentions(true)
    } else {
      setShowMentions(false)
    }
  }, [])

  /** Select a user from the @ mention dropdown */
  const handleMentionSelect = useCallback(
    (userName: string) => {
      if (mentionStartIdx < 0) return
      let endIdx = mentionStartIdx + 1
      while (endIdx < input.length && input[endIdx] !== ' ') endIdx++
      const next = input.substring(0, mentionStartIdx) + '@' + userName + ' ' + input.substring(endIdx)
      setInput(next)
      setShowMentions(false)
      inputRef.current?.focus()
    },
    [input, mentionStartIdx],
  )

  /* ---- Mobile touch: long-press → reaction, swipe-right → reply ---- */
  const onMsgTouchStart = useCallback((msgId: string, e: React.TouchEvent) => {
    const t = e.touches[0]
    touchStartRef.current = { x: t.clientX, y: t.clientY, msgId }

    longPressTimer.current = setTimeout(() => {
      setReactionPickerMsgId(msgId)
      touchStartRef.current = null
      setSwipeMsgId(null)
      setSwipeOffset(0)
      swipeRef.current = { msgId: null, offset: 0 }
      if (navigator.vibrate) navigator.vibrate(50)
    }, 500)
  }, [])

  const onMsgTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchStartRef.current) return
    const t = e.touches[0]
    const dx = t.clientX - touchStartRef.current.x
    const dy = t.clientY - touchStartRef.current.y

    if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 10) {
      if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null }
      touchStartRef.current = null
      setSwipeMsgId(null); setSwipeOffset(0)
      swipeRef.current = { msgId: null, offset: 0 }
      return
    }

    if (dx > 15) {
      if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null }
      const offset = Math.min(dx, 80)
      setSwipeMsgId(touchStartRef.current.msgId)
      setSwipeOffset(offset)
      swipeRef.current = { msgId: touchStartRef.current.msgId, offset }
    }
  }, [])

  const onMsgTouchEnd = useCallback(() => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null }

    const { msgId, offset } = swipeRef.current
    if (msgId && offset > 40) {
      const msg = messages.find(m => m.id === msgId)
      if (msg) handleReply(msg)
    }

    touchStartRef.current = null
    setSwipeMsgId(null); setSwipeOffset(0)
    swipeRef.current = { msgId: null, offset: 0 }
  }, [messages, handleReply])

  /* ---- Name edit handlers (Settings) ---- */
  const handleNameSave = useCallback(async () => {
    const trimmed = nameInput.trim()
    if (!trimmed || !profile) return

    if (trimmed === profile.username) {
      setShowNameEdit(false)
      return
    }

    const regex = /^[a-zA-Z0-9_]+$/
    if (trimmed.length < 3 || trimmed.length > 20 || !regex.test(trimmed)) return

    const available = await checkUsernameAvailable(trimmed)
    if (!available) return

    await registerUsername(trimmed, profile.uid)
    updateProfileUsername(trimmed)
    setProfile(prev => prev ? { ...prev, username: trimmed } : null)
    setShowNameEdit(false)
    setNameInput('')
  }, [nameInput, profile])

  const handleNameKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); handleNameSave() }
    if (e.key === 'Escape') { setShowNameEdit(false); setNameInput('') }
  }, [handleNameSave])

  const handleNameInputChange = useCallback((val: string) => {
    setNameInput(val)
    setNameCheck({ checking: false, available: null, error: '' })

    if (nameCheckTimer.current) clearTimeout(nameCheckTimer.current)

    const regex = /^[a-zA-Z0-9_]+$/
    if (val.length < 3 || val.length > 20 || !regex.test(val)) {
      setNameCheck(prev => ({ ...prev, error: '3–20 chars, letters/numbers/underscore' }))
      return
    }

    setNameCheck(prev => ({ ...prev, checking: true }))
    nameCheckTimer.current = setTimeout(async () => {
      const available = await checkUsernameAvailable(val)
      setNameCheck({ checking: false, available, error: available ? '' : 'Already taken' })
    }, 400)
  }, [])

  /* ---- Sound toggle ---- */
  const toggleSound = useCallback(() => {
    setSoundEnabled(prev => {
      const next = !prev
      localStorage.setItem('genztv-chat-sound', next ? 'on' : 'off')
      return next
    })
  }, [])

  /* ---- Mentionable users list ---- */
  const mentionableUsers = useMemo(() => {
    const unique = [...new Set(activeUsers.map(u => u.username))]
    return unique
      .filter(u => u !== profile?.username)
      .filter(u => u.toLowerCase().includes(mentionFilter.toLowerCase()))
      .slice(0, 6)
  }, [activeUsers, profile?.username, mentionFilter])

  /* ================================================================ */
  /*  Render                                                           */
  /* ================================================================ */

  // No matchId → chat hidden entirely
  if (!matchId) return null

  // Show username modal if no profile
  if (showUsernameModal || !profile) {
    return <UsernameModal onComplete={handleUsernameComplete} />
  }

  const isSendDisabled = !input.trim() || sending || cooldownMs > 0

  return (
    <div
      className={`bg-card border border-border rounded-xl overflow-hidden flex flex-col relative ${className || ''}`}
    >
      {/* ───── Chat Header ───── */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-secondary/30">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Live Chat</span>
        </div>
        <div className="flex items-center gap-2">
          {/* Viewer count */}
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Users className="h-3 w-3" />
            <span>{viewerCount > 0 ? viewerCount : ''}</span>
          </div>
          {/* Sound toggle */}
          <button
            onClick={toggleSound}
            className="h-6 w-6 flex items-center justify-center rounded-md hover:bg-secondary transition-colors"
            title={soundEnabled ? 'Mute sounds' : 'Unmute sounds'}
            aria-label={soundEnabled ? 'Mute sounds' : 'Unmute sounds'}
          >
            {soundEnabled ? (
              <Volume2 className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <VolumeX className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </button>
          {/* Mention bell */}
          <button
            onClick={() => {
              setShowMentionPanel(prev => !prev)
              if (!showMentionPanel) {
                markAllMentionsRead()
                setUnreadMentions(0)
              }
            }}
            className="h-6 w-6 flex items-center justify-center rounded-md hover:bg-secondary transition-colors relative"
            title="Mentions"
            aria-label="Mentions"
          >
            {unreadMentions > 0 ? (
              <Bell className="h-3.5 w-3.5 text-primary" />
            ) : (
              <BellOff className="h-3.5 w-3.5 text-muted-foreground" />
            )}
            {unreadMentions > 0 && (
              <span className="absolute -top-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-destructive text-destructive-foreground text-[8px] font-bold flex items-center justify-center">
                {unreadMentions > 9 ? '9+' : unreadMentions}
              </span>
            )}
          </button>
          {/* Settings */}
          <button
            onClick={() => { setShowNameEdit(true); setNameInput(profile.username) }}
            className="h-6 w-6 flex items-center justify-center rounded-md hover:bg-secondary transition-colors"
            title="Chat settings"
            aria-label="Chat settings"
          >
            <Settings className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* ───── Mention Notification Panel ───── */}
      {showMentionPanel && (
        <div className="border-b border-border bg-popover p-2 max-h-40 overflow-y-auto scrollbar-thin">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-muted-foreground">Mentions</span>
            {mentionNotifs.length > 0 && (
              <button
                onClick={() => {
                  localStorage.removeItem('genztv-mention-notifications')
                  setMentionNotifs([])
                  setUnreadMentions(0)
                }}
                className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
              >
                Clear all
              </button>
            )}
          </div>
          {mentionNotifs.length === 0 ? (
            <p className="text-[10px] text-muted-foreground/60 text-center py-2">No mentions yet</p>
          ) : (
            <div className="space-y-1">
              {mentionNotifs.slice(0, 10).map(n => (
                <div
                  key={n.id}
                  className={`flex items-start gap-2 px-2 py-1.5 rounded-md text-xs ${
                    n.read ? 'opacity-60' : 'bg-secondary/40'
                  }`}
                >
                  <span className="font-semibold shrink-0" style={{ color: n.fromUserColor }}>
                    @{n.fromUser}
                  </span>
                  <span className="text-foreground/80 truncate">{n.text}</span>
                  <span className="text-[9px] text-muted-foreground shrink-0 ml-auto">
                    {formatTime(n.timestamp)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ───── Name Edit Overlay ───── */}
      {showNameEdit && (
        <div className="absolute inset-0 z-30 bg-background/95 backdrop-blur-sm flex flex-col items-center justify-center p-4">
          <h3 className="text-sm font-semibold mb-3">Change Username</h3>
          <div className="relative w-full max-w-xs mb-2">
            <Input
              ref={nameInputRef}
              value={nameInput}
              onChange={e => handleNameInputChange(e.target.value)}
              onKeyDown={handleNameKeyDown}
              placeholder="New username..."
              maxLength={20}
              className="h-9 text-sm pr-9"
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2">
              {nameCheck.checking ? (
                <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" />
              ) : nameCheck.available === true ? (
                <span className="text-emerald-500 text-xs">✓</span>
              ) : nameCheck.available === false ? (
                <span className="text-destructive text-xs">✗</span>
              ) : null}
            </div>
          </div>
          {nameCheck.error && <p className="text-[10px] text-destructive mb-2">{nameCheck.error}</p>}
          {nameCheck.available === true && !nameCheck.error && (
            <p className="text-[10px] text-emerald-500 mb-2">Available!</p>
          )}
          <p className="text-[10px] text-muted-foreground mb-3">
            Changing name only affects future messages
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => { setShowNameEdit(false); setNameInput('') }}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleNameSave}
              disabled={!nameCheck.available && nameInput !== profile.username}
              className="btn-press"
            >
              Save
            </Button>
          </div>
        </div>
      )}

      {/* ───── Messages ───── */}
      <div
        ref={messagesContainerRef}
        className={`flex-1 overflow-y-auto ${messagesMaxHeight} p-3 space-y-1 scrollbar-thin relative`}
        onScroll={() => { checkNearBottom(); setReactionPickerMsgId(null) }}
      >
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <MessageCircle className="h-8 w-8 text-muted-foreground/30 mb-2" />
            <p className="text-xs text-muted-foreground">No messages yet</p>
            <p className="text-[10px] text-muted-foreground/60">Be the first to say something!</p>
          </div>
        )}

        {messages.map(msg => {
          const isSwiping = swipeMsgId === msg.id
          const isHovered = hoveredMsgId === msg.id
          const showPicker = reactionPickerMsgId === msg.id
          const isOwn = profile && msg.uid === profile.uid
          const isHighlighted = highlightMsgId === msg.id

          return (
            <div
              key={msg.id}
              id={`msg-${msg.id}`}
              className={`group relative rounded-lg px-2 py-1 transition-all duration-200 lg:transition-colors ${
                isHovered ? 'bg-secondary/20' : ''
              } ${isHighlighted ? 'bg-primary/10 ring-1 ring-primary/30' : ''} ${
                isOwn ? 'ml-4 bg-primary/5' : ''
              } ${msg.isNew ? 'animate-in slide-in-from-bottom-2 duration-300' : ''}`}
              style={isSwiping ? { transform: `translateX(${Math.min(swipeOffset * 0.4, 30)}px)` } : undefined}
              onMouseEnter={() => setHoveredMsgId(msg.id)}
              onMouseLeave={() => { setHoveredMsgId(null); setReactionPickerMsgId(null) }}
              onTouchStart={e => onMsgTouchStart(msg.id, e)}
              onTouchMove={onMsgTouchMove}
              onTouchEnd={onMsgTouchEnd}
            >
              {/* Mobile swipe: reply icon indicator */}
              {isSwiping && swipeOffset > 20 && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-full pr-2 flex items-center">
                  <Reply className="h-4 w-4 text-primary" />
                </div>
              )}

              {/* Reply indicator — clickable to scroll to original */}
              {msg.replyTo && (
                <button
                  onClick={() => { if (msg.replyTo) scrollToMessage(msg.replyTo.msgId) }}
                  className="flex items-center gap-1.5 mb-0.5 pl-2 border-l-2 border-primary/40 w-full text-left hover:bg-primary/5 rounded-sm transition-colors"
                >
                  <span className="text-[10px] text-primary/80 font-medium truncate max-w-[80px]">
                    {msg.replyTo.username}
                  </span>
                  <span className="text-[10px] text-muted-foreground truncate max-w-[120px]">
                    {msg.replyTo.text}
                  </span>
                </button>
              )}

              {/* Message body — inline layout with action buttons next to text */}
              <div className="flex items-start gap-1 text-sm leading-tight relative">
                {!isOwn && (
                  <span className="font-semibold text-xs shrink-0" style={{ color: msg.color }}>
                    {msg.user}
                  </span>
                )}
                {!isOwn && <span className="text-muted-foreground text-xs shrink-0">:</span>}
                <span className="text-foreground/90 text-xs break-words">
                  {renderMessageText(msg.text, profile?.username)}
                </span>

                {/* ── PC hover: inline action buttons right after text ── */}
                {isHovered && !showPicker && (
                  <span className="hidden lg:inline-flex items-center gap-0 ml-1 shrink-0 animate-in fade-in duration-100">
                    <button
                      onClick={e => { e.stopPropagation(); setReactionPickerMsgId(msg.id) }}
                      className="h-5 w-5 flex items-center justify-center rounded hover:bg-secondary transition-colors"
                      title="React"
                    >
                      <Smile className="h-3 w-3 text-muted-foreground" />
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); handleReply(msg) }}
                      className="h-5 w-5 flex items-center justify-center rounded hover:bg-secondary transition-colors"
                      title="Reply"
                    >
                      <Reply className="h-3 w-3 text-muted-foreground" />
                    </button>
                  </span>
                )}
              </div>

              {/* Own message timestamp badge */}
              {isOwn && isHovered && (
                <div className="flex justify-end">
                  <span className="text-[9px] text-muted-foreground/60">{msg.time} · You</span>
                </div>
              )}

              {/* Reactions row */}
              {msg.reactions.length > 0 && (
                <div className="flex gap-1 mt-0.5 flex-wrap">
                  {msg.reactions.map(r => {
                    const hasMine = profile && r.users.includes(profile.uid)
                    return (
                      <button
                        key={r.emoji}
                        onClick={() => handleReaction(msg.id, r.emoji)}
                        className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] transition-all duration-200 ${
                          hasMine
                            ? 'bg-primary/15 border border-primary/30'
                            : 'bg-secondary/60 border border-border/50'
                        } hover:bg-secondary hover:scale-105`}
                      >
                        <span className="text-xs">{r.emoji}</span>
                        {r.users.length > 1 && (
                          <span className="text-muted-foreground">{r.users.length}</span>
                        )}
                      </button>
                    )
                  })}
                </div>
              )}

              {/* ── Reaction Picker (above the message) ── */}
              {showPicker && (
                <div
                  ref={reactionPickerRef}
                  className="absolute -top-10 left-2 z-50 flex items-center gap-0.5 bg-popover border border-border rounded-full shadow-xl px-2 py-1 animate-in fade-in zoom-in-95 duration-150"
                >
                  {REACTIONS.map(r => (
                    <button
                      key={r.emoji}
                      onClick={() => handleReaction(msg.id, r.emoji)}
                      className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-secondary transition-transform hover:scale-125 text-lg"
                      title={r.label}
                    >
                      {r.emoji}
                    </button>
                  ))}
                </div>
              )}

              {/* Timestamp on hover (non-own messages) */}
              {isHovered && !isOwn && (
                <span className="absolute -top-0.5 right-1 text-[9px] text-muted-foreground/60">
                  {msg.time}
                </span>
              )}
            </div>
          )
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* ───── Unread messages pill ───── */}
      {!isNearBottom && unreadCount > 0 && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-16 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 px-3 py-1.5 rounded-full bg-primary text-primary-foreground text-xs font-medium shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-200 btn-press"
        >
          <ChevronUp className="h-3 w-3" />
          <span>{unreadCount} new{unreadCount > 1 ? 's' : ''}</span>
        </button>
      )}

      {/* ───── Mention Dropdown ───── */}
      {showMentions && mentionableUsers.length > 0 && (
        <div
          ref={mentionDropdownRef}
          className="border-t border-border bg-popover p-1 max-h-32 overflow-y-auto"
        >
          {mentionableUsers.map(u => (
            <button
              key={u}
              onClick={() => handleMentionSelect(u)}
              className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-secondary transition-colors flex items-center gap-2"
            >
              <Hash className="h-3 w-3 text-muted-foreground" />
              <span className="font-medium text-primary">@{u}</span>
            </button>
          ))}
        </div>
      )}

      {/* ───── Reply preview bar ───── */}
      {replyingTo && (
        <div className="flex items-center gap-2 px-3 py-1.5 border-t border-border bg-secondary/20 animate-in slide-in-from-bottom-1 duration-200">
          <div className="flex-1 min-w-0 flex items-center gap-1.5">
            <Reply className="h-3 w-3 text-primary shrink-0" />
            <button
              onClick={() => scrollToMessage(replyingTo.id)}
              className="text-[10px] text-primary font-medium shrink-0 hover:underline"
            >
              {replyingTo.user}
            </button>
            <span className="text-[10px] text-muted-foreground truncate">
              {replyingTo.text}
            </span>
          </div>
          <button
            onClick={() => setReplyingTo(null)}
            className="shrink-0 p-0.5 rounded hover:bg-secondary transition-colors"
          >
            <X className="h-3 w-3 text-muted-foreground" />
          </button>
        </div>
      )}

      {/* ───── Emoji Picker ───── */}
      {showEmojiPicker && (
        <div ref={emojiPickerRef} className="border-t border-border bg-background p-2 animate-in slide-in-from-bottom-2 duration-200">
          {/* Recent emojis */}
          {recentEmojis.length > 0 && (
            <div className="mb-2">
              <span className="text-[9px] text-muted-foreground font-medium px-1">Recent</span>
              <div className="grid grid-cols-8 gap-0.5 mt-0.5">
                {recentEmojis.slice(0, 16).map((emoji, i) => (
                  <button
                    key={`recent-${i}`}
                    onClick={() => handleEmojiClick(emoji)}
                    className="h-7 w-7 flex items-center justify-center hover:bg-secondary rounded transition-colors text-sm"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          )}
          {/* Category tabs */}
          <div className="flex gap-1 mb-2 overflow-x-auto scrollbar-none pb-1">
            {emojiCategories.map((cat, i) => (
              <button
                key={cat.name}
                onClick={() => setActiveEmojiCategory(i)}
                className={`px-2 py-1 rounded text-[10px] font-medium whitespace-nowrap transition-colors ${
                  activeEmojiCategory === i
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>
          {/* Emoji grid */}
          <div className="grid grid-cols-8 gap-0.5 max-h-32 overflow-y-auto scrollbar-thin">
            {emojiCategories[activeEmojiCategory].emojis.map((emoji, i) => (
              <button
                key={i}
                onClick={() => handleEmojiClick(emoji)}
                className="h-8 w-8 flex items-center justify-center hover:bg-secondary rounded transition-colors text-base"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ───── Input Area ───── */}
      <div className="flex items-center gap-1.5 p-2 border-t border-border bg-secondary/20">
        {/* Username badge */}
        <button
          onClick={() => { setShowNameEdit(true); setNameInput(profile.username) }}
          className="shrink-0 flex items-center gap-0.5 px-1.5 py-1 rounded-md border hover:opacity-80 transition-colors"
          style={{ borderColor: profile.color + '40', background: profile.color + '15' }}
          title="Click to change name"
        >
          <span className="text-[10px] font-semibold max-w-[60px] truncate" style={{ color: profile.color }}>
            {profile.username}
          </span>
          <Pencil className="h-2.5 w-2.5 opacity-50" style={{ color: profile.color }} />
        </button>
        <button
          onClick={() => setShowEmojiPicker(prev => !prev)}
          className={`h-8 w-8 shrink-0 flex items-center justify-center rounded-md transition-colors ${
            showEmojiPicker
              ? 'bg-primary text-primary-foreground'
              : 'hover:bg-secondary text-muted-foreground'
          }`}
        >
          <Smile className="h-4 w-4" />
        </button>
        <div className="flex-1 relative">
          <Input
            ref={inputRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Say something... (@ to mention)"
            className="h-8 text-xs bg-background border-border pr-16"
            maxLength={MAX_MESSAGE_LENGTH}
          />
          {/* Character count + cooldown */}
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {cooldownMs > 0 && (
              <span className="text-[9px] text-amber-500 font-medium">
                {(cooldownMs / 1000).toFixed(1)}s
              </span>
            )}
            {input.length > MAX_MESSAGE_LENGTH * 0.8 && (
              <span className={`text-[9px] ${input.length >= MAX_MESSAGE_LENGTH ? 'text-destructive' : 'text-muted-foreground'}`}>
                {input.length}/{MAX_MESSAGE_LENGTH}
              </span>
            )}
          </div>
        </div>
        <Button
          size="icon"
          onClick={handleSend}
          disabled={isSendDisabled}
          className="h-8 w-8 shrink-0 btn-press"
        >
          {sending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Send className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>

      {/* ───── Profanity warning ───── */}
      {profanityWarning && (
        <div className="px-3 py-1.5 bg-destructive/10 border-t border-destructive/20 text-[10px] text-destructive font-medium animate-in fade-in duration-200">
          {profanityWarning}
        </div>
      )}
    </div>
  )
}
