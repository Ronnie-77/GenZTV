# 🧠 GenZTV — Project Memory

> **JARVIS-এর স্মৃতিকোষ** — এই ফাইলে GenZTV প্রজেক্টের সব পরিবর্তন, নতুন ফিচার, আর্কিটেকচার সিদ্ধান্ত ও গুরুত্বপূর্ণ ফাইলের তথ্য সংরক্ষিত থাকে। প্রতিটি নতুন কাজের পর এই ফাইল আপডেট হয়।
>
> **Owner**: Mr. Stark (স্যার) — বাংলাভাষী ডেভেলপার  
> **AI Assistant**: JARVIS (Z.ai Code)  
> **Project Root**: `/home/z/my-project`  
> **Stack**: Next.js 16 (App Router) + TypeScript + Prisma (SQLite) + Tailwind + shadcn/ui

---

## 📋 সূচি
1. [প্রজেক্ট ওভারভিউ](#-প্রজেক্ট-ওভারভিউ)
2. [ফিচার ইনভেন্টরি](#-ফিচার-ইনভেন্টরি)
3. [ডেটাবেস স্কিমা](#-ডেটাবেস-স্কিমা)
4. [API রুট তালিকা](#-api-রুট-তালিকা)
5. [প্লেয়ার সিস্টেম](#-প্লেয়ার-সিস্টেম)
6. [সিকিউরিটি সিস্টেম](#-সিকিউরিটি-সিস্টেম)
7. [চ্যানেল সোর্স ও ইম্পোর্ট](#-চ্যানেল-সোর্স-ও-ইম্পোর্ট)
8. [অ্যাডমিন প্যানেল গাইড](#-অ্যাডমিন-প্যানেল-গাইড)
9. [গুরুত্বপূর্ণ ফাইল](#-গুরুত্বপূর্ণ-ফাইল)
10. [পরিবেশ ও ডেভ সার্ভার](#-পরিবেশ-ও-ডেভ-সার্ভার)
11. [পরিবর্তন হিস্ট্রি](#-পরিবর্তন-হিস্ট্রি)
12. [পেন্ডিং / ভবিষ্যৎ কাজ](#-পেন্ডিং--ভবিষ্যৎ-কাজ)

---

## 🎯 প্রজেক্ট ওভারভিউ

**GenZTV** — একটি প্রিমিয়াম লাইভ স্ট্রিমিং প্ল্যাটফর্ম যেখানে বিশ্বের বিভিন্ন দেশের লাইভ টিভি চ্যানেল, স্পোর্টস স্ট্রিম, ও FIFA লাইভ ম্যাচ দেখা যায়। ব্যবহারকারীরা বিনামূল্যে চ্যানেল দেখতে পারে; রাজস্ব আসে বিজ্ঞাপন থেকে।

### মূল ক্ষমতা
- ✅ ৯৪টি লাইভ চ্যানেল (tv.jsssbd.com থেকে কালেক্টেড)
- ✅ HLS প্লেব্যাক (Direct + Proxy + MPEG-TS + JW + iFrame — ৫ ধরনের প্লেয়ার)
- ✅ ম্যাচ ট্র্যাকিং ও লাইভ ম্যাচ নোটিফিকেশন
- ✅ অ্যাডমিন প্যানেল (চ্যানেল/ম্যাচ/ক্যাটাগরি/নোটিশ/অ্যানালিটিক্স)
- ✅ ওয়েব পুশ নোটিফিকেশন
- ✅ অ্যানালিটিক্স (পেজ ভিউ, লাইভ ভিউয়ার, ডিভাইস/ব্রাউজার/দেশ)
- ✅ ক্লায়েন্ট-সাইড সিকিউরিটি (DevTools ব্লক, অ্যাড-ব্লকার ডিটেকশন, anti-debugging)
- ✅ মোবাইল অ্যাপ (APK ডাউনলোড)
- ✅ বাংলা/ইংরেজি সাপোর্ট

---

## 🚀 ফিচার ইনভেন্টরি

### ১. প্লেয়ার সিস্টেম (৫ ধরনের streamType)
| streamType | প্লেয়ার কম্পোনেন্ট | ব্যবহার |
|------------|---------------------|---------|
| `m3u` | `hls-player.tsx` (legacy auto-fallback) | ডিফল্ট |
| `m3u8_direct` | `direct-hls-player.tsx` | CORS-open, low-latency |
| `m3u8_proxy` | `proxy-hls-player.tsx` | CORS/Referer bypass |
| `m3u8_jw` | `jw-hls-player.tsx` | JW Player |
| `mpegts` | `ts-player.tsx` | MPEG-TS (.ts) স্ট্রিম |
| `iframe` | `iframe-player.tsx` | এম্বেড URL |
| `github_m3u` | — | GitHub raw M3U |

### ২. চ্যানেল সোর্স
- **tv.jsssbd.com** (প্রাথমিক) — ৯৪টি চ্যানেল ইম্পোর্টেড
- স্যাম্পল: `public/sample-channels.json`
- JSSS archive: `public/jsssbd-channels.json`
- ইম্পোর্ট স্ক্রিপ্ট: `scripts/import-jsss.ts`

### ৩. সিকিউরিটি (নতুন — Security Master Switch)
- অ্যাডমিন প্যানেল থেকে ON/OFF টগল করা যায়
- OFF থাকলে: right-click, F12, Ctrl+Shift+I, Ctrl+U, DevTools detection, anti-debugging, ad-blocker overlay — সব বন্ধ
- ON থাকলে: ভিজিটরদের জন্য সব প্রোটেকশন সক্রিয়
- পারসিস্টেন্ট (DB-তে সেভ), সাইট-ওয়াইড
- বিস্তারিত: [সিকিউরিটি সিস্টেম](#-সিকিউরিটি-সিস্টেম) সেকশনে

### ৪. ম্যাচ সিস্টেম
- ম্যাচ তৈরি (teamA vs teamB, league, sport, startTime)
- ম্যাচের সাথে একাধিক স্ট্রিম (MatchStream)
- লাইভ স্ট্যাটাস সিঙ্ক + পুশ নোটিফিকেশন

### ৫. অ্যানালিটিক্স
- PageView, DailyStat, VisitorSession মডেল
- লাইভ ভিউয়ার কাউন্ট (heartbeat দিয়ে)
- ডিভাইস/ব্রাউজার/দেশ ব্রেকডাউন

### ৬. নোটিফিকেশন
- সাইট-এন্ট্রি পপআপ (Notice — popup/push/both)
- ইন-অ্যাপ বেল নোটিফিকেশন (AppNotification)
- ওয়েব পুশ (PushSubscription + web-push library)

---

## 🗄️ ডেটাবেস স্কিমা

ফাইল: `prisma/schema.prisma`  
DB: SQLite at `db/custom.db`  
ক্লায়েন্ট: `@/lib/db` (`db` export)

### মডেল তালিকা
| মডেল | কাজ | গুরুত্বপূর্ণ ফিল্ড |
|-------|-----|---------------------|
| `Channel` | লাইভ চ্যানেল | name, streamType, streamUrl, logo, category, sourcePageUrl, autoRefresh, tokenExpiresAt, securityEnabled?(no) |
| `Match` | স্পোর্টস ম্যাচ | title, teamA, teamB, league, startTime, status, liveNotifiedAt |
| `MatchStream` | ম্যাচের স্ট্রিম | matchId, name, type, url |
| `Category` | চ্যানেল ক্যাটাগরি | name, icon, color, order, channelCount |
| `AppSetting` | গ্লোবাল সেটিংস (singleton, id="app") | appName, maintenanceMode, adsEnabled, **securityEnabled**, apkUrl, ga4MeasurementId, customAdScripts (JSON) |
| `Notice` | পপআপ/পুশ নোটিশ | type, title, body, url, imageUrl, pushSent |
| `AppNotification` | ইন-অ্যাপ বেল নোটিফিকেশন | type, title, body, sendPush, pushSent |
| `PageView` | পেজ ভিউ লগ | page, channelId, matchId, country, device, browser |
| `DailyStat` | দৈনিক স্ট্যাট | date (unique), totalViews, peakVisitors, topChannels (JSON) |
| `VisitorSession` | লাইভ ভিউয়ার ট্র্যাকিং | sessionId, lastSeen, currentChannelId, currentMatchId (indexed) |
| `PushSubscription` | ওয়েব পুশ সাবস্ক্রাইবার | endpoint, p256dh, auth |

### স্কিমা পরিবর্তন প্রক্রিয়া
```bash
# 1. prisma/schema.prisma এডিট করো
# 2. Push করো (SQLite-এ migration দরকার নেই)
bun run db:push
# 3. Prisma Client regenerate হয় automatically
#    কিন্তু কখনো কখনো dev server restart দরকার
#    (Turbopack cache stale হলে: rm -rf .next && restart dev)
```

---

## 🔌 API রুট তালিকা

সব API `/api/*` পাথে। Admin-only রুটে `requireAdminAuth` বা `isAdminAuthenticated` ব্যবহার।

### চ্যানেল
- `GET /api/channels` — সব চ্যানেল (active=all দিলে inactive সহ)
- `POST /api/channels` — নতুন চ্যানেল (admin)
- `PUT /api/channels/[id]` — আপডেট (admin)
- `DELETE /api/channels/[id]` — ডিলিট (admin)
- `POST /api/channels/import-file` — JSON/M3U পার্স (admin, DB-তে লেখে না, শুধু parse)
- `POST /api/channels/import` — পার্সড চ্যানেল বাল্ক ইন্সার্ট (admin)
- `GET /api/channels/export` — সব চ্যানেল M3U/JSON এক্সপোর্ট

### সেটিংস
- `GET /api/settings` — সব সেটিংস (public)
- `PUT /api/settings` — সেটিংস আপডেট (admin)
- `GET /api/settings/security` — `{securityEnabled: boolean}` (public, lightweight)
- `PATCH /api/settings/security` — securityEnabled টগল (admin)

### অন্যান্য
- `POST /api/auth/login` / `POST /api/auth/logout` / `GET /api/auth/verify`
- `GET|POST|PUT|DELETE /api/matches/*`
- `GET|POST|PUT|DELETE /api/categories/*`
- `GET|POST|PUT|DELETE /api/notices/*`
- `GET|POST /api/notifications/*`
- `GET /api/analytics/dashboard` / `POST /api/analytics/heartbeat` / `POST /api/analytics/track`
- `GET|POST|DELETE /api/push/*`
- `GET /api/stream-proxy?url=ENCODED` — প্রক্সি HLS (Referer/UA ইনজেকশন + m3u8 rewrite)
- `GET /api/iframe-proxy?url=ENCODED` — iframe প্রক্সি

---

## 🎬 প্লেয়ার সিস্টেম

### প্লেয়ার কম্পোনেন্ট (`src/components/player/`)
| ফাইল | streamType | বৈশিষ্ট্য |
|------|-----------|-----------|
| `video-player.tsx` | — | মাস্টার router; streamType দেখে সঠিক প্লেয়ার রেন্ডার করে |
| `direct-hls-player.tsx` | `m3u8_direct` | LL-HLS, শর্ট বাফার (30s), liveSyncDurationCount:2, fast-fail |
| `proxy-hls-player.tsx` | `m3u8_proxy` | সবসময় `/api/stream-proxy` দিয়ে, বড় বাফার (60s), 3-4 retry |
| `hls-player.tsx` | `m3u` | Legacy auto-fallback chain |
| `jw-hls-player.tsx` | `m3u8_jw` | JW Player wrapper |
| `ts-player.tsx` | `mpegts` | mpegts.js দিয়ে .ts স্ট্রিম |
| `iframe-player.tsx` | `iframe` | এম্বেড URL |

### stream-proxy রুট (`src/app/api/stream-proxy/route.ts`)
- Referer/Origin/User-Agent ইনজেক্ট করে আপস্ট্রিম থেকে fetch
- m3u8 রেসপন্সে আপেন্ড `?XTransformPort=3000` না থাকলে relative পাথ রিকোয়েস্ট ঠিক করে
- TS segment-ও প্রক্সি করে

### কোন চ্যানেল কোন প্লেয়ারে?
- **Direct**: CORS `*` header দেয় এমন CDN (akamaized, cloudfront, jsssbd.com, bozztv, france24, cgtn)
- **Proxy**: CORS নেই বা hotlink protection (Al Jazeera, Madani, wurl.com, amagi.tv)
- **MPEG-TS**: `stype=ts` চ্যানেল (jsssbd.com ts.php proxy)
- **iFrame**: `stype=embed` (Jamuna TV appwrite.network)

---

## 🔒 সিকিউরিটি সিস্টেম

### কম্পোনেন্ট: `src/components/providers/security-provider.tsx`
client-side প্রোটেকশন (যখন `securityEnabled === true`):
1. Right-click context menu ব্লক
2. DevTools keyboard shortcuts ব্লক (F12, Ctrl+Shift+I/J/C/K/E, Ctrl+U, Ctrl+S, Cmd+Opt+I/J/U/C)
3. DevTools detection (window size diff > 160px) → ২ বার confirmed হলে page blank + google.com redirect
4. Ad-blocker detection (DOM bait + network test) → full-screen overlay
5. Text selection ও drag ব্লক
6. Framebusting (iframe-এ এম্বেড হলে top redirect)
7. Copy prevention (non-input elements)
8. Console clear + anti-debugging `debugger` trap (production only)
9. MutationObserver — devtools extension element remove (production only)

### বাইপাস লজিক
- **Admin bypass** (`isAdminAuth === true`): DevTools detection, ad-blocker overlay বন্ধ (admin dev করতে পারে)
- **Mobile bypass** (touch device): size-based DevTools detection skip (mobile UI false positive এড়াতে)
- **Master switch bypass** (`securityEnabled === false`): সব প্রোটেকশন বন্ধ

### Master Switch (নতুন ফিচার — এই সেশনে যোগ)
**DB field**: `AppSetting.securityEnabled Boolean @default(true)`  
**API**: 
- `GET /api/settings/security` → `{securityEnabled: boolean}` (public)
- `PATCH /api/settings/security` → body `{securityEnabled: boolean}`, admin-only, returns updated

**Store**: `useAppStore`-এ `securityEnabled` ও `setSecurityEnabled` (lib/store.ts)  
**Hydration**: SecurityProvider mount-এ fetch করে store-এ set করে  
**Admin UI**: `src/views/admin/settings.tsx`-এ "Security & Dev Tools" card (Maintenance card-এর পরে)
- Switch টগল করলে optimistic update + PATCH + toast
- "PROTECTED" / "DEV MODE" badge
- ৬টি behavior-এর quick-reference grid (Blocked/Allowed, Active/Off)
- Status banner (ON হলে primary color, OFF হলে emerald)

### টগল প্রভাব
| Behavior | ON | OFF |
|----------|----|----|
| Right-click menu | Blocked | Allowed |
| F12 / DevTools | Blocked | Allowed |
| Ctrl+U (view source) | Blocked | Allowed |
| DevTools detection | Active | Off |
| Anti-debugging traps | Active | Off |
| Ad-blocker overlay | Active | Off |

**Verification**: API-level verified — PATCH toggles value true↔false, GET confirms persistence.

---

## 📡 চ্যানেল সোর্স ও ইম্পোর্ট

### tv.jsssbd.com (প্রাথমিক সোর্স)
- **URL**: https://tv.jsssbd.com/index.php
- **এক্সট্র্যাকশন**: `window.CHANNELS` global array (agent-browser দিয়ে eval)
- **৯৭টি চ্যানেল** পাওয়া যায়, প্রতিটিতে: `id, name, cat, logo, url, stype, cats[]`
- **stype**: `hls` (27), `auto` (65), `ts` (3), `dash` (1), `embed` (1)
- **টোকেন**: শুধু ১টি (Now TV) txSecret টোকেন-যুক্ত, বাকি ৯৬টি টোকেন-মুক্ত

### CORS টেস্ট ও শ্রেণীবিভাগ
প্রতিটি চ্যানেল URL-এ HEAD request পাঠিয়ে CORS header চেক করা হয়:
- `access-control-allow-origin: *` + status 200/302/307 → `m3u8_direct`
- CORS নেই বা 403/404 → `m3u8_proxy` (proxy দিয়ে চলবে)
- `stype=ts` → `mpegts`
- `stype=embed` → `iframe`
- `stype=dash` → skip (কোনো dash player নেই)

### ইম্পোর্ট ফাইল
- **Archive**: `public/jsssbd-channels.json` (96 channels, re-importable)
- **Script**: `scripts/import-jsss.ts` (idempotent, URL-based dedup)
- **Run**: `bun run scripts/import-jsss.ts`
- প্রতিটি চ্যানেলে `sourcePageUrl = https://tv.jsssbd.com/index.php` (ভবিষ্যৎ re-extraction-এর জন্য)

### বর্তমান DB স্ট্যাটাস
- **৯৪টি চ্যানেল** ডেটাবেসে (২টি আগে থেকে ছিল — beIN Xtra, TRT Spor)
- ক্যাটাগরি: FIFA (39), Sports (24), News (10), Bangladesh (8), Movies (2), Entertainment (2), Comedy (2), Documentary (3), Science (2), Kids (2), Lifestyle (2), India (1)

---

## ⚙️ অ্যাডমিন প্যানেল গাইড

### লগইন
- URL: `/#/admin`
- Password: `Ronnie7700`
- Auth: cookie-based session (`zeng-admin-session`)

### পেজ তালিকা (`src/views/admin/`)
1. **Dashboard** (`dashboard.tsx`) — স্ট্যাটস, quick actions, push subscribers
2. **Analytics** (`analytics.tsx`) — ভিউ, লাইভ ভিউয়ার, ডিভাইস/দেশ
3. **Channels** (`channels.tsx`) — চ্যানেল CRUD, import, streamType selector
4. **Matches** (`matches.tsx`) — ম্যাচ CRUD, MatchStream add
5. **Categories** (`categories.tsx`) — ক্যাটাগরি CRUD
6. **Notices** (`notices.tsx`) — পপআপ/পুশ নোটিশ
7. **Notifications** (`notifications.tsx`) — ইন-অ্যাপ বেল নোটিফিকেশন
8. **Settings** (`settings.tsx`) — অ্যাপ সেটিংস, ads, security toggle, APK upload
9. **Data** (`data.tsx`) — ডেটা export/import, DB reset

### Settings পেজের কার্ড ক্রম
1. General (appName, logo, hero banner, default quality)
2. Featured Channel
3. APK Upload
4. **Maintenance Mode**
5. **Security & Dev Tools** (নতুন)
6. Ad Controls (master + home + video + custom scripts)

---

## 📁 গুরুত্বপূর্ণ ফাইল

### কোর
```
src/app/page.tsx                          — একমাত্র user-visible route
src/app/layout.tsx                        — root layout, providers wrap
src/components/layout/app-shell.tsx       — মূল app shell (nav, routing)
src/lib/store.ts                          — Zustand global store
src/lib/db.ts                             — Prisma client
src/lib/auth.ts                           — admin auth helpers
src/lib/api.ts                            — frontend API client
src/proxy.ts                              — Next.js proxy/middleware
```

### প্লেয়ার
```
src/components/player/video-player.tsx          — master router
src/components/player/direct-hls-player.tsx      — m3u8_direct
src/components/player/proxy-hls-player.tsx       — m3u8_proxy
src/components/player/hls-player.tsx             — m3u (legacy)
src/components/player/ts-player.tsx              — mpegts
src/components/player/iframe-player.tsx          — iframe
src/components/player/jw-hls-player.tsx          — m3u8_jw
src/components/player/player-controls.tsx        — shared controls
```

### প্রোভাইডার
```
src/components/providers/security-provider.tsx  — সিকিউরিটি (master switch supported)
```

### API
```
src/app/api/stream-proxy/route.ts        — প্রক্সি HLS
src/app/api/settings/route.ts            — সেটিংস (securityEnabled field সহ)
src/app/api/settings/security/route.ts   — সিকিউরিটি টগল (নতুন)
src/app/api/channels/import-file/route.ts — JSON/M3U parse
```

### পাবলিক
```
public/jsssbd-channels.json    — JSSS archive (96 channels)
public/sample-channels.json    — স্যাম্পল (direct+proxy demo)
public/streaming-pipeline.txt  — ডকুমেন্টেশন
public/manifest.json           — PWA manifest
public/sw.js                   — service worker
public/notif-worker.js         — push notification worker
```

### স্ক্রিপ্ট
```
scripts/import-jsss.ts         — JSSS চ্যানেল ইম্পোর্ট
dev-keepalive.sh               — dev server auto-restart wrapper
```

---

## 🖥️ পরিবেশ ও ডেভ সার্ভার

### কমান্ড
```bash
bun run dev          # dev server (port 3000, background)
bun run lint         # ESLint check
bun run db:push      # Prisma schema → SQLite
bunx prisma generate # Prisma client regenerate
```

### পরিচিত সমস্যা
- **Turbopack OOM**: বড় compile (বিশেষ করে `/` page) সময় dev server crash করে। `dev-keepalive.sh` auto-restart করে।
- **Prisma Client stale**: schema push-এর পর কখনো `bunx prisma generate` + `rm -rf .next` + dev restart দরকার।
- **Lint errors (pre-existing, non-blocking)**: `src/lib/use-in-app-notifications.ts:456` (setState in effect) — আমাদের পরিবর্তন নয়।

### Caddy Gateway
- এক্সটার্নাল port 1টাই exposed; Caddy proxy করে
- API request-এ অন্য port দরকার হলে: `?XTransformPort=PORT` query param
- Frontend-এ সবসময় relative path (`/api/...`), absolute URL নয়

### স্যান্ডবক্স সীমাবদ্ধতা
- ইউজার শুধু `/` route দেখেন
- `bun run build` নিষিদ্ধ (শুধু dev)
- z-ai-web-dev-sdk শুধু backend-এ

---

## 📜 পরিবর্তন হিস্ট্রি

### Session 1 — Initial Setup (আগের conversation)
- GenZTV-main.zip আপলোড → `/home/z/my-project/`-এ unpack
- `bun install`, `prisma db push`
- ২টি dedicated HLS প্লেয়ার তৈরি: `direct-hls-player.tsx` + `proxy-hls-player.tsx`
- `video-player.tsx`-এ m3u8_direct / m3u8_proxy routing
- Admin panel-ে ২টি নতুন streamType option
- `import-file` API-তে streamType field support
- `public/sample-channels.json` আপডেট

### Session 2 — JSSS TV Channel Import
- **Task ID: 10** — tv.jsssbd.com থেকে চ্যানেল কালেক্ট
- agent-browser দিয়ে `window.CHANNELS` array extract (৯৭টি চ্যানেল)
- CORS HEAD test সব ৯৭টির উপর
- শ্রেণীবিভাগ: direct=60, proxy=32, mpegts=3, iframe=1, dash skip=1
- `public/jsssbd-channels.json` archive তৈরি
- `scripts/import-jsss.ts` idempotent import script
- DB-তে ৯৪টি চ্যানেল imported
- Bug fix: `channels.tsx` line 1059 JSX parse error (placeholder escape quote)
- Browser verification: Al Jazeera (proxy) + DW English (direct) 1080p live ✓

### Session 3 — Security Master Switch (বর্তমান)
- **Goal**: অ্যাডমিন প্যানেল থেকে সিকিউরিটি ON/OFF টগল যাতে dev tools ইউজ করা যায়
- **Schema**: `AppSetting.securityEnabled Boolean @default(true)` যোগ + `db:push`
- **API**: `/api/settings/security` route (GET public, PATCH admin-only) তৈরি
- **Settings route**: `/api/settings` PUT-এ `securityEnabled` field যোগ (যাতে general save-এ wipe না হয়)
- **Store**: `useAppStore`-এ `securityEnabled` + `setSecurityEnabled` যোগ (`src/lib/store.ts`)
- **SecurityProvider**: 
  - Mount-এ `/api/settings/security` fetch করে store hydrate
  - Main setup effect-এ `if (!securityEnabled) return` early-exit
  - `detectDevTools`, `registerDevToolsHit`, `checkAdBlocker`, `setupConsoleProtection`, `setupMutationObserver` — প্রতিটিতে `securityEnabled` check যোগ
  - `securityEnabled` dependency array-তে যোগ (toggle হলে effect re-run)
  - Ad-blocker overlay render check-এ `securityEnabled &&` guard যোগ
- **Admin UI** (`src/views/admin/settings.tsx`):
  - `useAppStore` import যোগ
  - `securityEnabled`, `setSecurityEnabled`, `securityToggling` state
  - `handleSecurityToggle(next)` — optimistic update + PATCH + toast
  - "Security & Dev Tools" card (Maintenance-এর পরে):
    - Lock/Unlock icon, PROTECTED/DEV MODE badge
    - Switch (disabled while toggling)
    - Status banner (ON: primary, OFF: emerald)
    - ৬টি behavior quick-reference grid
- **Lint**: আমার পরিবর্তনে কোনো নতুন error নেই (pre-existing ২টি error আগে থেকে)
- **Verification**:
  - ✅ GET `/api/settings/security` → `{securityEnabled: true}`
  - ✅ PATCH `/api/settings/security` `{securityEnabled: false}` → `{securityEnabled: false}`
  - ✅ PATCH back `{securityEnabled: true}` → `{securityEnabled: true}`
  - ✅ Change persists (GET after PATCH confirms)
  - ⚠️ Page-level browser verification সম্পূর্ণ হয়নি কারণ sandbox-এ dev server বারবার crash করছে (Turbopack OOM "Compiling /" stage-এ)

---

## 🔮 পেন্ডিং / ভবিষ্যৎ কাজ

### টোকেন রিফ্রেশ অটোমেশন (স্যার বলেছেন "পরে করা যাবে")
বর্তমানে টোকেন-যুক্ত URL (hdntl, txSecret) মেয়াদ শেষ হলে ম্যানুয়ালি আপডেট করতে হয়। প্ল্যান:
1. **Schema** (আংশিক আছে): `sourcePageUrl`, `tokenExpiresAt`, `lastRefreshedAt`, `refreshPattern`, `autoRefresh`, `refreshError` ফিল্ড ইতিমধ্যে Channel-এ আছে
2. **Re-extraction API** (`/api/channels/[id]/refresh`) — agent-browser দিয়ে source page থেকে নতুন m3u8 intercept
3. **Proactive cron** (`/api/cron/refresh-tokens`) — প্রতি ৩০ মিনিটে check
4. **Player-side detection** — 403 হলে auto-refresh trigger
5. **hdntl `exp=` parser** — timestamp auto-extract utility
6. **Admin UI** — "Refresh Token" button + "Auto-refresh" toggle per channel

### অন্যান্য ভবিষ্যৎ কাজ
- DASH player support (বর্তমানে ১টি চ্যানেল skip হয়)
- আরও চ্যানেল সোর্স যোগ (স্যার চাইলে)
- SecurityProvider-এ আরও bypass option (যেমন শুধু right-click allow, বাকি সব on)

---

## 📞 যোগাযোগ

- **স্যার**: Mr. Stark (বাংলাভাষী)
- **AI**: JARVIS (এই assistant)
- **শুরু**: "JARVIS, অনলাইন?" → আমি ready

> *"Sometimes you gotta run before you can walk."* — Tony Stark  
> *JARVIS-এর মতো আমি স্যার-এর প্রতিটি নির্দেশ পালন করি।* 🤖
