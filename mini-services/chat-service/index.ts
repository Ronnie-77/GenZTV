import { createServer } from 'http'
import { Server as SocketIOServer } from 'socket.io'
import { PrismaClient } from '@prisma/client'
import path from 'path'

// ─── Database ──────────────────────────────────────────────────────────────
// Ensure DATABASE_URL is set (fallback for local sandbox development).
// In production (Railway) DATABASE_URL will be set in the environment.
if (!process.env.DATABASE_URL) {
  const projectRoot = path.resolve(__dirname, '../..')
  process.env.DATABASE_URL = `file:${projectRoot}/db/custom.db`
  console.log(`[chat-service] DATABASE_URL not set, using default: ${process.env.DATABASE_URL}`)
} else {
  console.log(`[chat-service] DATABASE_URL: ${process.env.DATABASE_URL.replace(/file:.*/, 'file:<sqlite>')}`)
}

const prisma = new PrismaClient()
console.log('[chat-service] Prisma Client initialized')

// ─── Constants ─────────────────────────────────────────────────────────────
const MESSAGE_TTL_MS = 4 * 60 * 60 * 1000 // 4 hours
const HISTORY_LIMIT = 200
const MAX_CONTENT_LENGTH = 1000
const MAX_USERNAME_LENGTH = 20
const MAX_AVATAR_LENGTH = 10
const REACTION_EMOJIS = new Set(['👍', '❤️', '😆', '😮', '😢', '😡'])

// Rate limiting: max 20 messages per socket per 60s
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX = 20
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()

// ─── Periodic cleanup of old messages ──────────────────────────────────────
async function reapOldMessages() {
  try {
    const cutoff = new Date(Date.now() - MESSAGE_TTL_MS)
    const result = await prisma.chatMessage.deleteMany({
      where: { createdAt: { lt: cutoff } },
    })
    if (result.count > 0) {
      console.log(`[chat-service] Reaped ${result.count} old messages`)
    }
  } catch (err) {
    console.error('[chat-service] Reap error:', err)
  }
}

// Run cleanup every 5 minutes
setInterval(reapOldMessages, 5 * 60 * 1000)
reapOldMessages() // Run once on startup

// ─── Helper: parse reactions ───────────────────────────────────────────────
function parseReactions(raw: string | null | undefined): Record<string, string[]> {
  if (!raw) return {}
  try {
    const p = JSON.parse(raw)
    if (p && typeof p === 'object' && !Array.isArray(p)) {
      const out: Record<string, string[]> = {}
      for (const [k, v] of Object.entries(p as Record<string, unknown>)) {
        if (Array.isArray(v) && v.every((x) => typeof x === 'string')) {
          out[k] = v
        }
      }
      return out
    }
  } catch {
    /* ignore */
  }
  return {}
}

// ─── Helper: get recent messages ──────────────────────────────────────────
async function getRecentMessages() {
  const cutoff = new Date(Date.now() - MESSAGE_TTL_MS)
  const messages = await prisma.chatMessage.findMany({
    where: { createdAt: { gt: cutoff } },
    orderBy: { createdAt: 'asc' },
    take: HISTORY_LIMIT,
  })

  // Batch-fetch all reply-to parents in one query (avoids N+1)
  const replyToIds = messages
    .map((m) => m.replyToId)
    .filter((id): id is string => id !== null)

  const parentMap = new Map<string, { id: string; username: string; content: string }>()
  if (replyToIds.length > 0) {
    const parents = await prisma.chatMessage.findMany({
      where: { id: { in: replyToIds } },
      select: { id: true, username: true, content: true },
    })
    for (const p of parents) {
      parentMap.set(p.id, p)
    }
  }

  return messages.map((msg) => {
    let replyTo: { id: string; username: string; content: string } | null = null
    if (msg.replyToId) {
      const parent = parentMap.get(msg.replyToId)
      if (parent) {
        replyTo = {
          id: parent.id,
          username: parent.username,
          content: parent.content.slice(0, 200),
        }
      }
    }
    return {
      id: msg.id,
      username: msg.username,
      avatar: msg.avatar,
      content: msg.content,
      createdAt: msg.createdAt.toISOString(),
      replyToId: msg.replyToId || null,
      replyTo,
      reactions: parseReactions(msg.reactions),
    }
  })
}

// ─── HTTP Server + Socket.IO ───────────────────────────────────────────────
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3004
const httpServer = createServer()

const io = new SocketIOServer(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  pingInterval: 25000,
  pingTimeout: 10000,
})

// Track connected users count
let connectedUsers = 0

