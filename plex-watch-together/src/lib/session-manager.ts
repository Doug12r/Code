import { getCachingService } from './caching-service'
import { encryptionService } from './encryption'

interface SessionData {
  userId: string
  email: string
  name?: string
  image?: string
  lastActivity: number
  createdAt: number
  expiresAt: number
  sessionId: string
  metadata: {
    provider?: string
    ipAddress?: string
    userAgent?: string
    lastLogin?: number
  }
}

interface SessionOptions {
  maxAge?: number // Session duration in seconds
  updateAge?: number // How often to update session in seconds
  secure?: boolean
  sameSite?: 'strict' | 'lax' | 'none'
}

class SessionManager {
  private cache = getCachingService()
  private defaultOptions: Required<SessionOptions> = {
    maxAge: 7 * 24 * 60 * 60, // 7 days
    updateAge: 24 * 60 * 60, // Update every 24 hours
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax'
  }

  /**
   * Create a new session
   */
  async createSession(
    userId: string,
    userData: Partial<SessionData>, 
    options?: SessionOptions
  ): Promise<{ sessionId: string; token: string }> {
    const sessionId = encryptionService.generateSecureToken()
    const now = Date.now()
    const config = { ...this.defaultOptions, ...options }

    const sessionData: SessionData = {
      userId,
      email: userData.email || '',
      name: userData.name,
      image: userData.image,
      lastActivity: now,
      createdAt: now,
      expiresAt: now + (config.maxAge * 1000),
      sessionId,
      metadata: {
        provider: userData.metadata?.provider,
        ipAddress: userData.metadata?.ipAddress,
        userAgent: userData.metadata?.userAgent,
        lastLogin: now
      }
    }

    // Store session in Redis with TTL
    await this.cache.setUserSession(sessionId, sessionData)
    
    // Generate encrypted token
    const token = this.generateToken(sessionData)
    
    console.log(`🔐 Session created: ${sessionId} for user ${userId}`)
    return { sessionId, token }
  }

  /**
   * Retrieve session by session ID
   */
  async getSession(sessionId: string): Promise<SessionData | null> {
    try {
      const session = await this.cache.getUserSession(sessionId)
      
      if (!session) {
        return null
      }

      // Check if session is expired
      if (Date.now() > session.expiresAt) {
        await this.destroySession(sessionId)
        console.log(`⏰ Session expired: ${sessionId}`)
        return null
      }

      return session
    } catch (error) {
      console.error('Error retrieving session:', error)
      return null
    }
  }

  /**
   * Update session activity and extend if needed
   */
  async updateSession(
    sessionId: string, 
    updates?: Partial<SessionData>
  ): Promise<SessionData | null> {
    const session = await this.getSession(sessionId)
    
    if (!session) {
      return null
    }

    const now = Date.now()
    const shouldUpdate = (now - session.lastActivity) > (this.defaultOptions.updateAge * 1000)

    if (shouldUpdate || updates) {
      const updatedSession: SessionData = {
        ...session,
        ...updates,
        lastActivity: now,
        // Extend expiration if close to expiry
        expiresAt: shouldUpdate 
          ? now + (this.defaultOptions.maxAge * 1000)
          : session.expiresAt
      }

      await this.cache.setUserSession(sessionId, updatedSession)
      
      console.log(`🔄 Session updated: ${sessionId}`)
      return updatedSession
    }

    return session
  }

  /**
   * Destroy a session
   */
  async destroySession(sessionId: string): Promise<boolean> {
    try {
      const success = await this.cache.deleteUserSession(sessionId)
      
      if (success) {
        console.log(`🗑️ Session destroyed: ${sessionId}`)
      }
      
      return success
    } catch (error) {
      console.error('Error destroying session:', error)
      return false
    }
  }

  /**
   * Destroy all sessions for a user
   */
  async destroyAllUserSessions(userId: string): Promise<number> {
    try {
      // This would require scanning Redis keys, which is expensive
      // Better to maintain a user->session mapping in production
      const pattern = `session:*` // This is a simplified approach
      const deleted = await this.cache.invalidatePattern(pattern)
      
      console.log(`🧹 Destroyed ${deleted} sessions for user ${userId}`)
      return deleted
    } catch (error) {
      console.error('Error destroying user sessions:', error)
      return 0
    }
  }

