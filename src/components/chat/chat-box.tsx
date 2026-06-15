'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Send, MessageCircle, Users, Smile, Reply, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Reaction {
  emoji: string
  users: string[]
}

interface ReplyInfo {
  id: string
  user: string
  text: string
}

interface ChatMessage {
  id: string
  user: string
  text: string
  time: string
  color: string
  reactions: Reaction[]
  replyTo?: ReplyInfo
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const STORAGE_KEY = 'genztv-chat-username'
const BRAND_PREFIX = 'GenZTV'

const userColors = [
  'text-emerald-400',
  'text-amber-400',
  'text-cyan-400',
  'text-pink-400',
  'text-violet-400',
  'text-rose-400',
  'text-teal-400',
  'text-orange-400',
]

const REACTIONS = [
  { emoji: '👍', label: 'Like' },
  { emoji: '🥰', label: 'Care' },
  { emoji: '😂', label: 'Haha' },
  { emoji: '😡', label: 'Angry' },
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

function generateId(): string {
  return Math.random().toString(36).substring(2, 9)
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function getStoredUsername(): string {
  if (typeof window === 'undefined') return ''
  return localStorage.getItem(STORAGE_KEY) || ''
}

function setStoredUsername(name: string) {
  if (typeof window === 'undefined') return
  localStorage.setItem(STORAGE_KEY, name)
}

function getUserColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return userColors[Math.abs(hash) % userColors.length]
}

function generateUsername(): string {
  const num = Math.floor(1000 + Math.random() * 9000)
  return `${BRAND_PREFIX}${num}`
}

/** Highlight @mentions in message text */
function renderMessageText(text: string) {
  const parts = text.split(/(@\w+)/g)
  return parts.map((part, i) => {
    if (part.startsWith('@')) {
      return (
        <span key={i} className="text-primary font-medium bg-primary/10 rounded px-0.5">
          {part}
        </span>
      )
    }
    return <span key={i}>{part}</span>
  })
}

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface ChatBoxProps {
  className?: string
  messagesMaxHeight?: string
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function ChatBox({ className, messagesMaxHeight = 'max-h-64' }: ChatBoxProps) {
  /* ---- core state ---- */
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [username, setUsername] = useState(() => getStoredUsername())
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [activeEmojiCategory, setActiveEmojiCategory] = useState(0)
  const [onlineCount] = useState(() => Math.floor(Math.random() * 200) + 50)

  /* ---- reply state ---- */
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null)

  /* ---- reaction picker state ---- */
  const [reactionPickerMsgId, setReactionPickerMsgId] = useState<string | null>(null)

  /* ---- PC hover state ---- */
  const [hoveredMsgId, setHoveredMsgId] = useState<string | null>(null)

  /* ---- @ mention state ---- */
  const [showMentions, setShowMentions] = useState(false)
  const [mentionFilter, setMentionFilter] = useState('')
  const [mentionStartIdx, setMentionStartIdx] = useState(-1)

  /* ---- mobile swipe state ---- */
  const [swipeMsgId, setSwipeMsgId] = useState<string | null>(null)
  const [swipeOffset, setSwipeOffset] = useState(0)
  const swipeRef = useRef({ msgId: null as string | null, offset: 0 })

  /* ---- refs ---- */
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const emojiPickerRef = useRef<HTMLDivElement>(null)
  const reactionPickerRef = useRef<HTMLDivElement>(null)
  const mentionDropdownRef = useRef<HTMLDivElement>(null)
  const touchStartRef = useRef<{ x: number; y: number; msgId: string } | null>(null)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  /* ================================================================ */
  /*  Effects                                                          */
  /* ================================================================ */

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Close reaction picker on outside click
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

  // Close emoji picker on outside click
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

  // Close mention dropdown on outside click
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

  /* ================================================================ */
  /*  Handlers                                                         */
  /* ================================================================ */

  /** Auto-generate username on first send */
  const ensureUsername = useCallback(() => {
    if (username) return username
    const name = generateUsername()
    setUsername(name)
    setStoredUsername(name)
    return name
  }, [username])

  /** Send a chat message */
  const handleSend = useCallback(() => {
    if (!input.trim()) return
    const name = ensureUsername()

    const msg: ChatMessage = {
      id: generateId(),
      user: name,
      text: input.trim(),
      time: formatTime(new Date()),
      color: getUserColor(name),
      reactions: [],
      replyTo: replyingTo
        ? { id: replyingTo.id, user: replyingTo.user, text: replyingTo.text }
        : undefined,
    }

    setMessages(prev => {
      const next = [...prev, msg]
      if (next.length > 100) next.shift()
      return next
    })
    setInput('')
    setReplyingTo(null)
    setShowEmojiPicker(false)
    setShowMentions(false)
    inputRef.current?.focus()
  }, [input, replyingTo, ensureUsername])

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
    inputRef.current?.focus()
  }, [])

