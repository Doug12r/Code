import { z } from 'zod'

// Custom validation schemas
export const schemas = {
  // User input schemas
  username: z.string()
    .min(2, 'Username must be at least 2 characters')
    .max(50, 'Username must be less than 50 characters')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Username can only contain letters, numbers, hyphens, and underscores'),

  email: z.string()
    .email('Invalid email address')
    .max(254, 'Email address too long'),

  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must be less than 128 characters')
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'Password must contain at least one lowercase letter, one uppercase letter, and one number'),

  // Room schemas
  roomName: z.string()
    .min(1, 'Room name is required')
    .max(100, 'Room name must be less than 100 characters')
    .regex(/^[^<>{}[\]\\\/]+$/, 'Room name contains invalid characters'),

  roomDescription: z.string()
    .max(500, 'Description must be less than 500 characters')
    .optional(),

  inviteCode: z.string()
    .length(6, 'Invite code must be exactly 6 characters')
    .regex(/^[A-Z0-9]+$/, 'Invite code can only contain uppercase letters and numbers'),

  // Media schemas
  mediaTitle: z.string()
    .min(1, 'Media title is required')
    .max(200, 'Media title must be less than 200 characters'),

  mediaKey: z.string()
    .regex(/^\/library\/metadata\/\d+$/, 'Invalid media key format'),

  // General schemas
  url: z.string().url('Invalid URL format'),
  
  positiveInteger: z.number()
    .int('Must be an integer')
    .positive('Must be a positive number'),

  port: z.number()
    .int('Port must be an integer')
    .min(1, 'Port must be at least 1')
    .max(65535, 'Port must be at most 65535'),

  // File upload schemas
  fileName: z.string()
    .max(255, 'Filename too long')
    .regex(/^[^<>:"/\\|?*]+$/, 'Filename contains invalid characters'),

  // Chat and messaging
  chatMessage: z.string()
    .min(1, 'Message cannot be empty')
    .max(1000, 'Message must be less than 1000 characters'),

  // Plex server schemas
  plexToken: z.string()
    .min(20, 'Plex token too short')
    .max(100, 'Plex token too long')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Invalid Plex token format'),

  plexUrl: z.string()
    .url('Invalid Plex server URL')
    .refine(url => {
      const parsed = new URL(url)
      return parsed.protocol === 'http:' || parsed.protocol === 'https:'
    }, 'Plex URL must use HTTP or HTTPS protocol')
}

// HTML sanitization with custom config
export function sanitizeHtml(input: string, allowedTags?: string[]): string {
  if (typeof input !== 'string') return ''
  
  // Simple HTML sanitization without external dependencies
  const allowed = allowedTags || ['b', 'i', 'em', 'strong', 'p', 'br']
  
  // Remove all HTML tags except allowed ones
  let sanitized = input.replace(/<[^>]*>/g, (match) => {
    const tagName = match.match(/<\/?(\w+)/)?.[1]?.toLowerCase()
    return tagName && allowed.includes(tagName) ? match : ''
  })
  
  // Remove dangerous attributes
  sanitized = sanitized.replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
  sanitized = sanitized.replace(/javascript:/gi, '')
  sanitized = sanitized.replace(/data:/gi, '')
  
  return sanitized.trim()
}

// XSS protection for text content
export function sanitizeText(input: string): string {
  if (typeof input !== 'string') return ''
  
  return input
    .replace(/[<>]/g, '') // Remove potential HTML tags
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+=/gi, '') // Remove event handlers
    .trim()
}

