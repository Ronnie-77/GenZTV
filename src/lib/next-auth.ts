import NextAuth, { type NextAuthOptions } from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'
import { db } from '@/lib/db'

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET,
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  callbacks: {
    async signIn({ user }) {
      if (!user.email) return false
      // Create or update user in database
      try {
        await db.user.upsert({
          where: { email: user.email },
          update: {
            name: user.name || null,
            image: user.image || null,
          },
          create: {
            email: user.email,
            name: user.name || null,
            image: user.image || null,
            emailVerified: new Date(),
          },
        })
        return true
      } catch (error) {
        console.error('[NextAuth] Error saving user:', error)
        return false
      }
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub
      }
      return session
    },
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id
      }
      return token
    },
    async redirect({ url, baseUrl }) {
      // Always redirect to the app root (hash-based routing)
      return baseUrl + '/#/'
    },
  },
  pages: {
    signIn: '/api/auth/signin',
    error: '/api/auth/error',
  },
}

export default NextAuth(authOptions)
