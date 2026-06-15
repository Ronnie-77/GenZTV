#!/bin/bash
# Start chat service in background
cd /app/mini-services/chat-service && npm install && npx tsx index.ts &
CHAT_PID=$!

# Start main Next.js app
cd /app && npx prisma db push --accept-data-loss && next start &
NEXT_PID=$!

# Wait for either to exit
wait -n $CHAT_PID $NEXT_PID
