import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/settings
export async function GET() {
  try {
    let settings = await db.appSetting.findUnique({ where: { id: 'app' } })
    if (!settings) {
      settings = await db.appSetting.create({ data: { id: 'app' } })
    }
    return NextResponse.json(settings)
  } catch (error) {
    console.error('Error fetching settings:', error)
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 })
  }
}

// PUT /api/settings — update settings
export async function PUT(req: NextRequest) {
  try {
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
        ...(body.apkUrl !== undefined && { apkUrl: body.apkUrl }),
        ...(body.bannerAdScript !== undefined && { bannerAdScript: body.bannerAdScript }),
        ...(body.socialBarAdScript !== undefined && { socialBarAdScript: body.socialBarAdScript }),
      },
      create: {
        id: 'app',
        appName: body.appName || 'GenZ TV',
        logoUrl: body.logoUrl || '',
        maintenanceMode: body.maintenanceMode || false,
        featuredChannelId: body.featuredChannelId || '',
        heroBannerText: body.heroBannerText || '',
        defaultQuality: body.defaultQuality || 'auto',
        apkUrl: body.apkUrl || '',
        bannerAdScript: body.bannerAdScript || '',
        socialBarAdScript: body.socialBarAdScript || '',
      },
    })
    return NextResponse.json(settings)
  } catch (error) {
    console.error('Error updating settings:', error)
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 })
  }
}
