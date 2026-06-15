'use client'

import { MessageCircle } from 'lucide-react'

interface ChatBoxProps {
  className?: string
  messagesMaxHeight?: string
  matchId?: string
  matchTitle?: string
}

export function ChatBox({ className = '' }: ChatBoxProps) {
  return (
    <div className={`flex flex-col items-center justify-center text-muted-foreground p-8 ${className}`}>
      <MessageCircle className="h-12 w-12 mb-3 opacity-30" />
      <p className="text-sm text-center opacity-50">Chat coming soon</p>
    </div>
  )
}