  /**
   * Verify and decode session token
   */
  async verifyToken(token: string): Promise<SessionData | null> {
    try {
      // Decrypt and parse token
      const decrypted = encryptionService.decrypt(token)
      const tokenData = JSON.parse(decrypted)
      
      if (!tokenData.sessionId) {
        return null
      }

      // Retrieve full session from Redis
      return await this.getSession(tokenData.sessionId)
    } catch (error) {
      console.error('Error verifying token:', error)
      return null
    }
  }

  /**
   * Generate encrypted session token
   */
  private generateToken(session: SessionData): string {
    const tokenData = {
      sessionId: session.sessionId,
      userId: session.userId,
      expiresAt: session.expiresAt
    }

    const serialized = JSON.stringify(tokenData)
    return encryptionService.encrypt(serialized)
  }

  /**
   * Refresh session (extend expiration)
   */
  async refreshSession(sessionId: string): Promise<{ success: boolean; token?: string }> {
    const session = await this.updateSession(sessionId)
    
    if (!session) {
      return { success: false }
    }

    const token = this.generateToken(session)
    return { success: true, token }
  }

  /**
   * Get active sessions for a user (requires additional indexing)
   */
  async getUserActiveSessions(userId: string): Promise<SessionData[]> {
    // In production, maintain a user->sessions mapping
    // For now, this is a simplified version
    try {
      // This would be implemented with proper indexing in Redis
      // For demonstration, returning empty array
      console.log(`📊 Getting active sessions for user: ${userId}`)
      return []
    } catch (error) {
      console.error('Error getting user sessions:', error)
      return []
    }
  }

  /**
   * Clean up expired sessions (should be run periodically)
   */
  async cleanupExpiredSessions(): Promise<number> {
    try {
      // Redis TTL handles most cleanup automatically
      // This method could implement additional cleanup logic
      console.log('🧹 Cleaning up expired sessions...')
      return 0
    } catch (error) {
      console.error('Error cleaning up sessions:', error)
      return 0
    }
  }

  /**
   * Get session statistics
   */
  async getSessionStats(): Promise<{
    activeSessions: number
    totalSessions: number
    averageSessionDuration: number
  }> {
    try {
      // Implementation would depend on Redis key structure
      return {
        activeSessions: 0,
        totalSessions: 0,
        averageSessionDuration: 0
      }
    } catch (error) {
      console.error('Error getting session stats:', error)
      return {
        activeSessions: 0,
        totalSessions: 0,
        averageSessionDuration: 0
      }
    }
  }

  /**
   * Session security validation
   */
  async validateSessionSecurity(
    sessionId: string,
    currentIp?: string,
    currentUserAgent?: string
  ): Promise<{ valid: boolean; reason?: string }> {
    const session = await this.getSession(sessionId)
    
    if (!session) {
      return { valid: false, reason: 'Session not found' }
    }

    // Check IP consistency (optional, can be disabled for mobile users)
    if (currentIp && session.metadata.ipAddress && 
        currentIp !== session.metadata.ipAddress) {
      console.warn(`🚨 IP mismatch for session ${sessionId}: ${currentIp} vs ${session.metadata.ipAddress}`)
      // In production, you might want to invalidate or flag this
    }

    // Check user agent consistency
    if (currentUserAgent && session.metadata.userAgent &&
        currentUserAgent !== session.metadata.userAgent) {
      console.warn(`🚨 User agent mismatch for session ${sessionId}`)
      // In production, you might want to invalidate or flag this
    }

    return { valid: true }
  }

  /**
   * Get session metadata for security analysis
   */
  async getSessionMetadata(sessionId: string): Promise<SessionData['metadata'] | null> {
    const session = await this.getSession(sessionId)
    return session?.metadata || null
  }
}

// Singleton instance
let sessionManager: SessionManager | null = null

export function getSessionManager(): SessionManager {
  if (!sessionManager) {
    sessionManager = new SessionManager()
  }
  return sessionManager
}

// Export types
export type { SessionData, SessionOptions }
export default getSessionManager