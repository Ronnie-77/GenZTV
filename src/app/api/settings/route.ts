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

    const body = await req.json()

    const settings = await db.appSetting.upsert({
      where: { id: 'app' },
      update: {
        ...(body.appName !== undefined && { appName: body.appName }),
        ...(body.logoUrl !== undefined && { logoUrl: body.logoUrl }),
        ...(body.maintenanceMode !== undefined && { maintenanceMode: body.maintenanceMode }),
        ...(body.featuredChannelId !== undefined && { featuredChannelId: body.featuredChannelId }),
        ...(body.heroBannerText !== undefined && { heroBannerText: body.heroBannerText }),
        ...(body.defaultQuality !== undefined && { defaultQuality: body.defaultQuality }),
        ...(body.bannerAdScript !== undefined && { bannerAdScript: body.bannerAdScript }),
        ...(body.socialBarAdScript !== undefined && { socialBarAdScript: body.socialBarAdScript }),
        ...(body.customAdScripts !== undefined && { customAdScripts: typeof body.customAdScripts === 'string' ? body.customAdScripts : JSON.stringify(body.customAdScripts) }),
        ...(body.adsEnabled !== undefined && { adsEnabled: body.adsEnabled }),
        ...(body.homeAdsEnabled !== undefined && { homeAdsEnabled: body.homeAdsEnabled }),
        ...(body.videoAdsEnabled !== undefined && { videoAdsEnabled: body.videoAdsEnabled }),
        ...(body.apkUrl !== undefined && { apkUrl: body.apkUrl }),
      },
      create: {
        id: 'app',
        appName: body.appName || 'GenZ TV',
        logoUrl: body.logoUrl || '',
        maintenanceMode: body.maintenanceMode !== undefined ? body.maintenanceMode : false,
        featuredChannelId: body.featuredChannelId || '',
        heroBannerText: body.heroBannerText || '',
        defaultQuality: body.defaultQuality || 'auto',
        bannerAdScript: body.bannerAdScript || '',
        socialBarAdScript: body.socialBarAdScript || '',
        customAdScripts: typeof body.customAdScripts === 'string' ? body.customAdScripts : JSON.stringify(body.customAdScripts || []),
        adsEnabled: body.adsEnabled !== undefined ? body.adsEnabled : true,
        homeAdsEnabled: body.homeAdsEnabled !== undefined ? body.homeAdsEnabled : true,
        videoAdsEnabled: body.videoAdsEnabled !== undefined ? body.videoAdsEnabled : true,
        apkUrl: body.apkUrl || '',
      },
    })
    return NextResponse.json(settings)
  } catch (error) {
    console.error('[Settings] Error updating settings:', error)
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 })
  }
}
