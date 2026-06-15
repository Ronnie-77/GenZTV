import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthenticated } from '@/lib/auth'
import { writeFile, unlink, readdir } from 'fs/promises'
import { join } from 'path'

const UPLOAD_DIR = join(process.cwd(), 'public', 'uploads')
const MAX_FILE_SIZE = 200 * 1024 * 1024 // 200MB

// POST /api/upload/apk — upload APK file (admin only)
export async function POST(request: NextRequest) {
  try {
    const authenticated = await isAdminAuthenticated(request)
    if (!authenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get('apk') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    if (!file.name.endsWith('.apk')) {
      return NextResponse.json({ error: 'Only APK files are allowed' }, { status: 400 })
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File size exceeds 200MB limit' }, { status: 400 })
    }

    // Delete existing APK files
    try {
      const existingFiles = await readdir(UPLOAD_DIR)
      for (const f of existingFiles) {
        if (f.endsWith('.apk')) {
          await unlink(join(UPLOAD_DIR, f)).catch(() => {})
        }
      }
    } catch {
      // Upload dir might not exist yet
    }

    // Generate unique filename
    const timestamp = Date.now()
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const filename = `${timestamp}-${safeName}`
    const filepath = join(UPLOAD_DIR, filename)

    // Write file
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    await writeFile(filepath, buffer)

    const apkUrl = `/uploads/${filename}`

    // Update settings with new APK URL
    const { db } = await import('@/lib/db')
    await db.appSetting.upsert({
      where: { id: 'app' },
      update: { apkUrl },
      create: { id: 'app', apkUrl },
    })

    return NextResponse.json({
      success: true,
      apkUrl,
      fileName: file.name,
      size: file.size,
    })
  } catch (error) {
    console.error('[Upload APK] Error:', error)
    const message = error instanceof Error ? error.message : 'Failed to upload APK'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// DELETE /api/upload/apk — delete APK file (admin only)
export async function DELETE(request: NextRequest) {
  try {
    const authenticated = await isAdminAuthenticated(request)
    if (!authenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get current APK URL from settings
    const { db } = await import('@/lib/db')
    const settings = await db.appSetting.findUnique({ where: { id: 'app' } })

    if (settings?.apkUrl) {
      // Extract filename from URL
      const filename = settings.apkUrl.split('/').pop()
      if (filename) {
        const filepath = join(UPLOAD_DIR, filename)
        await unlink(filepath).catch(() => {})
      }

      // Clear APK URL in settings
      await db.appSetting.update({
        where: { id: 'app' },
        data: { apkUrl: '' },
      })
    }

    // Also clean up any orphaned APK files
    try {
      const existingFiles = await readdir(UPLOAD_DIR)
      for (const f of existingFiles) {
        if (f.endsWith('.apk')) {
          await unlink(join(UPLOAD_DIR, f)).catch(() => {})
        }
      }
    } catch {
      // ignore
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Upload APK] Delete error:', error)
    const message = error instanceof Error ? error.message : 'Failed to delete APK'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
