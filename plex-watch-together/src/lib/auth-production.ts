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
  email: string
  name: string
  sessionId: string
  lastActivity: number
  ipAddress?: string
  userAgent?: string
  permissions?: string[]
  plexToken?: string
}

// Enhanced session structure
interface EnhancedSession extends Session {
  user: {
    id: string
    email: string
    name: string
    image?: string
  }
  sessionId: string
  lastActivity: number
  permissions: string[]
}

// Validation schemas
const loginSchema = z.object({
  email: z.string().email().min(1, 'Email is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  rememberMe: z.boolean().optional()
})

const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email().min(1, 'Email is required'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*?&])/, 
           'Password must contain uppercase, lowercase, number, and special character'),
  confirmPassword: z.string(),
  plexServerUrl: z.string().url().optional(),
  plexToken: z.string().optional()
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
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
            where: { email },
            include: {
              accounts: true,
              sessions: true
            }
          })
          
          if (!user || !user.password) {
            throw new Error('Invalid credentials')
          }
          
          // Verify password
          const isValidPassword = await encryptionService.verify(password, user.password)
          
          if (!isValidPassword) {
            // Log suspicious activity
            console.warn(`Failed login attempt for email: ${email}`)
            throw new Error('Invalid credentials')
          }
          
          // Update last login
          await prisma.user.update({
            where: { id: user.id },
            data: { 
              updatedAt: new Date()
            }
          })
          
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
    secret: process.env.NEXTAUTH_SECRET || encryptionService.generateSecureToken(64),
  },
  
  pages: {
    signIn: '/auth/signin',
    signOut: '/auth/signout',
    error: '/auth/error'
  },
  
  callbacks: {
    async jwt({ token, user, trigger }): Promise<EnhancedJWT> {
      // Enhanced JWT with security metadata
      if (trigger === 'signIn' || trigger === 'signUp') {
        const sessionId = encryptionService.generateSecureToken(32)
        
        return {
          ...token,
          id: user.id,
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
          email: enhancedToken.email,
          name: enhancedToken.name,
          image: session.user?.image
        },
        sessionId: enhancedToken.sessionId,
        lastActivity: enhancedToken.lastActivity,
        permissions: enhancedToken.permissions || ['user']
      } as EnhancedSession
    }
  },
  
  debug: process.env.NODE_ENV === 'development'
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

export { loginSchema, registerSchema }
export type { EnhancedSession, EnhancedJWT }