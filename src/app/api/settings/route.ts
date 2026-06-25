import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { isAdminAuthenticated } from '@/lib/auth'

// GET /api/settings — public read (needed for maintenance mode check, app name, etc.)
export async function GET() {
  try {
    let settings = await db.appSetting.findUnique({ where: { id: 'app' } })
    if (!settings) {
      settings = await db.appSetting.create({ data: { id: 'app' } })
    }
    return NextResponse.json(settings)
  } catch (error) {
    console.error('[Settings] Error fetching settings:', error)
    const message = error instanceof Error ? error.message : 'Failed to fetch settings'
    return NextResponse.json({ error: 'Failed to fetch settings', detail: message }, { status: 500 })
  }
}

// PUT /api/settings — update settings (admin only)
export async function PUT(req: NextRequest) {
  try {
    // Check admin auth
    const authenticated = await isAdminAuthenticated(req)
    if (!authenticated) {
      console.warn('[Settings] Unauthorized PUT attempt — session may have expired')
      return NextResponse.json({ error: 'Unauthorized — please log in again' }, { status: 401 })
    }

    let body: unknown
    try {
      body = await req.json()
    } catch (parseErr) {
      console.error('[Settings] JSON parse error:', parseErr)
      return NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400 })
    }
    const b = body as Record<string, unknown>

    const settings = await db.appSetting.upsert({
      where: { id: 'app' },
      update: {
        ...(b.appName !== undefined && { appName: String(b.appName) }),
        ...(b.logoUrl !== undefined && { logoUrl: String(b.logoUrl) }),
        ...(b.maintenanceMode !== undefined && { maintenanceMode: Boolean(b.maintenanceMode) }),
        ...(b.featuredChannelId !== undefined && { featuredChannelId: String(b.featuredChannelId) }),
        ...(b.heroBannerText !== undefined && { heroBannerText: String(b.heroBannerText) }),
        ...(b.defaultQuality !== undefined && { defaultQuality: String(b.defaultQuality) }),
        ...(b.bannerAdScript !== undefined && { bannerAdScript: String(b.bannerAdScript) }),
        ...(b.socialBarAdScript !== undefined && { socialBarAdScript: String(b.socialBarAdScript) }),
        ...(b.customAdScripts !== undefined && { customAdScripts: typeof b.customAdScripts === 'string' ? b.customAdScripts : JSON.stringify(b.customAdScripts) }),
        ...(b.adsEnabled !== undefined && { adsEnabled: Boolean(b.adsEnabled) }),
        ...(b.homeAdsEnabled !== undefined && { homeAdsEnabled: Boolean(b.homeAdsEnabled) }),
        ...(b.videoAdsEnabled !== undefined && { videoAdsEnabled: Boolean(b.videoAdsEnabled) }),
        ...(b.securityEnabled !== undefined && { securityEnabled: Boolean(b.securityEnabled) }),
        ...(b.apkUrl !== undefined && { apkUrl: String(b.apkUrl) }),
        ...(b.redirectAdUrl !== undefined && { redirectAdUrl: String(b.redirectAdUrl) }),
        ...(b.redirectAdEnabled !== undefined && { redirectAdEnabled: Boolean(b.redirectAdEnabled) }),
      },
      create: {
        id: 'app',
        appName: b.appName ? String(b.appName) : 'GenZ TV',
        logoUrl: b.logoUrl ? String(b.logoUrl) : '',
        maintenanceMode: b.maintenanceMode !== undefined ? Boolean(b.maintenanceMode) : false,
        featuredChannelId: b.featuredChannelId ? String(b.featuredChannelId) : '',
        heroBannerText: b.heroBannerText ? String(b.heroBannerText) : '',
        defaultQuality: b.defaultQuality ? String(b.defaultQuality) : 'auto',
        bannerAdScript: b.bannerAdScript ? String(b.bannerAdScript) : '',
        socialBarAdScript: b.socialBarAdScript ? String(b.socialBarAdScript) : '',
        customAdScripts: typeof b.customAdScripts === 'string' ? b.customAdScripts : JSON.stringify(b.customAdScripts || []),
        adsEnabled: b.adsEnabled !== undefined ? Boolean(b.adsEnabled) : true,
        homeAdsEnabled: b.homeAdsEnabled !== undefined ? Boolean(b.homeAdsEnabled) : true,
        videoAdsEnabled: b.videoAdsEnabled !== undefined ? Boolean(b.videoAdsEnabled) : true,
        securityEnabled: b.securityEnabled !== undefined ? Boolean(b.securityEnabled) : true,
        apkUrl: b.apkUrl ? String(b.apkUrl) : '',
        redirectAdUrl: b.redirectAdUrl ? String(b.redirectAdUrl) : '',
        redirectAdEnabled: b.redirectAdEnabled !== undefined ? Boolean(b.redirectAdEnabled) : false,
      },
    })
    return NextResponse.json(settings)
  } catch (error) {
    console.error('[Settings] Error updating settings:', error)
    // Return a useful error message so the admin can see WHY the save failed
    // (e.g. Prisma validation, unknown field, DB connection, etc.)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { error: 'Failed to update settings', detail: message },
      { status: 500 },
    )
  }
}
