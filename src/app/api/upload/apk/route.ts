import { NextRequest, NextResponse } from 'next/server'
import { writeFile, unlink, mkdir } from 'fs/promises'
import path from 'path'
import { existsSync } from 'fs'
import { db } from '@/lib/db'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('apk') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
    }

    // Validate file type
    if (!file.name.endsWith('.apk')) {
      return NextResponse.json({ error: 'Only APK files are allowed' }, { status: 400 })
    }

    // Validate file size (max 200MB)
    if (file.size > 200 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large (max 200MB)' }, { status: 400 })
    }

    // Ensure uploads directory exists
    const uploadsDir = path.join(process.cwd(), 'public', 'uploads')
    if (!existsSync(uploadsDir)) {
      await mkdir(uploadsDir, { recursive: true })
    }

    // Delete old APK files
    try {
      const { readdir } = await import('fs/promises')
      const existingFiles = await readdir(uploadsDir)
      for (const f of existingFiles) {
        if (f.endsWith('.apk')) {
          await unlink(path.join(uploadsDir, f))
        }
      }
    } catch {
      // ignore errors
    }

    // Save new file
    const fileName = `app-${Date.now()}.apk`
    const filePath = path.join(uploadsDir, fileName)
    const buffer = Buffer.from(await file.arrayBuffer())
    await writeFile(filePath, buffer)

    // Update settings with the new APK URL
    const apkUrl = `/uploads/${fileName}`
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
    console.error('Error uploading APK:', error)
    return NextResponse.json({ error: 'Failed to upload APK' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    // Remove APK from settings and delete file
    const uploadsDir = path.join(process.cwd(), 'public', 'uploads')
    try {
      const { readdir } = await import('fs/promises')
      const existingFiles = await readdir(uploadsDir)
      for (const f of existingFiles) {
        if (f.endsWith('.apk')) {
          await unlink(path.join(uploadsDir, f))
        }
      }
    } catch {
      // ignore errors
    }

    // Clear APK URL in settings
    await db.appSetting.upsert({
      where: { id: 'app' },
      update: { apkUrl: '' },
      create: { id: 'app', apkUrl: '' },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting APK:', error)
    return NextResponse.json({ error: 'Failed to delete APK' }, { status: 500 })
  }
}
