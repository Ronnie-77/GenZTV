#!/usr/bin/env bash
# Switch Prisma schema between SQLite (sandbox/dev) and MySQL (production)
# Usage: bash scripts/switch-db.sh sqlite | bash scripts/switch-db.sh mysql
#
# Railway build: called automatically by nixpacks.toml with "mysql"
# Local dev:     called manually with "sqlite" to restore SQLite schema

set -e

SCHEMA_DIR="$(cd "$(dirname "$0")/.." && pwd)/prisma"

if [ "$1" = "sqlite" ]; then
  echo "🔄 Switching to SQLite schema..."
  cp "$SCHEMA_DIR/schema.sqlite.prisma" "$SCHEMA_DIR/schema.prisma"
  echo "✅ Active schema: SQLite (schema.sqlite.prisma → schema.prisma)"
  echo "   Run 'bun run db:push' to sync the database."

elif [ "$1" = "mysql" ]; then
  echo "🔄 Switching to MySQL schema..."
  if [ -f "$SCHEMA_DIR/schema.mysql.prisma" ]; then
    cp "$SCHEMA_DIR/schema.mysql.prisma" "$SCHEMA_DIR/schema.prisma"
  else
    echo "⚠️  No schema.mysql.prisma found. Using current schema.prisma as-is."
    echo "   Make sure schema.prisma has provider = \"mysql\" and @db.* annotations."
  fi
  echo "✅ Active schema: MySQL (schema.prisma)"
  echo "   Make sure DATABASE_URL points to a MySQL database."
  echo "   Run 'npx prisma db push' to sync the database."

elif [ "$1" = "auto" ]; then
  # Auto-detect from DATABASE_URL env var
  DB_URL="${DATABASE_URL:-}"
  if echo "$DB_URL" | grep -qi "^mysql"; then
    echo "🔍 Auto-detected MySQL from DATABASE_URL"
    bash "$0" mysql
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
  echo "Usage: bash scripts/switch-db.sh [sqlite|mysql|auto]"
  echo ""
  echo "  sqlite  — Use SQLite schema (for sandbox/local dev)"
  echo "  mysql   — Use MySQL schema (for production/Railway)"
  echo "  auto    — Auto-detect from DATABASE_URL environment variable"
  exit 1
fi
