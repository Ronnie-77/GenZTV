import { PrismaClient } from '@prisma/client'

// Ensure DATABASE_URL is set
// Production (Railway): file:/data/prod.db (persistent volume)
// Development: file:./db/custom.db
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = process.env.NODE_ENV === 'production'
    ? 'file:/data/prod.db'
    : 'file:./db/custom.db'
}

// PrismaClient singleton — prevent multiple instances in dev (hot-reload)
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = db
}
