import { createServer } from "http";
import { Server } from "socket.io";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import path from "path";

const PORT = 3003;
const DATA_DIR = path.resolve(__dirname, "../../db/chat-data");

// Ensure data directory exists
if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

// ── Simple JSON file storage per match ──
function getMatchFile(matchId: string) {
  // Sanitize matchId for filesystem
  const safeId = matchId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return path.join(DATA_DIR, `match_${safeId}.json`);
}

function loadMessages(matchId: string): ChatMessage[] {
  const file = getMatchFile(matchId);
  if (!existsSync(file)) return [];
  try {
    const data = readFileSync(file, "utf-8");
    return JSON.parse(data);
  } catch {
    return [];
  }
}

function saveMessages(matchId: string, messages: ChatMessage[]) {
  const file = getMatchFile(matchId);
  writeFileSync(file, JSON.stringify(messages), "utf-8");
}

interface ChatMessage {
  id: string;
  matchId: string;
  userId: string;
  username: string;
  message: string;
  type: string;
  replyToId: string | null;
  replyTo?: { id: string; username: string; message: string } | null;
  mentions: string[];
  createdAt: string;
}

// ── HTTP + Socket.IO Server ──
const httpServer = createServer();
const io = new Server(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  pingTimeout: 30000,
  pingInterval: 15000,
});

// Track user socket mappings
const socketUsers = new Map<string, { userId: string; username: string; matchId: string }>();
// Track online users per match
const matchOnline = new Map<string, Set<string>>();

// Debounced save per match
const saveTimers = new Map<string, NodeJS.Timeout>();
const pendingMessages = new Map<string, ChatMessage[]>();

function debouncedSave(matchId: string) {
  if (saveTimers.has(matchId)) clearTimeout(saveTimers.get(matchId)!);
  saveTimers.set(matchId, setTimeout(() => {
    const pending = pendingMessages.get(matchId);
    if (pending) {
      const existing = loadMessages(matchId);
      saveMessages(matchId, [...existing, ...pending]);
      pendingMessages.delete(matchId);
    }
    saveTimers.delete(matchId);
  }, 1000));
}

function addMessage(msg: ChatMessage) {
  if (!pendingMessages.has(msg.matchId)) pendingMessages.set(msg.matchId, []);
  pendingMessages.get(msg.matchId)!.push(msg);
  debouncedSave(msg.matchId);
}

// Build replyTo from message list
function buildReplyTo(matchId: string, replyToId: string | null): ChatMessage["replyTo"] {
  if (!replyToId) return null;
  // Check pending first
  const pending = pendingMessages.get(matchId) || [];
  const found = pending.find(m => m.id === replyToId);
  if (found) return { id: found.id, username: found.username, message: found.message.slice(0, 100) };
  // Check persisted
  const persisted = loadMessages(matchId);
  const foundPersisted = persisted.find(m => m.id === replyToId);
  if (foundPersisted) return { id: foundPersisted.id, username: foundPersisted.username, message: foundPersisted.message.slice(0, 100) };
  return null;
}

io.on("connection", (socket) => {
  console.log(`[Chat] Connected: ${socket.id}`);

  // ── Join a match chat room ──
  socket.on("join-match", (data: { matchId: string; userId: string; username: string }) => {
    const { matchId, userId, username } = data;
    if (!matchId || !userId || !username) return;

    // Leave previous room if any
    const prev = socketUsers.get(socket.id);
    if (prev) {
      socket.leave(`match:${prev.matchId}`);
      const online = matchOnline.get(prev.matchId);
      if (online) {
        online.delete(prev.userId);
        if (online.size === 0) matchOnline.delete(prev.matchId);
        else io.to(`match:${prev.matchId}`).emit("online-count", { matchId: prev.matchId, count: online.size });
      }
    }

    // Join new room
    socket.join(`match:${matchId}`);
    socketUsers.set(socket.id, { userId, username, matchId });

    if (!matchOnline.has(matchId)) matchOnline.set(matchId, new Set());
    matchOnline.get(matchId)!.add(userId);

    // Send chat history (last 200 messages)
    const persisted = loadMessages(matchId);
    const pending = pendingMessages.get(matchId) || [];
    const history = [...persisted, ...pending].slice(-200);
    socket.emit("chat-history", history);

    // Send online count
    io.to(`match:${matchId}`).emit("online-count", { matchId, count: matchOnline.get(matchId)!.size });

    // System: user joined
    socket.to(`match:${matchId}`).emit("user-joined", { userId, username, matchId });

    console.log(`[Chat] ${username} joined match:${matchId}`);
  });

  // ── Send a chat message ──
  socket.on("send-message", (data: { matchId: string; userId: string; username: string; message: string; replyToId?: string; mentions?: string[] }) => {
    const { matchId, userId, username, message, replyToId, mentions } = data;
    if (!matchId || !userId || !username || !message?.trim()) return;

    const trimmedMsg = message.trim().slice(0, 500);
    if (!trimmedMsg) return;

    const id = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();

    const replyTo = buildReplyTo(matchId, replyToId || null);

    const chatMsg: ChatMessage = {
      id,
      matchId,
      userId,
      username,
      message: trimmedMsg,
      type: "message",
      replyToId: replyToId || null,
      replyTo,
      mentions: mentions || [],
      createdAt: now,
    };

    addMessage(chatMsg);

    // Broadcast to all in the match room
    io.to(`match:${matchId}`).emit("new-message", chatMsg);
  });

  // ── Send emoji reaction ──
  socket.on("send-emoji", (data: { matchId: string; userId: string; username: string; emoji: string }) => {
    const { matchId, userId, username, emoji } = data;
    if (!matchId || !userId || !emoji) return;
    io.to(`match:${matchId}`).emit("emoji-reaction", { userId, username, emoji, matchId });
  });

  // ── Get online count ──
  socket.on("get-online", (matchId: string) => {
    const count = matchOnline.get(matchId)?.size || 0;
    socket.emit("online-count", { matchId, count });
  });

  // ── Typing indicator ──
  socket.on("typing", (data: { matchId: string; userId: string; username: string }) => {
    const { matchId, userId, username } = data;
    socket.to(`match:${matchId}`).emit("user-typing", { userId, username });
  });

  // ── Disconnect ──
  socket.on("disconnect", () => {
    const user = socketUsers.get(socket.id);
    if (user) {
      const { userId, username, matchId } = user;
      const online = matchOnline.get(matchId);
      if (online) {
        online.delete(userId);
        if (online.size === 0) matchOnline.delete(matchId);
        else io.to(`match:${matchId}`).emit("online-count", { matchId, count: online.size });
      }
      socket.to(`match:${matchId}`).emit("user-left", { userId, username, matchId });
      socketUsers.delete(socket.id);
      console.log(`[Chat] ${username} left match:${matchId}`);
    }
  });

  // ── Clear match chat (admin) ──
  socket.on("clear-match-chat", (matchId: string) => {
    saveMessages(matchId, []);
    pendingMessages.delete(matchId);
    io.to(`match:${matchId}`).emit("chat-cleared", { matchId });
  });
});

httpServer.listen(PORT, () => {
  console.log(`[Chat Service] Running on port ${PORT}`);
});
