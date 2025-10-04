import crypto from 'crypto'

// Simple encryption for sensitive data
export class DataEncryption {
  private static masterKey: string | null = null

  static initialize(masterKey?: string): void {
    this.masterKey = masterKey || process.env.ENCRYPTION_KEY || this.generateMasterKey()
    
    if (!this.masterKey) {
      throw new Error('Master encryption key is required')
    }
  }

  private static generateMasterKey(): string {
    return crypto.randomBytes(32).toString('hex')
  }

  static encrypt(plaintext: string): string {
    if (!this.masterKey) {
      throw new Error('Encryption not initialized')
    }

    const iv = crypto.randomBytes(16)
    const cipher = crypto.createCipher('aes-256-cbc', this.masterKey)
    
    let encrypted = cipher.update(plaintext, 'utf8', 'hex')
    encrypted += cipher.final('hex')
    
    return iv.toString('hex') + ':' + encrypted
  }

  static decrypt(encryptedData: string): string {
    if (!this.masterKey) {
      throw new Error('Encryption not initialized')
    }

    const [ivHex, encrypted] = encryptedData.split(':')
    const decipher = crypto.createDecipher('aes-256-cbc', this.masterKey)
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8')
    decrypted += decipher.final('utf8')
    
    return decrypted
  }

  // Simple field encryption
  static encryptFields(obj: Record<string, any>, fields: string[]): Record<string, any> {
    const result = { ...obj }
    
    for (const field of fields) {
      if (result[field] && typeof result[field] === 'string') {
        result[field + '_encrypted'] = this.encrypt(result[field])
        delete result[field]
      }
    }
    
    return result
  }

  // Simple field decryption
  static decryptFields(obj: Record<string, any>, fields: string[]): Record<string, any> {
    const result = { ...obj }
    
    for (const field of fields) {
      const encryptedField = field + '_encrypted'
      if (result[encryptedField] && typeof result[encryptedField] === 'string') {
        try {
          result[field] = this.decrypt(result[encryptedField])
          delete result[encryptedField]
        } catch (error) {
          console.error(`Failed to decrypt field ${field}:`, error)
        }
      }
    }
    
    return result
  }
}

// Secure token generation
export class TokenGenerator {
  static generateSecureToken(length = 32): string {
    return crypto.randomBytes(length).toString('hex')
  }

  static generateCSRFToken(): string {
    return this.generateSecureToken(32)
  }

  static generateSessionToken(): string {
    return this.generateSecureToken(48)
  }

  static generateAPIKey(): string {
    const timestamp = Date.now().toString(36)
    const random = this.generateSecureToken(24)
    return `pk_${timestamp}_${random}`
  }

  static validateTokenFormat(token: string, expectedLength?: number): boolean {
    if (!token || typeof token !== 'string') {
      return false
    }

    // Check hex format
    if (!/^[a-f0-9]+$/i.test(token)) {
      return false
    }

    // Check length if specified
    if (expectedLength && token.length !== expectedLength) {
      return false
    }

    return true
  }
}

// Password hashing and verification
export class PasswordSecurity {
  private static readonly SALT_ROUNDS = 12
  private static readonly MIN_PASSWORD_LENGTH = 8
  private static readonly MAX_PASSWORD_LENGTH = 128

  static async hashPassword(password: string): Promise<string> {
    this.throwIfInvalidPassword(password)
    
    const salt = crypto.randomBytes(16).toString('hex')
    const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha256').toString('hex')
    
    return `${salt}:${hash}`
  }

  static async verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
    try {
      const [salt, hash] = hashedPassword.split(':')
      const verifyHash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha256').toString('hex')
      
      return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(verifyHash, 'hex'))
    } catch (error) {
      return false
    }
  }

  static validatePasswordStrength(password: string): {
    isValid: boolean
    errors: string[]
    score: number
  } {
    const errors: string[] = []
    let score = 0

    // Length check
    if (password.length < this.MIN_PASSWORD_LENGTH) {
      errors.push(`Password must be at least ${this.MIN_PASSWORD_LENGTH} characters`)
    } else if (password.length > this.MAX_PASSWORD_LENGTH) {
      errors.push(`Password must be no more than ${this.MAX_PASSWORD_LENGTH} characters`)
    } else {
      score += Math.min(password.length * 2, 25)
    }

    // Character variety checks
    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain lowercase letters')
    } else {
      score += 10
    }

    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain uppercase letters')
    } else {
      score += 10
    }

    if (!/[0-9]/.test(password)) {
      errors.push('Password must contain numbers')
    } else {
      score += 10
    }

    if (!/[^a-zA-Z0-9]/.test(password)) {
      errors.push('Password must contain special characters')
    } else {
      score += 15
    }

    // Common password patterns
    const commonPatterns = [
      /^(.)\1+$/, // All same character
      /^(012|123|234|345|456|567|678|789|890|abc|bcd|cde)/, // Sequential
      /password|123456|qwerty|admin/i, // Common passwords
    ]

    for (const pattern of commonPatterns) {
      if (pattern.test(password)) {
        errors.push('Password contains common patterns')
        score -= 20
        break
      }
    }

    // Bonus for length
    if (password.length >= 16) {
      score += 10
    }

    return {
      isValid: errors.length === 0,
      errors,
      score: Math.max(0, Math.min(100, score))
    }
  }

  private static throwIfInvalidPassword(password: string): void {
    const validation = this.validatePasswordStrength(password)
    if (!validation.isValid) {
      throw new Error(`Password validation failed: ${validation.errors.join(', ')}`)
    }
  }
}

// Secure data storage utilities
export class SecureStorage {
  // Encrypt data before storing
  static encryptForStorage(data: any): string {
    const jsonString = JSON.stringify(data)
    const encrypted = DataEncryption.encrypt(jsonString)
    return Buffer.from(JSON.stringify(encrypted)).toString('base64')
  }

  // Decrypt data after retrieving
  static decryptFromStorage(encryptedString: string): any {
    try {
      const encryptedData = JSON.parse(Buffer.from(encryptedString, 'base64').toString())
      const decrypted = DataEncryption.decrypt(encryptedData)
      return JSON.parse(decrypted)
    } catch (error) {
      throw new Error('Failed to decrypt stored data')
    }
  }

  // Secure key-value store with TTL
  private static store = new Map<string, { data: string; expires: number }>()

  static setSecure(key: string, value: any, ttlSeconds = 3600): void {
    const encrypted = this.encryptForStorage(value)
    const expires = Date.now() + (ttlSeconds * 1000)
    
    this.store.set(key, { data: encrypted, expires })
  }

  static getSecure(key: string): any | null {
    const item = this.store.get(key)
    
    if (!item) {
      return null
    }

    if (Date.now() > item.expires) {
      this.store.delete(key)
      return null
    }

    return this.decryptFromStorage(item.data)
  }

  static deleteSecure(key: string): void {
    this.store.delete(key)
  }

  static clearExpired(): void {
    const now = Date.now()
    for (const [key, item] of this.store.entries()) {
      if (now > item.expires) {
        this.store.delete(key)
      }
    }
  }
}

// Initialize encryption on module load
try {
  DataEncryption.initialize()
} catch (error) {
  console.warn('Failed to initialize encryption:', error)
}