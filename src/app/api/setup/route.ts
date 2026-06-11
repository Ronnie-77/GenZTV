import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAdminAuth } from '@/lib/auth'
import { execSync } from 'child_process'
import path from 'path'

// GET /api/setup — Check database status and initialize
export async function GET() {
  try {
    const channelCount = await db.channel.count()
    const matchCount = await db.match.count()
    const categoryCount = await db.category.count()
    
    return NextResponse.json({
      status: 'ok',
      database: 'connected',
      databaseUrl: process.env.DATABASE_URL ? 'configured' : 'using fallback',
      tables: { channels: channelCount, matches: matchCount, categories: categoryCount },
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    
    // If tables don't exist, try to create them automatically
    try {
      const schemaPath = path.join(process.cwd(), 'prisma', 'schema.prisma')
      execSync(`npx prisma db push --skip-generate --schema=${schemaPath}`, {
        stdio: 'pipe',
        env: { ...process.env },
        timeout: 30000,
      })
      
      // Try again after pushing schema
      const channelCount = await db.channel.count()
      return NextResponse.json({
        status: 'ok',
        database: 'connected (auto-initialized)',
        databaseUrl: process.env.DATABASE_URL ? 'configured' : 'using fallback',
        tables: { channels: channelCount, matches: 0, categories: 0 },
      })
    } catch (pushError) {
      const pushErrorMessage = pushError instanceof Error ? pushError.message : String(pushError)
      return NextResponse.json({
        status: 'error',
        error: errorMessage,
        pushError: pushErrorMessage,
        hint: 'Database tables not found and auto-creation failed. Set DATABASE_URL env var and ensure prisma db push runs on deploy.',
        databaseUrl: process.env.DATABASE_URL || 'not set',
      }, { status: 500 })
    }
  }
}

// POST /api/setup — Force initialize database with seed data (admin only)
export async function POST(req: NextRequest) {
  return requireAdminAuth(req, async () => {
  try {
    // Test if tables exist - if not, try to create them
    let tableExists = false
    try {
      await db.channel.count()
      tableExists = true
    } catch {
      tableExists = false
    }

    if (!tableExists) {
      // Auto-push schema
      try {
        const schemaPath = path.join(process.cwd(), 'prisma', 'schema.prisma')
        execSync(`npx prisma db push --skip-generate --schema=${schemaPath}`, {
          stdio: 'pipe',
          env: { ...process.env },
          timeout: 30000,
        })
        tableExists = true
      } catch (pushError) {
        return NextResponse.json({
          status: 'error',
          message: 'Database tables do not exist and auto-creation failed.',
          hint: 'Set DATABASE_URL environment variable on Railway and redeploy.',
          error: pushError instanceof Error ? pushError.message : String(pushError),
        }, { status: 500 })
      }
    }

    // Seed categories
    await Promise.all([
      db.category.upsert({ where: { id: 'cat-news' }, update: {}, create: { id: 'cat-news', name: 'News', icon: '📰', color: '#FF6B6B', order: 1 } }),
      db.category.upsert({ where: { id: 'cat-sports' }, update: {}, create: { id: 'cat-sports', name: 'Sports', icon: '🏆', color: '#FF6766', order: 2 } }),
      db.category.upsert({ where: { id: 'cat-cricket' }, update: {}, create: { id: 'cat-cricket', name: 'Cricket', icon: '🏏', color: '#FF6766', order: 3 } }),
      db.category.upsert({ where: { id: 'cat-football' }, update: {}, create: { id: 'cat-football', name: 'Football', icon: '⚽', color: '#FFE3B3', order: 4 } }),
      db.category.upsert({ where: { id: 'cat-entertainment' }, update: {}, create: { id: 'cat-entertainment', name: 'Entertainment', icon: '🎬', color: '#FF69B4', order: 5 } }),
    ])

    // Seed app settings
    await db.appSetting.upsert({
      where: { id: 'app' },
      update: {},
      create: { id: 'app', appName: 'GenZ TV' },
    })

    const channelCount = await db.channel.count()

    return NextResponse.json({
      status: 'ok',
      message: 'Database initialized successfully',
      channels: channelCount,
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    return NextResponse.json({
      status: 'error',
      error: errorMessage,
    }, { status: 500 })
  }
  })
}
