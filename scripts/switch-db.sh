#!/usr/bin/env bash
# Switch Prisma schema between SQLite (sandbox/dev) and PostgreSQL (production/Neon)
# Usage: bash scripts/switch-db.sh sqlite | bash scripts/switch-db.sh postgresql
#
# Vercel build: uses default schema.prisma (PostgreSQL)
# Local dev:    called manually with "sqlite" to use SQLite schema

set -e

SCHEMA_DIR="$(cd "$(dirname "$0")/.." && pwd)/prisma"

if [ "$1" = "sqlite" ]; then
  echo "🔄 Switching to SQLite schema..."
  cp "$SCHEMA_DIR/schema.sqlite.prisma" "$SCHEMA_DIR/schema.prisma"
  echo "✅ Active schema: SQLite (schema.sqlite.prisma → schema.prisma)"
  echo "   Run 'bun run db:push' to sync the database."

elif [ "$1" = "postgresql" ] || [ "$1" = "postgres" ] || [ "$1" = "pg" ]; then
  echo "🔄 Switching to PostgreSQL schema..."
  if [ -f "$SCHEMA_DIR/schema.postgresql.prisma" ]; then
    cp "$SCHEMA_DIR/schema.postgresql.prisma" "$SCHEMA_DIR/schema.prisma"
  else
    echo "⚠️  No schema.postgresql.prisma found. Using current schema.prisma as-is."
  fi
  echo "✅ Active schema: PostgreSQL (schema.prisma)"
  echo "   Make sure DATABASE_URL points to a Neon/PostgreSQL database."
  echo "   Run 'npx prisma db push' to sync the database."

elif [ "$1" = "auto" ]; then
  # Auto-detect from DATABASE_URL env var
  DB_URL="${DATABASE_URL:-}"
  if echo "$DB_URL" | grep -qi "^postgres"; then
    echo "🔍 Auto-detected PostgreSQL from DATABASE_URL"
    bash "$0" postgresql
  elif echo "$DB_URL" | grep -qi "^file:\|^sqlite"; then
    echo "🔍 Auto-detected SQLite from DATABASE_URL"
    bash "$0" sqlite
  else
    echo "⚠️  Cannot auto-detect database type from DATABASE_URL."
    echo "   DATABASE_URL: ${DB_URL:-(not set)}"
    echo "   Defaulting to SQLite for local development."
    bash "$0" sqlite
  fi

else
  echo "Usage: bash scripts/switch-db.sh [sqlite|postgresql|auto]"
  echo ""
  echo "  sqlite      — Use SQLite schema (for sandbox/local dev)"
  echo "  postgresql  — Use PostgreSQL schema (for production/Neon/Vercel)"
  echo "  auto        — Auto-detect from DATABASE_URL environment variable"
  exit 1
fi
