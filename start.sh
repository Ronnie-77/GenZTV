#!/bin/sh
set -e

# Create /data directory if it doesn't exist (for Railway volume)
mkdir -p /data 2>/dev/null || true

# Set DATABASE_URL if not set
export DATABASE_URL="${DATABASE_URL:-file:/data/prod.db}"

# Run prisma db push (ignore errors - DB might not be available yet)
npx prisma db push --skip-generate --accept-data-loss 2>/dev/null || true

# Start Next.js server
# HOSTNAME must be 0.0.0.0 for Railway to reach the app
export HOSTNAME="0.0.0.0"
export PORT="${PORT:-3000}"

echo "Starting GenZ TV server on port ${PORT}..."
exec npx next start -p ${PORT} -H 0.0.0.0
