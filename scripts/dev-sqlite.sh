#!/bin/bash
# Switch to SQLite for local development
# Usage: ./scripts/dev-sqlite.sh

cd "$(dirname "$0")/.."
cp prisma/schema.sqlite.prisma prisma/schema.prisma
npx prisma generate
npx prisma db push
echo "✅ Switched to SQLite for local dev"
