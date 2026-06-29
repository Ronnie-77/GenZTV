#!/usr/bin/env bash
# Switch Prisma schema between SQLite (sandbox/dev) and MySQL (production)
# Usage: bash scripts/switch-db.sh sqlite | bash scripts/switch-db.sh mysql

set -e

SCHEMA_DIR="$(cd "$(dirname "$0")/.." && pwd)/prisma"

if [ "$1" = "sqlite" ]; then
  echo "🔄 Switching to SQLite schema..."
  cp "$SCHEMA_DIR/schema.sqlite.prisma" "$SCHEMA_DIR/schema.prisma"
  echo "✅ Active schema: SQLite (schema.sqlite.prisma → schema.prisma)"
  echo "   Run 'bun run db:push' to sync the database."
elif [ "$1" = "mysql" ]; then
  echo "🔄 Switching to MySQL schema..."
  # The MySQL schema is the base schema with @db.VarChar, @db.MediumText, etc.
  # We need to regenerate it from the MySQL template
  if [ -f "$SCHEMA_DIR/schema.mysql.prisma" ]; then
    cp "$SCHEMA_DIR/schema.mysql.prisma" "$SCHEMA_DIR/schema.prisma"
  else
    echo "⚠️  No schema.mysql.prisma found. Using current schema.prisma as-is."
    echo "   Make sure schema.prisma has provider = \"mysql\" and @db.* annotations."
  fi
  echo "✅ Active schema: MySQL (schema.prisma)"
  echo "   Make sure DATABASE_URL points to a MySQL database."
  echo "   Run 'bun run db:push' to sync the database."
else
  echo "Usage: bash scripts/switch-db.sh [sqlite|mysql]"
  echo ""
  echo "  sqlite  — Use SQLite schema (for sandbox/local dev)"
  echo "  mysql   — Use MySQL schema (for production/Railway)"
  exit 1
fi