  /** Toggle a reaction on a message */
  const handleReaction = useCallback(
    (msgId: string, emoji: string) => {
      const name = username || ensureUsername()
      setMessages(prev =>
        prev.map(msg => {
          if (msg.id !== msgId) return msg
          const existing = msg.reactions.find(r => r.emoji === emoji)
          let next: Reaction[]
          if (existing) {
            if (existing.users.includes(name)) {
              const filtered = existing.users.filter(u => u !== name)
              if (filtered.length === 0) {
                next = msg.reactions.filter(r => r.emoji !== emoji)
              } else {
                next = msg.reactions.map(r =>
                  r.emoji === emoji ? { ...r, users: filtered } : r,
                )
              }
            } else {
              next = msg.reactions.map(r =>
                r.emoji === emoji ? { ...r, users: [...r.users, name] } : r,
              )
            }
          } else {
            next = [...msg.reactions, { emoji, users: [name] }]
          }
          return { ...msg, reactions: next }
        }),
      )
      setReactionPickerMsgId(null)
    },
    [username, ensureUsername],
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

    const cursorPos = e.target.selectionStart ?? value.length
    let atIdx = -1
    for (let i = cursorPos - 1; i >= 0; i--) {
      if (value[i] === '@') {
        atIdx = i
        break
      }
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

    // start long-press timer (500 ms)
    longPressTimer.current = setTimeout(() => {
      setReactionPickerMsgId(msgId)
      touchStartRef.current = null
      setSwipeMsgId(null)
      setSwipeOffset(0)
      swipeRef.current = { msgId: null, offset: 0 }
    }, 500)
  }, [])

