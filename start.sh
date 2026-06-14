#!/bin/bash
# Railway startup script
# Runs database migration before starting the server

echo "🔄 Running database migration..."
npx prisma db push --accept-data-loss

echo "🚀 Starting Next.js server..."
next start
