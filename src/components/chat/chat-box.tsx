'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Send, MessageCircle, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface ChatMessage {
  id: string
  user: string
  text: string
  time: string
  color: string
}

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

const sampleUsers = [
  'SportsFan42', 'CricketLover', 'GoalHunter', 'LiveWatcher',
  'TVAddict', 'StreamKing', 'MatchDay', 'FanZone',
  'BoldViewer', 'CouchCoach', 'PitchSide', 'StadiumVue',
]

const sampleMessages = [
  'Great stream quality! 🔥',
  'What a match!',
  'Anyone else having buffer issues?',
  'This is awesome 👏',
  'Love this channel',
  'Here we go!',
  'What a play!',
  'Can\'t believe that happened 😱',
  'Stream is smooth tonight',
  'Who else is watching?',
  'Let\'s go! 💪',
  'Amazing quality!',
  'Best streaming app',
  'That was close!',
  'Unbelievable! 🤯',
  'Nice stream',
  'Watching from Dhaka 🇧🇩',
  'This is lit 🔥🔥',
  'Good coverage',
  'What a goal!!',
]

function generateId(): string {
  return Math.random().toString(36).substring(2, 9)
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function randomMessage(): ChatMessage {
  const user = sampleUsers[Math.floor(Math.random() * sampleUsers.length)]
  const text = sampleMessages[Math.floor(Math.random() * sampleMessages.length)]
  const color = userColors[Math.floor(Math.random() * userColors.length)]
  return {
    id: generateId(),
    user,
    text,
    time: formatTime(new Date()),
    color,
  }
}

function generateInitialMessages(): ChatMessage[] {
  const initial: ChatMessage[] = []
  for (let i = 0; i < 8; i++) {
    const msg = randomMessage()
    const d = new Date()
    d.setMinutes(d.getMinutes() - (8 - i))
    msg.time = formatTime(d)
    initial.push(msg)
  }
  return initial
}

export function ChatBox() {
  const [messages, setMessages] = useState<ChatMessage[]>(generateInitialMessages)
  const [input, setInput] = useState('')
  const [onlineCount] = useState(() => Math.floor(Math.random() * 200) + 50)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Simulate incoming messages
  useEffect(() => {
    const interval = setInterval(() => {
      setMessages(prev => {
        const next = [...prev, randomMessage()]
        if (next.length > 50) next.shift()
        return next
      })
    }, 4000 + Math.random() * 6000)

    return () => clearInterval(interval)
  }, [])

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = useCallback(() => {
    if (!input.trim()) return

    const msg: ChatMessage = {
      id: generateId(),
      user: 'You',
      text: input.trim(),
      time: formatTime(new Date()),
      color: 'text-primary',
    }

    setMessages(prev => {
      const next = [...prev, msg]
      if (next.length > 50) next.shift()
      return next
    })
    setInput('')
    inputRef.current?.focus()
  }, [input])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden flex flex-col">
      {/* Chat Header */}
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

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto max-h-64 p-3 space-y-2 scrollbar-thin">
        {messages.map((msg) => (
          <div key={msg.id} className="flex gap-1.5 text-sm leading-tight">
            <span className={`font-semibold text-xs shrink-0 ${msg.color}`}>
              {msg.user}
            </span>
            <span className="text-muted-foreground text-xs shrink-0">:</span>
            <span className="text-foreground/90 text-xs break-words">{msg.text}</span>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="flex items-center gap-2 p-2 border-t border-border bg-secondary/20">
        <Input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Say something..."
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
