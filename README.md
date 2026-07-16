# GenZ TV — Premium Live Streaming Platform

## Quick Start (Local Development)

### Prerequisites
- **Node.js** 20+ (or Bun)
- **npm** or **bun**

### Setup

```bash
# 1. Install dependencies
npm install

# 2. Create .env file
cp .env.example .env

# 3. Generate Prisma client & push schema to SQLite
npx prisma generate
npx prisma db push

# 4. Start dev server
npm run dev
```

Open http://localhost:3000 in your browser.

### Admin Panel
- Navigate to http://localhost:3000/#/admin
- Default password: `admin123` (set in .env as ADMIN_PASSWORD)

---

## Switching Database

### SQLite (default, local dev)
The default `prisma/schema.prisma` is SQLite. No changes needed.

### PostgreSQL (production — Neon)
```bash
# Switch to PostgreSQL schema
bash scripts/switch-db.sh postgresql

# Set DATABASE_URL in .env to your Neon connection string
# Then push schema:
npx prisma generate
npx prisma db push
```

Switch back to SQLite:
```bash
bash scripts/switch-db.sh sqlite
npx prisma generate
npx prisma db push
```

---

## Deploy to Vercel + Neon

1. Create a free database at https://neon.tech
2. Push this repo to GitHub
3. Import repo in https://vercel.com
4. Set environment variables:
   - `DATABASE_URL` — Neon PostgreSQL connection string
   - `ADMIN_PASSWORD` — your admin password
   - `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT`
5. Before first deploy, push schema:
   ```bash
   DATABASE_URL="your-neon-url" npx prisma db push
   ```
6. Deploy!

---

## Project Structure

```
├── prisma/              # Database schema (SQLite default)
├── public/              # Static assets, service worker
├── src/
│   ├── app/api/         # API routes
│   │   ├── push/        # Push notification API
│   │   ├── channels/    # Channel management
│   │   ├── matches/     # Sports match tracking
│   │   ├── settings/    # App settings
│   │   └── ...
│   ├── components/      # React components
│   ├── lib/             # Utilities, hooks, config
│   └── views/           # Page views (home, admin, etc.)
├── scripts/             # DB switch, migration scripts
└── package.json
```

## Features
- 📺 Live TV channel streaming (M3U/HLS/iframe)
- ⚽ Sports match tracking with live status
- 🔔 Push notifications (VAPID/web-push)
- 🎯 Admin panel with full management
- 📊 Analytics & visitor tracking
- 🛡️ Security features (bot protection, content security)
- 📱 PWA support (installable on phones/TVs)
