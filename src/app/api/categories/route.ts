import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAdminAuth } from '@/lib/auth'

// GET /api/categories
export async function GET() {
  try {
    const categories = await db.category.findMany({
      orderBy: { order: 'asc' },
    })
    return NextResponse.json(categories)
  } catch (error) {
    console.error('Error fetching categories:', error)
    return NextResponse.json({ error: 'Failed to fetch categories' }, { status: 500 })
  }
}

// POST /api/categories (admin only)
export async function POST(req: NextRequest) {
  return requireAdminAuth(req, async () => {
  try {
    const body = await req.json()
    const category = await db.category.create({
      data: {
        name: body.name,
        icon: body.icon || '',
        color: body.color || '',
        order: body.order || 0,
        channelCount: body.channelCount || 0,
      },
    })
    return NextResponse.json(category, { status: 201 })
  } catch (error) {
    console.error('Error creating category:', error)
    return NextResponse.json({ error: 'Failed to create category' }, { status: 500 })
  }
  })
}
