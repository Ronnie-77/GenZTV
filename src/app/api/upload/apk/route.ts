import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthenticated } from '@/lib/auth'
import { writeFile, mkdir, unlink } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'

// POST /api/upload/apk — upload APK file (admin only)
export async function POST(req: NextRequest) {
  try {
    // Check admin auth
    const authenticated = await isAdminAuthenticated(req)
    if (!authenticated) {
      return NextResponse.json({ error: 'Unauthorized — please log in again' }, { status: 401 })
    }

    const formData = await req.formData()
    const file = formData.get('apk') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Validate file type
    if (!file.name.endsWith('.apk')) {
      return NextResponse.json({ error: 'Only APK files are allowed' }, { status: 400 })
    }

    // Validate file size (max 200MB)
    const MAX_SIZE = 200 * 1024 * 1024
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'File too large (max 200MB)' }, { status: 400 })
    }

    // Ensure uploads directory exists
    const uploadsDir = join(process.cwd(), 'public', 'uploads')
    if (!existsSync(uploadsDir)) {
      await mkdir(uploadsDir, { recursive: true })
    }

    // Generate safe filename
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const fileName = `${Date.now()}-${safeName}`
    const filePath = join(uploadsDir, fileName)

    // Write file
    const bytes = await file.arrayBuffer()
    await writeFile(filePath, Buffer.from(bytes))

    // Return the public URL
    const apkUrl = `/uploads/${fileName}`

    return NextResponse.json({
      success: true,
      apkUrl,
      fileName: file.name,
      size: file.size,
    })
  } catch (error) {
    console.error('[Upload/APK] Error:', error)
    return NextResponse.json({ error: 'Failed to upload APK' }, { status: 500 })
  }
}

// DELETE /api/upload/apk — delete the uploaded APK (admin only)
export async function DELETE(req: NextRequest) {
  try {
    const authenticated = await isAdminAuthenticated(req)
    if (!authenticated) {
      return NextResponse.json({ error: 'Unauthorized — please log in again' }, { status: 401 })
    }

    // Get the current APK URL from settings to find the file
    const { db } = await import('@/lib/db')
    const settings = await db.appSetting.findUnique({ where: { id: 'app' } })

    if (settings?.apkUrl) {
      const fileName = settings.apkUrl.split('/').pop()
      if (fileName) {
        const filePath = join(process.cwd(), 'public', 'uploads', fileName)
        if (existsSync(filePath)) {
          await unlink(filePath)
        }
      }
      // Clear the APK URL in settings
      await db.appSetting.update({
        where: { id: 'app' },
        data: { apkUrl: '' },
      })
    }

    return NextResponse.json({ success: true, message: 'APK deleted' })
  } catch (error) {
    console.error('[Upload/APK] Delete error:', error)
    return NextResponse.json({ error: 'Failed to delete APK' }, { status: 500 })
  }
}
