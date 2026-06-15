'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { io, Socket } from 'socket.io-client'
import { Send, Smile, Reply, X, Users, MessageCircle, Hash, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

// ── Types ──
interface ChatMessage {
  id: string
  matchId: string
  userId: string
  username: string
  message: string
  type: string
  replyToId: string | null
  replyTo?: { id: string; username: string; message: string } | null
  mentions: string[]
  createdAt: string
}

// ── Persistent user identity (localStorage) ──
function getUserId(): string {
  if (typeof window === 'undefined') return ''
  let id = localStorage.getItem('genztv_userId')
  if (!id) {
    id = `user_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    localStorage.setItem('genztv_userId', id)
  }
  return id
}

function getSavedUsername(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('genztv_username')
}

function saveUsername(name: string) {
  if (typeof window === 'undefined') return
  localStorage.setItem('genztv_username', name)
}

function generateUsername(displayName: string): string {
  const num = Math.floor(1000 + Math.random() * 9000)
  return `${displayName}${num}`
}

// ── Emoji picker ──
const QUICK_EMOJIS = ['🔥', '⚽', '🎉', '😍', '😂', '💪', '👏', '❤️', '🇧🇩', '🇮🇳', '😱', '🥅', '🏆', '⭐', '💀', '🤯']

// ── Format time ──
function formatTime(isoStr: string): string {
  const d = new Date(isoStr)
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
}

// ── ChatBox Component ──
export function ChatBox({ matchId, matchTitle }: { matchId: string; matchTitle: string }) {
  const socketRef = useRef<Socket | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputMsg, setInputMsg] = useState('')
  const [username, setUsernameState] = useState<string | null>(() => getSavedUsername())
  const [nameInput, setNameInput] = useState('')
  const [onlineCount, setOnlineCount] = useState(0)
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null)
  const [showEmoji, setShowEmoji] = useState(false)
  const [typingUsers, setTypingUsers] = useState<string[]>([])
  const [showNameModal, setShowNameModal] = useState(() => !getSavedUsername())
  const [connected, setConnected] = useState(false)
  const [autoScroll, setAutoScroll] = useState(true)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const chatContainerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const userIdRef = useRef(typeof window !== 'undefined' ? getUserId() : '')

  // Connect to Socket.IO
  useEffect(() => {
    if (!username || !matchId) return

    const s = io('/?XTransformPort=3003', {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    })

    s.on('connect', () => {
      setConnected(true)
      s.emit('join-match', { matchId, userId: userIdRef.current, username })
    })

    s.on('disconnect', () => setConnected(false))

    s.on('chat-history', (history: ChatMessage[]) => {
      setMessages(history)
    })

    s.on('new-message', (msg: ChatMessage) => {
      setMessages(prev => [...prev, msg])
    })

    s.on('online-count', ({ count }: { count: number }) => {
      setOnlineCount(count)
    })

    s.on('user-joined', ({ username: name }: { username: string }) => {
      setMessages(prev => [...prev, {
        id: `sys_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        matchId,
        userId: 'system',
        username: 'System',
        message: `${name} joined the chat`,
        type: 'system',
        replyToId: null,
        mentions: [],
        createdAt: new Date().toISOString(),
      }])
    })

    s.on('user-left', ({ username: name }: { username: string }) => {
      setMessages(prev => [...prev, {
        id: `sys_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        matchId,
        userId: 'system',
        username: 'System',
        message: `${name} left the chat`,
        type: 'system',
        replyToId: null,
        mentions: [],
        createdAt: new Date().toISOString(),
      }])
    })

    s.on('emoji-reaction', ({ emoji, username: name }: { emoji: string; username: string }) => {
      setMessages(prev => [...prev, {
        id: `emoji_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        matchId,
        userId: 'emoji',
        username: name,
        message: emoji,
        type: 'emoji',
        replyToId: null,
        mentions: [],
        createdAt: new Date().toISOString(),
      }])
    })

    s.on('user-typing', ({ username: name }: { username: string }) => {
      setTypingUsers(prev => {
        if (prev.includes(name)) return prev
        const updated = [...prev, name].slice(-3)
        if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
        typingTimerRef.current = setTimeout(() => setTypingUsers([]), 2000)
        return updated
      })
    })

    s.on('chat-cleared', () => {
      setMessages([])
    })

    socketRef.current = s

    return () => {
      s.disconnect()
      socketRef.current = null
    }
  }, [username, matchId])

  // Auto scroll
  useEffect(() => {
    if (autoScroll) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, autoScroll])

  // Handle scroll to detect if user scrolled up
  const handleScroll = useCallback(() => {
    const container = chatContainerRef.current
    if (!container) return
    const isAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 60
    setAutoScroll(isAtBottom)
  }, [])

  // Set username
  const handleSetUsername = () => {
    const displayName = nameInput.trim()
    if (!displayName) return
    const generatedName = generateUsername(displayName)
    setUsernameState(generatedName)
    saveUsername(generatedName)
    setShowNameModal(false)
  }

  // Send message
  const handleSend = () => {
    if (!inputMsg.trim() || !socketRef.current || !username) return

    const mentionRegex = /@(\w+)/g
    const mentions: string[] = []
    let m
    while ((m = mentionRegex.exec(inputMsg)) !== null) {
      mentions.push(m[1])
    }

    socketRef.current.emit('send-message', {
      matchId,
      userId: userIdRef.current,
      username,
      message: inputMsg,
      replyToId: replyTo?.id || null,
      mentions,
    })

    setInputMsg('')
    setReplyTo(null)
    setShowEmoji(false)
    inputRef.current?.focus()
  }

  // Typing indicator
  const handleInputChange = (value: string) => {
    setInputMsg(value)
    if (socketRef.current && username) {
      socketRef.current.emit('typing', { matchId, userId: userIdRef.current, username })
    }
  }

  // Insert emoji
  const insertEmoji = (emoji: string) => {
    setInputMsg(prev => prev + emoji)
    inputRef.current?.focus()
  }

  // Insert mention
  const insertMention = (name: string) => {
    setInputMsg(prev => prev + `@${name} `)
    inputRef.current?.focus()
  }

  // ── Username Setup Modal ──
  if (showNameModal) {
    return (
      <div className="w-full h-full flex flex-col bg-card border border-border rounded-xl overflow-hidden">
        <div className="p-3 border-b border-border bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30">
          <div className="flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-emerald-600" />
            <h3 className="text-sm font-bold">Live Chat</h3>
            {matchTitle && (
              <span className="text-[10px] text-muted-foreground truncate max-w-[120px]">{matchTitle}</span>
            )}
          </div>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center p-6 gap-4">
          <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
            <Hash className="h-8 w-8 text-emerald-600" />
          </div>
          <div className="text-center">
            <h3 className="text-base font-bold mb-1">Join the Chat</h3>
            <p className="text-xs text-muted-foreground mb-1">Enter your name to start chatting</p>
            <p className="text-[10px] text-muted-foreground">A unique number will be added automatically</p>
          </div>
          <div className="w-full max-w-[220px]">
            <input
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value.slice(0, 20))}
              onKeyDown={(e) => e.key === 'Enter' && handleSetUsername()}
              placeholder="Your name..."
              maxLength={20}
              className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all"
              autoFocus
            />
            {nameInput.trim() && (
              <p className="text-[10px] text-muted-foreground mt-1.5 text-center">
                Your username: <span className="font-medium text-emerald-600">{generateUsername(nameInput.trim())}</span>
              </p>
            )}
          </div>
          <Button
            onClick={handleSetUsername}
            disabled={!nameInput.trim()}
            className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 text-xs px-5 h-9"
          >
            <MessageCircle className="h-3.5 w-3.5" />
            Start Chatting
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full h-full flex flex-col bg-card border border-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="p-3 border-b border-border bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-emerald-600" />
            <h3 className="text-sm font-bold">Live Chat</h3>
            {matchTitle && (
              <span className="text-[10px] text-muted-foreground truncate max-w-[100px]">{matchTitle}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400 text-[10px] px-1.5 py-0 border-emerald-200 dark:border-emerald-800">
              <Users className="h-2.5 w-2.5 mr-0.5" />
              {onlineCount}
            </Badge>
            <div className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-500' : 'bg-red-400'}`} />
          </div>
        </div>
      </div>

      {/* Messages */}
      <div
        ref={chatContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-3 space-y-1 scrollbar-thin"
        style={{ maxHeight: 'calc(100vh - 280px)', minHeight: '300px' }}
      >
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 gap-2">
            <MessageCircle className="h-8 w-8 text-muted-foreground/30" />
            <p className="text-xs text-muted-foreground">No messages yet</p>
            <p className="text-[10px] text-muted-foreground/60">Be the first to say something!</p>
          </div>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className="group">
            {msg.type === 'system' ? (
              <div className="text-center py-1">
                <span className="text-[10px] text-muted-foreground/60 bg-muted/50 px-2 py-0.5 rounded-full">
                  {msg.message}
                </span>
              </div>
            ) : msg.type === 'emoji' ? (
              <div className="text-center py-0.5">
                <span className="text-xl">{msg.message}</span>
                <span className="text-[9px] text-muted-foreground ml-1">{msg.username}</span>
              </div>
            ) : (
              <div
                className={`px-2 py-1.5 rounded-lg hover:bg-secondary/50 transition-colors ${
                  replyTo?.id === msg.id ? 'bg-emerald-50 dark:bg-emerald-950/20 ring-1 ring-emerald-300 dark:ring-emerald-700' : ''
                }`}
              >
                {msg.replyTo && (
                  <div className="flex items-center gap-1 mb-1 pl-1 border-l-2 border-emerald-400 dark:border-emerald-600">
                    <Reply className="h-2.5 w-2.5 text-emerald-500" />
                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">{msg.replyTo.username}</span>
                    <span className="text-[10px] text-muted-foreground truncate max-w-[120px]">{msg.replyTo.message}</span>
                  </div>
                )}
                <div className="flex items-baseline gap-1.5">
                  <button
                    onClick={() => insertMention(msg.username)}
                    className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline shrink-0"
                  >
                    {msg.username}
                  </button>
                  <span className="text-xs text-foreground break-words flex-1">
                    {msg.message.split(/(@\w+)/g).map((part, i) =>
                      part.startsWith('@') ? (
                        <span key={i} className="text-emerald-600 dark:text-emerald-400 font-medium">{part}</span>
                      ) : (
                        <span key={i}>{part}</span>
                      )
                    )}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[9px] text-muted-foreground/50">{formatTime(msg.createdAt)}</span>
                  <button
                    onClick={() => setReplyTo(msg)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Reply className="h-2.5 w-2.5 text-muted-foreground hover:text-emerald-500" />
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Scroll to bottom */}
      {!autoScroll && messages.length > 0 && (
        <div className="px-3">
          <button
            onClick={() => {
              setAutoScroll(true)
              messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
            }}
            className="w-full flex items-center justify-center gap-1 py-1 text-[10px] text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 rounded-lg transition-colors"
          >
            <ChevronDown className="h-3 w-3" />
            New messages
          </button>
        </div>
      )}

      {/* Typing indicator */}
      {typingUsers.length > 0 && (
        <div className="px-3 py-1">
          <p className="text-[10px] text-muted-foreground animate-pulse">
            {typingUsers.join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing...
          </p>
        </div>
      )}

      {/* Reply bar */}
      {replyTo && (
        <div className="px-3 py-1.5 border-t border-border bg-secondary/30 flex items-center gap-2">
          <Reply className="h-3 w-3 text-emerald-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="text-[10px] text-emerald-600 font-medium">{replyTo.username}</span>
            <p className="text-[10px] text-muted-foreground truncate">{replyTo.message}</p>
          </div>
          <button onClick={() => setReplyTo(null)} className="shrink-0">
            <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
          </button>
        </div>
      )}

      {/* Emoji picker */}
      {showEmoji && (
        <div className="px-3 py-2 border-t border-border bg-secondary/20">
          <div className="flex flex-wrap gap-1">
            {QUICK_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => insertEmoji(emoji)}
                className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-secondary transition-colors text-sm"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input area */}
      <div className="p-2 border-t border-border bg-background">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setShowEmoji(!showEmoji)}
            className={`p-1.5 rounded-md transition-colors shrink-0 ${showEmoji ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40' : 'hover:bg-secondary text-muted-foreground'}`}
          >
            <Smile className="h-4 w-4" />
          </button>
          <input
            ref={inputRef}
            type="text"
            value={inputMsg}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
            placeholder="Type a message..."
            maxLength={500}
            className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg border border-border bg-secondary/30 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all"
          />
          <button
            onClick={handleSend}
            disabled={!inputMsg.trim()}
            className="p-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 disabled:hover:bg-emerald-600 transition-colors shrink-0"
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="flex items-center justify-between mt-1 px-0.5">
          <span className="text-[9px] text-muted-foreground/40">@{username}</span>
          <span className="text-[9px] text-muted-foreground/40">{inputMsg.length}/500</span>
        </div>
      </div>
    </div>
  )
}
