import { createServer } from 'http'
import { Server } from 'socket.io'

const PORT = 3003

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ChatMessage {
  id: string
  uid: string
  username: string
  userColor: string
  text: string
  timestamp: number
  reactions: Record<string, string[]>  // { "👍": ["uid1", "uid2"] }
  replyTo: { msgId: string; username: string; text: string } | null
}

interface ActiveUser {
  uid: string
  username: string
  lastSeen: number
}

interface UserProfile {
  username: string
  uid: string
  color: string
}

/* ------------------------------------------------------------------ */
/*  In-memory storage                                                  */
/* ------------------------------------------------------------------ */

const MAX_MESSAGES_PER_ROOM = 100
const STALE_USER_THRESHOLD_MS = 5 * 60 * 1000  // 5 minutes
const MAX_MESSAGE_LENGTH = 500
const MESSAGE_COOLDOWN_MS = 3000

// Room state
interface Room {
  messages: ChatMessage[]
  activeUsers: Map<string, ActiveUser>
}

const rooms = new Map<string, Room>()

function getRoom(matchId: string): Room {
  if (!rooms.has(matchId)) {
    rooms.set(matchId, { messages: [], activeUsers: new Map() })
  }
  return rooms.get(matchId)!
}

// Username registry: username -> uid
const usernameRegistry = new Map<string, string>()

// Rate limiting: uid -> lastSendTime
const rateLimits = new Map<string, number>()

// Profanity filter
const BANNED_WORDS = [
  'fuck', 'shit', 'asshole', 'bastard', 'bitch', 'dick', 'pussy', 'whore',
  'nigger', 'nigga', 'retard', 'faggot', 'cunt', 'cock', 'slut',
  'চুদ', 'মাদারচোদ', 'ব্যালা', 'খানকি', 'শালা', 'বেটা', 'রান্ডি',
  'চুতমারানি', 'গান্ডু', 'ঝাট', 'মাগি', 'পোঁদ', 'শুয়োর',
]

function containsProfanity(text: string): boolean {
  const lower = text.toLowerCase()
  return BANNED_WORDS.some(w => lower.includes(w))
}

/* ------------------------------------------------------------------ */
/*  Periodic cleanup                                                   */
/* ------------------------------------------------------------------ */

function cleanupStaleUsers() {
  const now = Date.now()
  for (const [matchId, room] of rooms) {
    for (const [uid, user] of room.activeUsers) {
      if (now - user.lastSeen > STALE_USER_THRESHOLD_MS) {
        room.activeUsers.delete(uid)
      }
    }
    // Remove empty rooms (except those with messages)
    if (room.activeUsers.size === 0 && room.messages.length === 0) {
      rooms.delete(matchId)
    }
  }
}

// Run cleanup every 2 minutes
setInterval(cleanupStaleUsers, 2 * 60 * 1000)

/* ------------------------------------------------------------------ */
/*  Socket.io server                                                   */
/* ------------------------------------------------------------------ */

const httpServer = createServer()
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
})