  const onMsgTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchStartRef.current) return
    const t = e.touches[0]
    const dx = t.clientX - touchStartRef.current.x
    const dy = t.clientY - touchStartRef.current.y

    // Scrolling vertically → cancel everything
    if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 10) {
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current)
        longPressTimer.current = null
      }
      touchStartRef.current = null
      setSwipeMsgId(null)
      setSwipeOffset(0)
      swipeRef.current = { msgId: null, offset: 0 }
      return
    }

    // Horizontal swipe right → cancel long-press, show swipe
    if (dx > 15) {
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current)
        longPressTimer.current = null
      }
      const offset = Math.min(dx, 80)
      setSwipeMsgId(touchStartRef.current.msgId)
      setSwipeOffset(offset)
      swipeRef.current = { msgId: touchStartRef.current.msgId, offset }
    }
  }, [])

  const onMsgTouchEnd = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }

    const { msgId, offset } = swipeRef.current
    if (msgId && offset > 40) {
      setMessages(prev => {
        const msg = prev.find(m => m.id === msgId)
        if (msg) handleReply(msg)
        return prev
      })
    }

    touchStartRef.current = null
    setSwipeMsgId(null)
    setSwipeOffset(0)
    swipeRef.current = { msgId: null, offset: 0 }
  }, [handleReply])

  /* ---- Mentionable users list ---- */
  const mentionableUsers = useMemo(() => {
    const unique = [...new Set(messages.map(m => m.user))]
    return unique
      .filter(u => u !== username)
      .filter(u => u.toLowerCase().includes(mentionFilter.toLowerCase()))
      .slice(0, 5)
  }, [messages, username, mentionFilter])

  /* ================================================================ */
  /*  Render                                                           */
  /* ================================================================ */

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
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Users className="h-3 w-3" />
          <span>{onlineCount}</span>
        </div>
      </div>

      {/* ───── Messages ───── */}
      <div
        className={`flex-1 overflow-y-auto ${messagesMaxHeight} p-3 space-y-1 scrollbar-thin`}
        onScroll={() => setReactionPickerMsgId(null)}
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

          return (
            <div
              key={msg.id}
              id={`msg-${msg.id}`}
              className={`group relative rounded-lg px-2 py-1 transition-transform lg:transition-colors ${
                isHovered ? 'bg-secondary/20' : ''
              }`}
              style={isSwiping ? { transform: `translateX(${Math.min(swipeOffset * 0.4, 30)}px)` } : undefined}
              onMouseEnter={() => setHoveredMsgId(msg.id)}
              onMouseLeave={() => setHoveredMsgId(null)}
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

              {/* Reply indicator (shows which message this is replying to) */}
              {msg.replyTo && (
                <div className="flex items-center gap-1.5 mb-0.5 pl-2 border-l-2 border-primary/40">
                  <span className="text-[10px] text-primary/80 font-medium truncate max-w-[80px]">
                    {msg.replyTo.user}
                  </span>
                  <span className="text-[10px] text-muted-foreground truncate max-w-[120px]">
                    {msg.replyTo.text}
                  </span>
                </div>
              )}

              {/* Message body */}
              <div className="flex gap-1.5 text-sm leading-tight items-start">
                <span className={`font-semibold text-xs shrink-0 ${msg.color}`}>{msg.user}</span>
                <span className="text-muted-foreground text-xs shrink-0">:</span>
                <span className="text-foreground/90 text-xs break-words flex-1">
                  {renderMessageText(msg.text)}
                </span>
              </div>

              {/* Reactions row */}
              {msg.reactions.length > 0 && (
                <div className="flex gap-1 mt-0.5 flex-wrap">
                  {msg.reactions.map(r => {
                    const hasMine = username && r.users.includes(username)
                    return (
                      <button
                        key={r.emoji}
                        onClick={() => handleReaction(msg.id, r.emoji)}
                        className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] transition-colors ${
                          hasMine
                            ? 'bg-primary/15 border border-primary/30'
                            : 'bg-secondary/60 border border-border/50'
                        } hover:bg-secondary`}
                      >
                        <span>{r.emoji}</span>
                        {r.users.length > 1 && (
                          <span className="text-muted-foreground">{r.users.length}</span>
                        )}
                      </button>
                    )
                  })}
                </div>
              )}

              {/* ── PC hover: emoji + reply actions ── */}
              {isHovered && !showPicker && (
                <div className="hidden lg:flex absolute -top-3 right-1 items-center gap-0.5 bg-card border border-border rounded-lg shadow-md p-0.5 z-10 animate-in fade-in slide-in-from-bottom-1 duration-150">
                  <button
                    onClick={e => {
                      e.stopPropagation()
                      setReactionPickerMsgId(msg.id)
                    }}
                    className="h-6 w-6 flex items-center justify-center rounded hover:bg-secondary transition-colors"
                    title="React"
                  >
                    <Smile className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                  <button
                    onClick={e => {
                      e.stopPropagation()
                      handleReply(msg)
                    }}
                    className="h-6 w-6 flex items-center justify-center rounded hover:bg-secondary transition-colors"
                    title="Reply"
                  >
                    <Reply className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
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
            </div>
          )
        })}
        <div ref={messagesEndRef} />
      </div>

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
              <span className={`font-medium ${getUserColor(u)}`}>@{u}</span>
            </button>
          ))}
        </div>
      )}

      {/* ───── Reply preview bar ───── */}
      {replyingTo && (
        <div className="flex items-center gap-2 px-3 py-1.5 border-t border-border bg-secondary/20">
          <div className="flex-1 min-w-0 flex items-center gap-1.5">
            <Reply className="h-3 w-3 text-primary shrink-0" />
            <span className="text-[10px] text-primary font-medium shrink-0">
              {replyingTo.user}
            </span>
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
        <div ref={emojiPickerRef} className="border-t border-border bg-background p-2">
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
        <Input
          ref={inputRef}
          value={input}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder="Say something... (@ to mention)"
          className="h-8 text-xs bg-background border-border"
        />
        <Button
          size="icon"
          onClick={handleSend}
          disabled={!input.trim()}
          className="h-8 w-8 shrink-0 btn-press"
        >
          <Send className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}
