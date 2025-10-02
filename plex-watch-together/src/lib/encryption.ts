import crypto from 'crypto'

// Production-grade encryption for sensitive data like Plex tokens
class EncryptionService {
  private readonly algorithm = 'aes-256-gcm'
  private readonly keyLength = 32
  private readonly ivLength = 16
  private readonly tagLength = 16

  private getEncryptionKey(): Buffer {
    const key = process.env.ENCRYPTION_KEY
    if (!key) {
      throw new Error('ENCRYPTION_KEY environment variable is required')
    }
    
    // Derive a proper encryption key from the environment variable
    return crypto.scryptSync(key, 'salt', this.keyLength)
  }

  /**
   * Encrypt sensitive data (like Plex tokens)
   */
  encrypt(plaintext: string): string {
    try {
      const key = this.getEncryptionKey()
      const iv = crypto.randomBytes(this.ivLength)
      
      const cipher = crypto.createCipher(this.algorithm, key)
      cipher.setAAD(Buffer.from('plex-watch-together', 'utf8'))
      
      let encrypted = cipher.update(plaintext, 'utf8', 'base64')
      encrypted += cipher.final('base64')
      
      const tag = cipher.getAuthTag()
      
      // Combine IV + encrypted data + auth tag
      const result = Buffer.concat([
        iv,
        Buffer.from(encrypted, 'base64'),
        tag
      ]).toString('base64')
      
      return result
    } catch (error) {
      console.error('Encryption failed:', error)
      throw new Error('Failed to encrypt data')
    }
  }

  /**
   * Decrypt sensitive data
   */
  decrypt(encryptedData: string): string {
    try {
      const key = this.getEncryptionKey()
      const buffer = Buffer.from(encryptedData, 'base64')
      
      // Extract IV, encrypted data, and auth tag
      const iv = buffer.subarray(0, this.ivLength)
      const tag = buffer.subarray(buffer.length - this.tagLength)
      const encrypted = buffer.subarray(this.ivLength, buffer.length - this.tagLength)
      
      const decipher = crypto.createDecipher(this.algorithm, key)
      decipher.setAAD(Buffer.from('plex-watch-together', 'utf8'))
      decipher.setAuthTag(tag)
      
      let decrypted = decipher.update(encrypted, undefined, 'utf8')
      decrypted += decipher.final('utf8')
      
      return decrypted
    } catch (error) {
      console.error('Decryption failed:', error)
      throw new Error('Failed to decrypt data')
    }
  }

  /**
   * Hash sensitive data (for passwords, etc.)
   */
  async hash(data: string, saltRounds: number = 12): Promise<string> {
    const bcrypt = await import('bcryptjs')
    return bcrypt.hash(data, saltRounds)
  }

  /**
   * Verify hashed data
   */
  async verify(data: string, hashedData: string): Promise<boolean> {
    const bcrypt = await import('bcryptjs')
    return bcrypt.compare(data, hashedData)
  }

  /**
   * Generate a cryptographically secure random string
   */
  generateSecureToken(length: number = 32): string {
    return crypto.randomBytes(length).toString('hex')
  }

  /**
   * Generate room invite codes
   */
  generateInviteCode(length: number = 8): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    let result = ''
    
    for (let i = 0; i < length; i++) {
      const randomIndex = crypto.randomInt(0, chars.length)
      result += chars[randomIndex]
    }
    
    return result
  }
}

// Singleton instance
export const encryptionService = new EncryptionService()

// Utility functions for backwards compatibility
export function encryptToken(token: string): string {
  return encryptionService.encrypt(token)
}

export function decryptToken(encryptedToken: string): string {
  return encryptionService.decrypt(encryptedToken)
}