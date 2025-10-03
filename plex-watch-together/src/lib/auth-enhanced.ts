import { NextAuthOptions, Session, User } from 'next-auth'
import { JWT } from 'next-auth/jwt'
import CredentialsProvider from 'next-auth/providers/credentials'
import { PrismaAdapter } from '@next-auth/prisma-adapter'
import { prisma } from '@/lib/prisma'
import { encryptionService } from '@/lib/encryption'
import { z } from 'zod'

// Enhanced JWT token structure
interface EnhancedJWT extends JWT {
  id: string
  sessionId: string
  lastActivity: number
  permissions: string[]
}

// Enhanced session structure
interface EnhancedSession extends Session {
  user: {
    id: string
    email: string
    name?: string | null
    image?: string | null
  }
  sessionId: string
  lastActivity: number
  permissions: string[]
}

// Input validation schemas
const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

const registerSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(2, 'Name must be at least 2 characters').optional(),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
})

/**
 * Enhanced NextAuth configuration with security features
 */
export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' }
      },
      
      async authorize(credentials, req) {
        try {
          // Validate input
          const { email, password } = loginSchema.parse(credentials)
          
          // Find user in database
          const user = await prisma.user.findUnique({
            where: { email }
          })
          
          if (!user || !user.password) {
            throw new Error('Invalid credentials')
          }
          
          // Verify password
          const isValidPassword = await encryptionService.verify(password, user.password)
          
          if (!isValidPassword) {
            console.warn(`Failed login attempt for email: ${email}`)
            throw new Error('Invalid credentials')
          }
          
          return {
            id: user.id,
            email: user.email,
            name: user.name || user.email,
            image: user.image
          }
          
        } catch (error) {
          console.error('Authentication error:', error)
          return null
        }
      }
    })
  ],
  
  session: {
    strategy: 'jwt',
    maxAge: 24 * 60 * 60, // 24 hours
    updateAge: 60 * 60, // Update every hour
  },
  
  jwt: {
    maxAge: 24 * 60 * 60, // 24 hours
  },
  
  pages: {
    signIn: '/auth/signin',
    signOut: '/auth/signout',
    error: '/auth/error',
  },
  
  callbacks: {
    async jwt({ token, user, trigger }): Promise<EnhancedJWT> {
      // Enhanced JWT with security metadata
      if (trigger === 'signIn' || trigger === 'signUp') {
        const sessionId = encryptionService.generateSecureToken(32)
        
        return {
          ...token,
          id: user?.id || token.sub || '',
          sessionId,
          lastActivity: Date.now(),
          permissions: ['user'] // Default permissions
        } as EnhancedJWT
      }
      
      if (trigger === 'update') {
        // Update session activity
        return {
          ...token,
          lastActivity: Date.now()
        } as EnhancedJWT
      }
      
      // Check session expiration
      const enhancedToken = token as EnhancedJWT
      const now = Date.now()
      const lastActivity = enhancedToken.lastActivity || 0
      const maxInactivity = 4 * 60 * 60 * 1000 // 4 hours
      
      if (now - lastActivity > maxInactivity) {
        console.log('Session expired due to inactivity')
        return {} as EnhancedJWT // Force sign out
      }
      
      return enhancedToken
    },
    
    async session({ session, token }): Promise<EnhancedSession> {
      const enhancedToken = token as EnhancedJWT
      
      return {
        ...session,
        user: {
          id: enhancedToken.id,
          email: enhancedToken.email || '',
          name: enhancedToken.name || session.user?.name,
          image: session.user?.image
        },
        sessionId: enhancedToken.sessionId || '',
        lastActivity: enhancedToken.lastActivity || Date.now(),
        permissions: enhancedToken.permissions || ['user']
      } as EnhancedSession
    },
    
    async signIn({ user, account }) {
      try {
        // Additional security checks
        if (!user.email) {
          return false
        }
        
        return true
      } catch (error) {
        console.error('SignIn callback error:', error)
        return false
      }
    }
  },
  
  events: {
    async signIn({ user }) {
      console.log(`User signed in: ${user.email} (${user.id})`)
    },
    
    async signOut({ token }) {
      const enhancedToken = token as EnhancedJWT
      console.log(`User signed out: ${enhancedToken.email} (session: ${enhancedToken.sessionId})`)
    }
  },
  
  debug: process.env.NODE_ENV === 'development',
  
  secret: process.env.NEXTAUTH_SECRET,
}

/**
 * Utility functions for authentication
 */

// Check if user has permission
export function hasPermission(session: EnhancedSession | null, permission: string): boolean {
  if (!session || !session.permissions) return false
  return session.permissions.includes(permission) || session.permissions.includes('admin')
}

// Check if user is admin
export function isAdmin(session: EnhancedSession | null): boolean {
  return hasPermission(session, 'admin')
}

// Check if user owns resource
export async function ownsResource(userId: string, resourceType: string, resourceId: string): Promise<boolean> {
  try {
    switch (resourceType) {
      case 'room':
        const room = await prisma.watchRoom.findUnique({
          where: { id: resourceId }
        })
        return room?.creatorId === userId
      
      case 'message':
        const message = await prisma.chatMessage.findUnique({
          where: { id: resourceId }
        })
        return message?.userId === userId
      
      default:
        return false
    }
  } catch (error) {
    console.error('Error checking resource ownership:', error)
    return false
  }
}

export { loginSchema, registerSchema }
export type { EnhancedSession, EnhancedJWT }