io.on('connection', (socket) => {
  console.log(`[Chat] Connected: ${socket.id}`)

  /* ---------------------------------------------------------------- */
  /*  Join room                                                        */
  /* ---------------------------------------------------------------- */
  socket.on('join', (data: { matchId: string; profile: UserProfile }) => {
    const { matchId, profile } = data
    const room = getRoom(matchId)

    // Join the socket.io room
    socket.join(matchId)

    // Store profile info on socket for later use
    socket.data.matchId = matchId
    socket.data.profile = profile

    // Update active users
    room.activeUsers.set(profile.uid, {
      uid: profile.uid,
      username: profile.username,
      lastSeen: Date.now(),
    })

    // Register username
    usernameRegistry.set(profile.username.toLowerCase(), profile.uid)

    // Send existing messages to the joining user
    socket.emit('messages', room.messages)

    // Broadcast updated active users list
    io.to(matchId).emit('activeUsers', Array.from(room.activeUsers.values()))

    console.log(`[Chat] ${profile.username} joined room ${matchId} (${room.activeUsers.size} users)`)
  })

  /* ---------------------------------------------------------------- */
  /*  Send message                                                     */
  /* ---------------------------------------------------------------- */
  socket.on('message', (data: { matchId: string; profile: UserProfile; text: string; replyTo: ChatMessage['replyTo'] }) => {
    const { matchId, profile, text, replyTo } = data
    const room = getRoom(matchId)

    // Validate
    if (!text || !text.trim()) return
    if (text.length > MAX_MESSAGE_LENGTH) return

    // Rate limit
    const now = Date.now()
    const lastSend = rateLimits.get(profile.uid) || 0
    if (now - lastSend < MESSAGE_COOLDOWN_MS) return
    rateLimits.set(profile.uid, now)

    // Profanity check
    if (containsProfanity(text)) {
      socket.emit('error', { message: 'Message contains profanity' })
      return
    }

    const msg: ChatMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      uid: profile.uid,
      username: profile.username,
      userColor: profile.color,
      text: text.trim(),
      timestamp: Date.now(),
      reactions: {},
      replyTo: replyTo || null,
    }

    // Add to room messages
    room.messages.push(msg)
    if (room.messages.length > MAX_MESSAGES_PER_ROOM) {
      room.messages = room.messages.slice(-MAX_MESSAGES_PER_ROOM)
    }

    // Broadcast to everyone in the room (including sender)
    io.to(matchId).emit('message', msg)

    // Check for mentions
    const mentionRegex = /@(\w+)/g
    let match: RegExpExecArray | null
    while ((match = mentionRegex.exec(text)) !== null) {
      const mentionedUsername = match[1].toLowerCase()
      // Find sockets for the mentioned user and notify them
      for (const [, s] of io.sockets.sockets) {
        if (s.data.profile?.username?.toLowerCase() === mentionedUsername && s.id !== socket.id) {
          s.emit('mentioned', {
            fromUser: profile.username,
            fromUserColor: profile.color,
            text: text.trim(),
            matchId,
            msgId: msg.id,
          })
        }
      }
    }

    // Update presence
    room.activeUsers.set(profile.uid, {
      uid: profile.uid,
      username: profile.username,
      lastSeen: Date.now(),
    })
  })

  /* ---------------------------------------------------------------- */
  /*  Toggle reaction                                                  */
  /* ---------------------------------------------------------------- */
  socket.on('reaction', (data: { matchId: string; msgId: string; emoji: string; uid: string }) => {
    const { matchId, msgId, emoji, uid } = data
    const room = getRoom(matchId)

    const msg = room.messages.find(m => m.id === msgId)
    if (!msg) return

    if (!msg.reactions[emoji]) {
      msg.reactions[emoji] = []
    }

    const users = msg.reactions[emoji]
    if (users.includes(uid)) {
      // Remove reaction
      msg.reactions[emoji] = users.filter(u => u !== uid)
      if (msg.reactions[emoji].length === 0) {
        delete msg.reactions[emoji]
      }
    } else {
      // Add reaction
      msg.reactions[emoji].push(uid)
    }

    // Broadcast the updated message
    io.to(matchId).emit('messageUpdated', { id: msg.id, reactions: msg.reactions })
  })

  /* ---------------------------------------------------------------- */
  /*  Heartbeat / presence ping                                        */
  /* ---------------------------------------------------------------- */
  socket.on('heartbeat', (data: { matchId: string; profile: UserProfile }) => {
    const { matchId, profile } = data
    const room = getRoom(matchId)

    room.activeUsers.set(profile.uid, {
      uid: profile.uid,
      username: profile.username,
      lastSeen: Date.now(),
    })
  })

  /* ---------------------------------------------------------------- */
  /*  Check username availability                                      */
  /* ---------------------------------------------------------------- */
  socket.on('checkUsername', (data: { username: string; uid: string }, callback: (available: boolean) => void) => {
    const existingUid = usernameRegistry.get(data.username.toLowerCase())
    if (!existingUid) {
      callback(true)
    } else if (existingUid === data.uid) {
      callback(true)
    } else {
      callback(false)
    }
  })

  /* ---------------------------------------------------------------- */
  /*  Register username                                                */
  /* ---------------------------------------------------------------- */
  socket.on('registerUsername', (data: { username: string; uid: string }) => {
    usernameRegistry.set(data.username.toLowerCase(), data.uid)
  })

  /* ---------------------------------------------------------------- */
  /*  Disconnect                                                       */
  /* ---------------------------------------------------------------- */
  socket.on('disconnect', () => {
    const matchId = socket.data.matchId as string | undefined
    const profile = socket.data.profile as UserProfile | undefined

    if (matchId && profile) {
      const room = getRoom(matchId)
      room.activeUsers.delete(profile.uid)

      // Broadcast updated active users
      io.to(matchId).emit('activeUsers', Array.from(room.activeUsers.values()))

      console.log(`[Chat] ${profile.username} left room ${matchId} (${room.activeUsers.size} users)`)
    }

    console.log(`[Chat] Disconnected: ${socket.id}`)
  })
})

/* ------------------------------------------------------------------ */
/*  Start server                                                       */
/* ------------------------------------------------------------------ */

httpServer.listen(PORT, () => {
  console.log(`🚀 GenZTV Chat Service running on port ${PORT}`)
})
