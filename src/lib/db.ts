import { PrismaClient } from '@prisma/client'

/**
 * Prisma Client singleton with Neon-optimized connection settings.
 *
 * On Vercel (serverless), each function invocation creates a new process,
 * so we MUST:
 *   1. Use a small connection pool (connection_limit=1) to avoid exhausting
 *      Neon's free-tier connection limit (5 concurrent).
 *   2. Enable pooled connection string if using Neon's pooler
 *      (use ?pgbouncer=true or the pooler hostname).
 *   3. Reuse the PrismaClient instance within the same function invocation
 *      via the global cache (prevents hot-reload leaks in dev).
 */

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createPrismaClient(): PrismaClient {
  const url = process.env.DATABASE_URL

  // If using Neon and the URL doesn't already specify a connection limit,
  // append one to stay within free-tier limits.
  let finalUrl = url
  if (url && url.includes('neon.tech') && !url.includes('connection_limit')) {
    const separator = url.includes('?') ? '&' : '?'
    finalUrl = `${url}${separator}connection_limit=1&pool_timeout=20`
  }

  return new PrismaClient({
    datasourceUrl: finalUrl,
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  })
}

export const db =
  globalForPrisma.prisma ??
  createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
