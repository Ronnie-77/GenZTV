#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# migrate-to-mysql.sh — Export SQLite data and import into MySQL
#
# This script handles the data migration from SQLite (local/sandbox)
# to MySQL (production/Railway). It exports all data as JSON and
# provides import commands for Railway.
#
# Usage:
#   bash scripts/migrate-to-mysql.sh export   — Export SQLite data to JSON
#   bash scripts/migrate-to-mysql.sh import   — Import JSON data into MySQL
#   bash scripts/migrate-to-mysql.sh dry-run  — Show what would be migrated
# ═══════════════════════════════════════════════════════════════

set -e

EXPORT_DIR="$(cd "$(dirname "$0")/.." && pwd)/migration-export"

# ── Export SQLite data to JSON ──
do_export() {
  echo "📦 Exporting SQLite data to JSON..."
  mkdir -p "$EXPORT_DIR"

  # Make sure we're using SQLite schema
  bash "$(dirname "$0")/switch-db.sh" sqlite

  # Export each table using Prisma Studio / raw queries via a Node script
  node -e "
    const { PrismaClient } = require('@prisma/client');
    const fs = require('fs');
    const path = require('path');

    async function exportData() {
      const db = new PrismaClient();
      const dir = '$EXPORT_DIR';

      const tables = [
        { name: 'channels', fn: () => db.channel.findMany() },
        { name: 'matches', fn: () => db.match.findMany({ include: { streams: true } }) },
        { name: 'categories', fn: () => db.category.findMany() },
        { name: 'settings', fn: () => db.appSetting.findMany() },
        { name: 'feedback', fn: () => db.feedback.findMany() },
        { name: 'notices', fn: () => db.notice.findMany() },
        { name: 'notifications', fn: () => db.appNotification.findMany() },
        { name: 'pushSubscriptions', fn: () => db.pushSubscription.findMany() },
        { name: 'pageViews', fn: () => db.pageView.findMany({ take: 50000 }) },
        { name: 'dailyStats', fn: () => db.dailyStat.findMany() },
        { name: 'visitorSessions', fn: () => db.visitorSession.findMany() },
      ];

      for (const table of tables) {
        try {
          const data = await table.fn();
          const filePath = path.join(dir, table.name + '.json');
          fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
          console.log('✅ ' + table.name + ': ' + data.length + ' records → ' + filePath);
        } catch (err) {
          console.log('⚠️  ' + table.name + ': skipped (' + (err.message || err) + ')');
        }
      }

      await db.\$disconnect();
      console.log('\\n🎉 Export complete! Files are in ' + dir);
    }

    exportData().catch(e => {
      console.error('Export failed:', e);
      process.exit(1);
    });
  "
}

# ── Import JSON data into MySQL ──
do_import() {
  echo "📥 Importing JSON data into MySQL..."

  # Switch to MySQL schema
  bash "$(dirname "$0")/switch-db.sh" mysql

  # Push schema to MySQL first
  echo "📐 Pushing MySQL schema..."
  npx prisma db push --accept-data-loss

  node -e "
    const { PrismaClient } = require('@prisma/client');
    const fs = require('fs');
    const path = require('path');

    async function importData() {
      const db = new PrismaClient();
      const dir = '$EXPORT_DIR';

      // Import order matters: settings first, then references
      const importOrder = [
        { name: 'settings', model: 'appSetting', idField: 'id' },
        { name: 'categories', model: 'category', idField: 'id' },
        { name: 'channels', model: 'channel', idField: 'id' },
        { name: 'matches', model: 'match', idField: 'id' },
        { name: 'feedback', model: 'feedback', idField: 'id' },
        { name: 'notices', model: 'notice', idField: 'id' },
        { name: 'notifications', model: 'appNotification', idField: 'id' },
        { name: 'pushSubscriptions', model: 'pushSubscription', idField: 'id' },
        { name: 'dailyStats', model: 'dailyStat', idField: 'id' },
        { name: 'visitorSessions', model: 'visitorSession', idField: 'id' },
        { name: 'pageViews', model: 'pageView', idField: 'id' },
      ];

      for (const table of importOrder) {
        const filePath = path.join(dir, table.name + '.json');
        if (!fs.existsSync(filePath)) {
          console.log('⚠️  ' + table.name + ': no export file, skipping');
          continue;
        }

        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        if (data.length === 0) {
          console.log('⚠️  ' + table.name + ': empty, skipping');
          continue;
        }

        let imported = 0;
        let errors = 0;

        // Process in batches of 100
        for (let i = 0; i < data.length; i += 100) {
          const batch = data.slice(i, i + 100);
          for (const record of batch) {
            try {
              await db[table.model].upsert({
                where: { [table.idField]: record[table.idField] },
                update: record,
                create: record,
              });
              imported++;
            } catch (err) {
              errors++;
              if (errors <= 3) {
                console.log('  ⚠️  Error importing record: ' + (err.message || err).substring(0, 100));
              }
            }
          }
        }

        console.log('✅ ' + table.name + ': ' + imported + '/' + data.length + ' imported' +
          (errors > 0 ? ' (' + errors + ' errors)' : ''));
      }

      await db.\$disconnect();
      console.log('\\n🎉 Import complete!');
    }

    importData().catch(e => {
      console.error('Import failed:', e);
      process.exit(1);
    });
  "
}

# ── Dry run — show what would be migrated ──
do_dry_run() {
  echo "🔍 Dry run — checking export files..."
  if [ ! -d "$EXPORT_DIR" ]; then
    echo "❌ No export directory found. Run 'bash scripts/migrate-to-mysql.sh export' first."
    exit 1
  fi

  TOTAL=0
  for file in "$EXPORT_DIR"/*.json; do
    if [ -f "$file" ]; then
      COUNT=$(node -e "const d=require('$file'); console.log(Array.isArray(d)?d.length:1)" 2>/dev/null || echo "?")
      NAME=$(basename "$file" .json)
      echo "  📄 $NAME: $COUNT records ($(du -h "$file" | cut -f1))"
      TOTAL=$((TOTAL + COUNT))
    fi
  done

  echo ""
  echo "📊 Total records to migrate: $TOTAL"
  echo ""
  echo "To proceed with import:"
  echo "  1. Set DATABASE_URL to MySQL connection string"
  echo "  2. Run: bash scripts/migrate-to-mysql.sh import"
}

# ── Main ──
case "${1:-}" in
  export)
    do_export
    ;;
  import)
    do_import
    ;;
  dry-run)
    do_dry_run
    ;;
  *)
    echo "GenZTV — SQLite → MySQL Migration Tool"
    echo ""
    echo "Usage: bash scripts/migrate-to-mysql.sh [export|import|dry-run]"
    echo ""
    echo "  export   — Export all SQLite data to JSON files (migration-export/)"
    echo "  import   — Import JSON data into MySQL (requires DATABASE_URL set)"
    echo "  dry-run  — Show what would be migrated (reads export files)"
    echo ""
    echo "Typical workflow:"
    echo "  1. bash scripts/migrate-to-mysql.sh export   # Export from SQLite"
    echo "  2. DATABASE_URL=mysql://... bash scripts/migrate-to-mysql.sh import  # Import to MySQL"
    exit 1
    ;;
esac
