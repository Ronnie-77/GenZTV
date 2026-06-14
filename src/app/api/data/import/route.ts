import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAdminAuth } from '@/lib/auth'

// POST /api/data/import — Import data from JSON (admin only)
export async function POST(req: NextRequest) {
  return requireAdminAuth(req, async () => {
    try {
      const body = await req.json()

      if (!body._meta || !body._meta.version) {
        return NextResponse.json({ error: 'Invalid import file' }, { status: 400 })
      }

      const r = {
        channels: { imported: 0, skipped: 0 },
        matches: { imported: 0, skipped: 0 },
        categories: { imported: 0, skipped: 0 },
        settings: false,
        dailyStats: { imported: 0, skipped: 0 },
        visitorSessions: { imported: 0, skipped: 0 },
        pageViews: { imported: 0, skipped: 0 },
        pushSubscriptions: { imported: 0, skipped: 0 },
      }

      // Settings
      if (body.settings?.id) {
        try {
          await db.appSetting.upsert({
            where: { id: 'app' },
            update: {
              appName: body.settings.appName, logoUrl: body.settings.logoUrl,
              maintenanceMode: body.settings.maintenanceMode, featuredChannelId: body.settings.featuredChannelId,
              heroBannerText: body.settings.heroBannerText, defaultQuality: body.settings.defaultQuality,
              bannerAdScript: body.settings.bannerAdScript, socialBarAdScript: body.settings.socialBarAdScript,
              customAdScripts: body.settings.customAdScripts, adsEnabled: body.settings.adsEnabled,
              homeAdsEnabled: body.settings.homeAdsEnabled, videoAdsEnabled: body.settings.videoAdsEnabled,
              apkUrl: body.settings.apkUrl,
            },
            create: {
              id: 'app', appName: body.settings.appName || 'GenZ TV', logoUrl: body.settings.logoUrl || '',
              maintenanceMode: body.settings.maintenanceMode || false, featuredChannelId: body.settings.featuredChannelId || '',
              heroBannerText: body.settings.heroBannerText || '', defaultQuality: body.settings.defaultQuality || 'auto',
              bannerAdScript: body.settings.bannerAdScript || '', socialBarAdScript: body.settings.socialBarAdScript || '',
              customAdScripts: body.settings.customAdScripts || '[]',
              adsEnabled: body.settings.adsEnabled !== undefined ? body.settings.adsEnabled : true,
              homeAdsEnabled: body.settings.homeAdsEnabled !== undefined ? body.settings.homeAdsEnabled : true,
              videoAdsEnabled: body.settings.videoAdsEnabled !== undefined ? body.settings.videoAdsEnabled : true,
              apkUrl: body.settings.apkUrl || '',
            },
          })
          r.settings = true
        } catch { /* skip */ }
      }

      // Categories
      if (Array.isArray(body.categories)) {
        for (const c of body.categories) {
          try {
            await db.category.upsert({
              where: { id: c.id },
              update: { name: c.name, icon: c.icon ?? '', color: c.color ?? '', order: c.order ?? 0, channelCount: c.channelCount ?? 0 },
              create: { id: c.id, name: c.name, icon: c.icon ?? '', color: c.color ?? '', order: c.order ?? 0, channelCount: c.channelCount ?? 0 },
            })
            r.categories.imported++
          } catch { r.categories.skipped++ }
        }
      }

      // Channels
      if (Array.isArray(body.channels)) {
        for (const ch of body.channels) {
          try {
            await db.channel.upsert({
              where: { id: ch.id },
              update: { name: ch.name, logo: ch.logo ?? '', category: ch.category ?? 'entertainment', streamType: ch.streamType ?? 'm3u', streamUrl: ch.streamUrl ?? '', githubM3uPath: ch.githubM3uPath ?? '', language: ch.language ?? '', country: ch.country ?? '', tags: ch.tags ?? '', isFeatured: ch.isFeatured ?? false, isActive: ch.isActive ?? true, viewCount: ch.viewCount ?? 0 },
              create: { id: ch.id, name: ch.name, logo: ch.logo ?? '', category: ch.category ?? 'entertainment', streamType: ch.streamType ?? 'm3u', streamUrl: ch.streamUrl ?? '', githubM3uPath: ch.githubM3uPath ?? '', language: ch.language ?? '', country: ch.country ?? '', tags: ch.tags ?? '', isFeatured: ch.isFeatured ?? false, isActive: ch.isActive ?? true, viewCount: ch.viewCount ?? 0 },
            })
            r.channels.imported++
          } catch { r.channels.skipped++ }
        }
      }

      // Matches + Streams
      if (Array.isArray(body.matches)) {
        for (const m of body.matches) {
          try {
            await db.match.upsert({
              where: { id: m.id },
              update: { title: m.title, sport: m.sport ?? 'football', teamA: m.teamA, teamALogo: m.teamALogo ?? '', teamB: m.teamB, teamBLogo: m.teamBLogo ?? '', league: m.league ?? '', thumbnail: m.thumbnail ?? '', startTime: m.startTime ? new Date(m.startTime) : new Date(), endTime: m.endTime ? new Date(m.endTime) : null, status: m.status ?? 'upcoming', isFeatured: m.isFeatured ?? false },
              create: { id: m.id, title: m.title, sport: m.sport ?? 'football', teamA: m.teamA, teamALogo: m.teamALogo ?? '', teamB: m.teamB, teamBLogo: m.teamBLogo ?? '', league: m.league ?? '', thumbnail: m.thumbnail ?? '', startTime: m.startTime ? new Date(m.startTime) : new Date(), endTime: m.endTime ? new Date(m.endTime) : null, status: m.status ?? 'upcoming', isFeatured: m.isFeatured ?? false },
            })
            if (Array.isArray(m.streams)) {
              for (const s of m.streams) {
                try {
                  await db.matchStream.upsert({
                    where: { id: s.id },
                    update: { name: s.name ?? 'Stream 1', channel: s.channel ?? '', type: s.type ?? 'iframe', url: s.url ?? '' },
                    create: { id: s.id, matchId: m.id, name: s.name ?? 'Stream 1', channel: s.channel ?? '', type: s.type ?? 'iframe', url: s.url ?? '' },
                  })
                } catch { /* skip stream */ }
              }
            }
            r.matches.imported++
          } catch { r.matches.skipped++ }
        }
      }

      // Daily Stats
      if (Array.isArray(body.dailyStats)) {
        for (const d of body.dailyStats) {
          try {
            await db.dailyStat.upsert({
              where: { date: d.date },
              update: { totalViews: d.totalViews ?? 0, uniqueVisitors: d.uniqueVisitors ?? 0, topPages: d.topPages ?? '{}', topChannels: d.topChannels ?? '{}', topCountries: d.topCountries ?? '{}' },
              create: { date: d.date, totalViews: d.totalViews ?? 0, uniqueVisitors: d.uniqueVisitors ?? 0, topPages: d.topPages ?? '{}', topChannels: d.topChannels ?? '{}', topCountries: d.topCountries ?? '{}' },
            })
            r.dailyStats.imported++
          } catch { r.dailyStats.skipped++ }
        }
      }

      // Visitor Sessions
      if (Array.isArray(body.visitorSessions)) {
        for (const v of body.visitorSessions) {
          try {
            await db.visitorSession.upsert({
              where: { sessionId: v.sessionId },
              update: { lastSeen: v.lastSeen ? new Date(v.lastSeen) : new Date(), pageCount: v.pageCount ?? 0, country: v.country ?? '', userAgent: v.userAgent ?? '', ip: v.ip ?? '' },
              create: { sessionId: v.sessionId, firstSeen: v.firstSeen ? new Date(v.firstSeen) : new Date(), lastSeen: v.lastSeen ? new Date(v.lastSeen) : new Date(), pageCount: v.pageCount ?? 0, country: v.country ?? '', userAgent: v.userAgent ?? '', ip: v.ip ?? '' },
            })
            r.visitorSessions.imported++
          } catch { r.visitorSessions.skipped++ }
        }
      }

      // Page Views (create only, limit 5000)
      if (Array.isArray(body.pageViews)) {
        for (const p of body.pageViews.slice(0, 5000)) {
          try {
            await db.pageView.create({ data: { sessionId: p.sessionId ?? '', page: p.page ?? '', channelId: p.channelId ?? null, referrer: p.referrer ?? '', userAgent: p.userAgent ?? '', country: p.country ?? '', ip: p.ip ?? '', createdAt: p.createdAt ? new Date(p.createdAt) : new Date() } })
            r.pageViews.imported++
          } catch { r.pageViews.skipped++ }
        }
      }

      // Push Subscriptions
      if (Array.isArray(body.pushSubscriptions)) {
        for (const ps of body.pushSubscriptions) {
          try {
            await db.pushSubscription.upsert({
              where: { endpoint: ps.endpoint },
              update: { p256dh: ps.p256dh, auth: ps.auth },
              create: { endpoint: ps.endpoint, p256dh: ps.p256dh, auth: ps.auth },
            })
            r.pushSubscriptions.imported++
          } catch { r.pushSubscriptions.skipped++ }
        }
      }

      return NextResponse.json({ success: true, result: r })
    } catch (error) {
      console.error('[Data Import] Error:', error)
      const msg = error instanceof Error ? error.message : 'Import failed'
      return NextResponse.json({ error: msg }, { status: 500 })
    }
  })
}