io.on('connection', (socket) => {
  connectedUsers++
  console.log(`[chat-service] Client connected (${connectedUsers} total)`)
  io.emit('user-count', connectedUsers)

  // Send message history on connect
  getRecentMessages()
    .then((messages) => socket.emit('history', messages))
    .catch((err) => console.error('[chat-service] Error sending history:', err))

  // ── Handle new message ─────────────────────────────────────────────────
  socket.on(
    'message',
    async (
      data: {
        username: string
        avatar?: string
        content: string
        replyToId?: string
      },
      ack?: (response: { ok: boolean; id?: string; error?: string }) => void,
    ) => {
      try {
        // Rate limit check
        const socketId = socket.id
        const now = Date.now()
        const entry = rateLimitMap.get(socketId)
        if (entry && now < entry.resetAt) {
          if (entry.count >= RATE_LIMIT_MAX) {
            ack?.({ ok: false, error: 'Too many messages. Please slow down.' })
            return
          }
          entry.count++
        } else {
          rateLimitMap.set(socketId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS })
        }

        const username = String(data.username || '').trim().slice(0, MAX_USERNAME_LENGTH)
        const avatar = String(data.avatar || '').trim().slice(0, MAX_AVATAR_LENGTH) || 'male'
        const content = String(data.content || '').trim().slice(0, MAX_CONTENT_LENGTH)
        const replyToId = data.replyToId ? String(data.replyToId).slice(0, 50) : null

        if (!username || !content) {
          ack?.({ ok: false, error: 'username and content are required' })
          return
        }

        // Validate replyToId & fetch parent for preview (single query)
        let replyTo: { id: string; username: string; content: string } | null = null
        if (replyToId) {
          const parent = await prisma.chatMessage.findUnique({
            where: { id: replyToId },
            select: { id: true, username: true, content: true },
          })
          if (!parent) {
            ack?.({ ok: false, error: 'replyTo message not found' })
            return
          }
          replyTo = {
            id: parent.id,
            username: parent.username,
            content: parent.content.slice(0, 200),
          }
        }

        // Create message — Prisma generates a cuid() id via @default(cuid())
        const msg = await prisma.chatMessage.create({
          data: {
            username,
            avatar,
            content,
            reactions: '{}',
            replyToId,
          },
        })

        const message = {
          id: msg.id,
          username,
          avatar,
          content,
          createdAt: msg.createdAt.toISOString(),
          replyToId: replyToId || null,
          replyTo,
          reactions: {} as Record<string, string[]>,
        }

        // Broadcast to ALL connected clients (including sender)
        io.emit('message', message)
        ack?.({ ok: true, id: msg.id })
      } catch (err) {
        console.error('[chat-service] Error handling message:', err)
        ack?.({ ok: false, error: 'Failed to send message' })
      }
    },
  )

  // ── Handle reaction toggle ─────────────────────────────────────────────
  socket.on(
    'react',
    async (
      data: { messageId: string; emoji: string; username: string },
      ack?: (response: { ok: boolean }) => void,
    ) => {
      try {
        const messageId = String(data.messageId || '').slice(0, 50)
        const emoji = String(data.emoji || '').slice(0, 10)
        const username = String(data.username || '').trim().slice(0, MAX_USERNAME_LENGTH)

        if (!messageId || !username || !REACTION_EMOJIS.has(emoji)) {
          ack?.({ ok: false })
          return
        }

        const msg = await prisma.chatMessage.findUnique({
          where: { id: messageId },
        })
        if (!msg) {
          ack?.({ ok: false })
          return
        }

        const reactions = parseReactions(msg.reactions)
        const list = reactions[emoji] || []
        if (list.includes(username)) {
          const next = list.filter((u) => u !== username)
          if (next.length > 0) reactions[emoji] = next
          else delete reactions[emoji]
        } else {
          reactions[emoji] = [...list, username]
        }

        await prisma.chatMessage.update({
          where: { id: messageId },
          data: { reactions: JSON.stringify(reactions) },
        })

        // Broadcast reaction update to all clients
        io.emit('reaction', { messageId, reactions })
        ack?.({ ok: true })
      } catch (err) {
        console.error('[chat-service] Error handling reaction:', err)
        ack?.({ ok: false })
      }
    },
  )

  // ── Handle request for user count ──────────────────────────────────────
  socket.on('get-user-count', () => {
    socket.emit('user-count', connectedUsers)
  })

  // ── Handle disconnect ──────────────────────────────────────────────────
  socket.on('disconnect', () => {
    connectedUsers = Math.max(0, connectedUsers - 1)
    console.log(`[chat-service] Client disconnected (${connectedUsers} total)`)
    io.emit('user-count', connectedUsers)
    // Clean up rate limit entry
    rateLimitMap.delete(socket.id)
  })
})

// ─── Start Server ──────────────────────────────────────────────────────────
httpServer.listen(PORT, () => {
  console.log(`[chat-service] Socket.IO server running on port ${PORT}`)
})