// SQL injection protection for search terms
export function sanitizeSearchTerm(input: string): string {
  if (typeof input !== 'string') return ''
  
  return input
    .replace(/['"`;\\]/g, '') // Remove SQL special characters
    .replace(/(-{2,}|\/\*|\*\/)/g, '') // Remove SQL comments
    .trim()
    .slice(0, 100) // Limit length
}

// Path traversal protection
export function sanitizeFilePath(input: string): string {
  if (typeof input !== 'string') return ''
  
  return input
    .replace(/\.\./g, '') // Remove parent directory references
    .replace(/[<>:"|?*]/g, '') // Remove invalid filename characters
    .replace(/^\/+/, '') // Remove leading slashes
    .trim()
}

// URL parameter sanitization
export function sanitizeUrlParam(input: string): string {
  if (typeof input !== 'string') return ''
  
  try {
    return decodeURIComponent(input)
      .replace(/[<>'"]/g, '')
      .trim()
      .slice(0, 200)
  } catch {
    return input.replace(/[<>'"]/g, '').trim().slice(0, 200)
  }
}

// Enhanced validation with sanitization
export class InputValidator {
  private errors: string[] = []

  validate<T>(schema: z.ZodSchema<T>, input: unknown): { success: true; data: T } | { success: false; errors: string[] } {
    try {
      const result = schema.parse(input)
      return { success: true, data: result }
    } catch (error) {
      if (error instanceof z.ZodError) {
        this.errors = error.issues.map((err: z.ZodIssue) => err.message)
        return { success: false, errors: this.errors }
      }
      return { success: false, errors: ['Validation failed'] }
    }
  }

  validateAndSanitize(input: {
    roomName?: string
    description?: string
    chatMessage?: string
    searchTerm?: string
    filePath?: string
    urlParam?: string
  }): {
    success: boolean
    data?: typeof input
    errors?: string[]
  } {
    const sanitized: typeof input = {}
    const errors: string[] = []

    if (input.roomName !== undefined) {
      const result = this.validate(schemas.roomName, input.roomName)
      if (result.success) {
        sanitized.roomName = sanitizeText(result.data)
      } else {
        errors.push(...result.errors)
      }
    }

    if (input.description !== undefined) {
      const result = this.validate(schemas.roomDescription, input.description)
      if (result.success && result.data) {
        sanitized.description = sanitizeHtml(result.data)
      } else if (result.success) {
        sanitized.description = undefined
      } else {
        errors.push(...result.errors)
      }
    }

    if (input.chatMessage !== undefined) {
      const result = this.validate(schemas.chatMessage, input.chatMessage)
      if (result.success) {
        sanitized.chatMessage = sanitizeText(result.data)
      } else {
        errors.push(...result.errors)
      }
    }

    if (input.searchTerm !== undefined) {
      sanitized.searchTerm = sanitizeSearchTerm(input.searchTerm)
    }

    if (input.filePath !== undefined) {
      sanitized.filePath = sanitizeFilePath(input.filePath)
    }

    if (input.urlParam !== undefined) {
      sanitized.urlParam = sanitizeUrlParam(input.urlParam)
    }

    return errors.length > 0 
      ? { success: false, errors }
      : { success: true, data: sanitized }
  }
}

// CSRF token management
export class CSRFProtection {
  private static tokens = new Map<string, { token: string; expires: number }>()
  
  static generateToken(sessionId: string): string {
    const token = crypto.getRandomValues(new Uint8Array(32))
      .reduce((acc, byte) => acc + byte.toString(16).padStart(2, '0'), '')
    
    const expires = Date.now() + (60 * 60 * 1000) // 1 hour
    
    this.tokens.set(sessionId, { token, expires })
    
    // Clean up expired tokens
    this.cleanup()
    
    return token
  }
  
  static validateToken(sessionId: string, token: string): boolean {
    const stored = this.tokens.get(sessionId)
    
    if (!stored || stored.expires < Date.now()) {
      this.tokens.delete(sessionId)
      return false
    }
    
    return stored.token === token
  }
  
  static removeToken(sessionId: string): void {
    this.tokens.delete(sessionId)
  }
  
  private static cleanup(): void {
    const now = Date.now()
    for (const [sessionId, data] of this.tokens.entries()) {
      if (data.expires < now) {
        this.tokens.delete(sessionId)
      }
    }
  }
}

// Content Security Policy helpers
export const cspDirectives = {
  defaultSrc: ["'self'"],
  scriptSrc: [
    "'self'",
    "'unsafe-eval'", // Required for Next.js development
    "https://cdn.socket.io",
    "https://www.gstatic.com"
  ],
  styleSrc: [
    "'self'",
    "'unsafe-inline'", // Required for Tailwind CSS
    "https://fonts.googleapis.com"
  ],
  fontSrc: [
    "'self'",
    "https://fonts.gstatic.com"
  ],
  imgSrc: [
    "'self'",
    "data:",
    "blob:",
    "https:",
    "http:" // For Plex media thumbnails
  ],
  mediaSrc: [
    "'self'",
    "blob:",
    "https:",
    "http:" // For Plex media streaming
  ],
  connectSrc: [
    "'self'",
    "wss:",
    "ws:",
    "https:",
    "http:" // For Plex server connections
  ],
  frameSrc: ["'none'"],
  objectSrc: ["'none'"],
  baseUri: ["'self'"],
  formAction: ["'self'"],
  upgradeInsecureRequests: true
}

export function generateCSP(): string {
  const directives = Object.entries(cspDirectives)
    .map(([key, value]) => {
      const kebabKey = key.replace(/([A-Z])/g, '-$1').toLowerCase()
      if (Array.isArray(value)) {
        return `${kebabKey} ${value.join(' ')}`
      }
      return kebabKey
    })
    .join('; ')
  
  return directives
}

// Security headers
export const securityHeaders = {
  'X-DNS-Prefetch-Control': 'on',
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  'X-XSS-Protection': '1; mode=block',
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'origin-when-cross-origin',
  'Content-Security-Policy': generateCSP(),
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
}

// Utility function to validate API request body
export function validateRequestBody<T>(
  body: unknown,
  schema: z.ZodSchema<T>
): { success: true; data: T } | { success: false; error: string } {
  try {
    const data = schema.parse(body)
    return { success: true, data }
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessage = error.issues.map((err: z.ZodIssue) => `${err.path.join('.')}: ${err.message}`).join(', ')
      return { success: false, error: errorMessage }
    }
    return { success: false, error: 'Invalid request body' }
  }
}