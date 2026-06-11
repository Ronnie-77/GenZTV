import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAdminAuth } from '@/lib/auth'

// GET /api/channels/[id]
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const channel = await db.channel.findUnique({ where: { id } })
    if (!channel) {
      return NextResponse.json({ error: 'Channel not found' }, { status: 404 })
    }
    // Increment view count
    await db.channel.update({ where: { id }, data: { viewCount: { increment: 1 } } })
    return NextResponse.json(channel)
  } catch (error) {
    console.error('Error fetching channel:', error)
    return NextResponse.json({ error: 'Failed to fetch channel' }, { status: 500 })
  }
}

// PUT /api/channels/[id] — update channel (admin only)
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return requireAdminAuth(req, async () => {
  try {
    const { id } = await params
    const body = await req.json()
    const channel = await db.channel.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.logo !== undefined && { logo: body.logo }),
        ...(body.category !== undefined && { category: body.category }),
        ...(body.streamType !== undefined && { streamType: body.streamType }),
        ...(body.streamUrl !== undefined && { streamUrl: body.streamUrl }),
        ...(body.githubM3uPath !== undefined && { githubM3uPath: body.githubM3uPath }),
        ...(body.language !== undefined && { language: body.language }),
        ...(body.country !== undefined && { country: body.country }),
        ...(body.tags !== undefined && { tags: Array.isArray(body.tags) ? body.tags.join(',') : body.tags }),
        ...(body.isFeatured !== undefined && { isFeatured: body.isFeatured }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
      },
    })
    return NextResponse.json(channel)
  } catch (error) {
    console.error('Error updating channel:', error)
    return NextResponse.json({ error: 'Failed to update channel' }, { status: 500 })
  }
  })
}

// DELETE /api/channels/[id] (admin only)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return requireAdminAuth(_req, async () => {
  try {
    const { id } = await params
    await db.channel.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting channel:', error)
    return NextResponse.json({ error: 'Failed to delete channel' }, { status: 500 })
  }
  })
}
