export interface PlexServer {
  machineIdentifier: string
  name: string
  host: string
  port: number
  scheme: string
  product: string
  version: string
  accessToken: string
}

export interface PlexLibrary {
  key: string
  type: string
  title: string
  scanner: string
  language: string
  uuid: string
  updatedAt: number
  createdAt: number
}

export interface PlexMedia {
  ratingKey: string
  key: string
  type: string
  title: string
  summary?: string
  year?: number
  thumb?: string
  art?: string
  duration?: number
  addedAt: number
  updatedAt: number
  originallyAvailableAt?: string
  studio?: string
  contentRating?: string
  rating?: number
  viewCount?: number
  Media?: PlexMediaFile[]
}

export interface PlexMediaFile {
  id: number
  duration: number
  bitrate: number
  width: number
  height: number
  aspectRatio: number
  audioChannels: number
  audioCodec: string
  videoCodec: string
  container: string
  videoFrameRate: string
  Part: PlexPart[]
}

export interface PlexPart {
  id: number
  key: string
  duration: number
  file: string
  size: number
  container: string
  indexes: string
  videoProfile: string
}

export interface PlexSeason {
  ratingKey: string
  key: string
  type: string
  title: string
  summary?: string
  index: number
  thumb?: string
  art?: string
  leafCount: number
  viewedLeafCount: number
  addedAt: number
  updatedAt: number
}

export interface PlexEpisode {
  ratingKey: string
  key: string
  type: string
  title: string
  summary?: string
  index: number
  parentIndex: number
  year?: number
  thumb?: string
  art?: string
  duration?: number
  addedAt: number
  updatedAt: number
  originallyAvailableAt?: string
  contentRating?: string
  rating?: number
  viewCount?: number
  grandparentTitle?: string
  parentTitle?: string
  Media?: PlexMediaFile[]
  Director?: Array<{ tag: string }>
  Writer?: Array<{ tag: string }>
}

interface RequestConfig {
  timeout: number;
  retries: number;
  headers: Record<string, string>;
}

interface RequestResult<T> {
  data: T;
  latency: number;
  attempt: number;
}

interface ConnectionHealth {
  successCount: number;
  failureCount: number;
  averageLatency: number;
  lastSuccessTime: number;
  consecutiveFailures: number;
}

export class PlexAPI {
  private baseUrl: string
  private token: string
  private defaultConfig: RequestConfig
  private connectionHealth: ConnectionHealth

  constructor(baseUrl: string, token: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '') // Remove trailing slash
    this.token = token
    
    // Initialize connection health tracking
    this.connectionHealth = {
      successCount: 0,
      failureCount: 0,
      averageLatency: 0,
      lastSuccessTime: 0,
      consecutiveFailures: 0
    }
    
    // Centralized request configuration - ONE source of truth
    this.defaultConfig = {
      timeout: 30000, // Base timeout - will adapt based on network conditions
      retries: 2,     // Base retries - will increase if network is unstable
      headers: {
        'X-Plex-Token': this.token,
        'Accept': 'application/json',
        'X-Plex-Client-Identifier': process.env.PLEX_CLIENT_IDENTIFIER || 'plex-watch-together',
        'X-Plex-Product': 'Plex Watch Together',
        'X-Plex-Version': '1.0.0',
      }
    }
  }

  /**
   * Get adaptive configuration based on current network health
   */
  private getAdaptiveConfig(baseConfig: RequestConfig): RequestConfig {
    const health = this.connectionHealth
    
    // If network is unstable (high consecutive failures), be more aggressive
    if (health.consecutiveFailures >= 3) {
      return {
        ...baseConfig,
        timeout: Math.min(baseConfig.timeout * 1.5, 45000), // Increase timeout up to 45s
        retries: Math.min(baseConfig.retries + 2, 5) // Increase retries up to 5
      }
    }
    
    // If network is very fast (low average latency), be more optimistic
    if (health.averageLatency > 0 && health.averageLatency < 1000 && health.consecutiveFailures === 0) {
      return {
        ...baseConfig,
        timeout: Math.max(baseConfig.timeout * 0.8, 15000), // Reduce timeout but not below 15s
        retries: Math.max(baseConfig.retries - 1, 1) // Reduce retries but keep at least 1
      }
    }
    
    return baseConfig // Use default if network health is normal
  }

  /**
   * Update connection health metrics
   */
  private updateConnectionHealth(success: boolean, latency: number) {
    const health = this.connectionHealth
    
    if (success) {
      health.successCount++
      health.consecutiveFailures = 0
      health.lastSuccessTime = Date.now()
      
      // Update running average latency
      if (health.averageLatency === 0) {
        health.averageLatency = latency
      } else {
        health.averageLatency = (health.averageLatency * 0.8) + (latency * 0.2)
      }
      
      console.log(`🟢 Network Health: ${health.successCount} successes, avg latency: ${Math.round(health.averageLatency)}ms`)
    } else {
      health.failureCount++
      health.consecutiveFailures++
      console.log(`🔴 Network Health: ${health.consecutiveFailures} consecutive failures, ${health.failureCount} total failures`)
    }
  }

  /**
   * Centralized Request Manager - Guarantees consistent behavior for ALL requests
   */
  private async makeRequest<T>(
    endpoint: string, 
    config?: Partial<RequestConfig>
  ): Promise<RequestResult<T>> {
    const baseConfig = { ...this.defaultConfig, ...config }
    const finalConfig = this.getAdaptiveConfig(baseConfig)
    const url = `${this.baseUrl}${endpoint}`
    
    console.log(`🌐 Plex Request: ${url} (timeout: ${finalConfig.timeout}ms, retries: ${finalConfig.retries})`)
    
    let lastError: Error
    
    // Consistent retry logic for ALL requests
    for (let attempt = 1; attempt <= finalConfig.retries + 1; attempt++) {
      const startTime = Date.now()
      
      try {
        console.log(`  Attempt ${attempt}/${finalConfig.retries + 1}: ${url}`)
        
        const result = await this.executeSingleRequest<T>(url, finalConfig, attempt)
        const latency = Date.now() - startTime
        
        console.log(`✅ Success: ${url} (${latency}ms, attempt ${attempt})`)
        this.updateConnectionHealth(true, latency)
        return {
          data: result,
          latency,
          attempt
        }
        
      } catch (error) {
        const latency = Date.now() - startTime
        lastError = error instanceof Error ? error : new Error('Unknown error')
        
        console.log(`❌ Attempt ${attempt} failed: ${lastError.message} (${latency}ms)`)
        
        // Don't retry on certain errors
        if (this.shouldNotRetry(lastError)) {
          console.log(`🚫 Not retrying - error type: ${lastError.message}`)
          break
        }
        
        // Wait before retry (except on last attempt)
        if (attempt <= finalConfig.retries) {
          const delay = Math.min(1000 * attempt, 3000) // Progressive backoff
          console.log(`⏳ Waiting ${delay}ms before retry...`)
          await new Promise(resolve => setTimeout(resolve, delay))
        }
      }
    }
    
    // All attempts failed - update health and enhance error
    this.updateConnectionHealth(false, 0)
    throw this.enhanceError(lastError!, url, finalConfig)
  }

  /**
   * Execute a single HTTP request with guaranteed timeout behavior - OVERRIDES ALL Node.js timeouts
   */
  private async executeSingleRequest<T>(
    url: string,
    config: RequestConfig,
    attempt: number
  ): Promise<T> {
    // Create AbortController to override Node.js built-in timeouts
    const controller = new AbortController()
    
    // Create timeout promise - THIS controls timing, not Node.js
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        controller.abort() // Cancel the request 
        reject(new Error(`TIMEOUT_${config.timeout}ms_attempt_${attempt}`))
      }, config.timeout)
    })

    // Create fetch promise with AbortController to override Node.js timeout
    const fetchPromise = fetch(url, { 
      headers: config.headers,
      signal: controller.signal, // This OVERRIDES Node.js 10s timeout
    })

    // Race them - our timeout wins over Node.js timeout
    const response = await Promise.race([fetchPromise, timeoutPromise])
    
    if (!response.ok) {
      throw new Error(`HTTP_${response.status}_${response.statusText}`)
    }

    const data = await response.json()
    return data.MediaContainer || data
  }

  /**
   * Determine if we should retry based on error type
   */
  private shouldNotRetry(error: Error): boolean {
    const message = error.message.toLowerCase()
    
    // Don't retry on authentication errors, 404s, etc.
    if (message.includes('http_401') || message.includes('http_403') || message.includes('http_404')) {
      return true
    }
    
    return false
  }

  /**
   * Enhance error messages with helpful context
   */
  private enhanceError(error: Error, url: string, config: RequestConfig): Error {
    const message = error.message
    
    if (message.includes('TIMEOUT_')) {
      return new Error(`Connection timeout after ${config.timeout}ms. Your Plex server is not responding from this network location. Since your Plex works normally, this indicates network routing issues between the webapp server and douglinux.duckdns.org.`)
    }
    
    if (message.includes('ECONNREFUSED')) {
      return new Error(`Connection refused by ${url}. Plex server may not be running on the expected port or firewall is blocking webapp access.`)
    }
    
    if (message.includes('EAI_AGAIN') || message.includes('ENOTFOUND')) {
      return new Error(`DNS resolution failed for douglinux.duckdns.org. The webapp server cannot resolve this hostname.`)
    }
    
    if (message.includes('HTTP_')) {
      return new Error(`Plex server error: ${message.replace('HTTP_', 'Status ')} at ${url}`)
    }
    
    return new Error(`Plex connection failed: ${message}. This suggests network connectivity issues between the webapp and your Plex server.`)
  }

  

  // Authenticate with Plex.tv to get user token using claim token
  static async authenticateWithClaim(claimToken: string): Promise<{ token: string; user: any }> {
    console.log('Attempting to exchange claim token:', claimToken)
    
    try {
      // Exchange the claim token for an auth token using the correct Plex.tv API
      // The Plex.tv API returns XML by default, so we need to handle that
      const claimResponse = await fetch('https://plex.tv/api/claim/exchange', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/xml', // Plex.tv returns XML
          'X-Plex-Client-Identifier': process.env.PLEX_CLIENT_IDENTIFIER || 'plex-watch-together',
          'X-Plex-Product': 'Plex Watch Together',
          'X-Plex-Version': '1.0.0',
        },
        body: new URLSearchParams({
          token: claimToken
        }).toString()
      })

      console.log('Claim exchange response status:', claimResponse.status)
      
      if (!claimResponse.ok) {
        const errorText = await claimResponse.text()
        console.error('Claim exchange failed:', errorText)
        
        if (claimResponse.status === 404) {
          throw new Error('Invalid claim token. Please get a new one from plex.tv/claim')
        }
        if (claimResponse.status === 400) {
          throw new Error('Claim token has expired. Please get a new one from plex.tv/claim')
        }
        
        throw new Error(`Failed to exchange claim token (${claimResponse.status}): Make sure the token is valid and not expired`)
      }

      // Parse the XML response
      const claimXML = await claimResponse.text()
      console.log('Received claim response XML:', claimXML)
      
      // Extract the auth token from XML using regex (simple approach)
      const authTokenMatch = claimXML.match(/authToken="([^"]+)"/);
      if (!authTokenMatch || !authTokenMatch[1]) {
        throw new Error('No auth token received from claim exchange. The claim token may be invalid or expired.')
      }
      
      const authToken = authTokenMatch[1]
      console.log('Extracted auth token successfully')

      // Get user info with the auth token
      const userResponse = await fetch('https://plex.tv/api/v2/user', {
        headers: {
          'X-Plex-Token': authToken,
          'Accept': 'application/json',
          'X-Plex-Client-Identifier': process.env.PLEX_CLIENT_IDENTIFIER || 'plex-watch-together',
        }
      })

      if (!userResponse.ok) {
        const errorText = await userResponse.text()
        console.error('User info request failed:', errorText)
        throw new Error(`Failed to get user info (${userResponse.status}): ${errorText}`)
      }

      const user = await userResponse.json()
      console.log('User info retrieved successfully:', { username: user.username, title: user.title })

      return {
        token: authToken,
        user: user
      }
    } catch (error) {
      console.error('Full claim token exchange error:', error)
      throw error
    }
  }

  // Authenticate with Plex.tv to get user token (legacy pin method)
  static async authenticateWithPin(pin: string): Promise<{ token: string; user: unknown }> {
    const response = await fetch(`https://plex.tv/api/v2/pins/${pin}`, {
      headers: {
        'Accept': 'application/json',
        'X-Plex-Client-Identifier': process.env.PLEX_CLIENT_IDENTIFIER || 'plex-watch-together',
      }
    })

    if (!response.ok) {
      throw new Error('Failed to authenticate with Plex')
    }

    const data = await response.json()
    
    if (!data.authToken) {
      throw new Error('Pin not yet authorized')
    }

    // Get user info with the token
    const userResponse = await fetch('https://plex.tv/api/v2/user', {
      headers: {
        'X-Plex-Token': data.authToken,
        'Accept': 'application/json'
      }
    })

    const user = await userResponse.json()

    return {
      token: data.authToken,
      user: user
    }
  }

  // Get user's Plex servers
  async getServers(): Promise<PlexServer[]> {
    const data = await this.makeRequest<{ Server: PlexServer[] }>('/')
    return (data as any).Server || []
  }

    // Get all libraries with consistent handling
  async getLibraries(): Promise<PlexLibrary[]> {
    try {
      const result = await this.makeRequest<{ Directory: PlexLibrary[] }>('/library/sections')
      return result.data.Directory || []
    } catch (error) {
      console.error('❌ Get libraries failed:', error)
      throw error // Enhanced error already provided by makeRequest
    }
  }

  // Get media from a specific library with consistent request handling
  async getLibraryContent(libraryKey: string, start = 0, size = 50): Promise<PlexMedia[]> {
    try {
      const result = await this.makeRequest<{ Metadata: PlexMedia[] }>(
        `/library/sections/${libraryKey}/all?X-Plex-Container-Start=${start}&X-Plex-Container-Size=${size}`
        // Uses default config automatically - no timeout parameter needed!
      )
      return result.data.Metadata || []
    } catch (error) {
      console.error(`❌ Library ${libraryKey} failed:`, error)
      throw error // Let the enhanced error from makeRequest bubble up
    }
  }

  // Search for media with consistent handling
  async search(query: string): Promise<PlexMedia[]> {
    try {
      const encodedQuery = encodeURIComponent(query)
      const result = await this.makeRequest<{ Metadata: PlexMedia[] }>(`/hubs/search?query=${encodedQuery}`)
      return result.data.Metadata || []
    } catch (error) {
      console.error('❌ Search failed:', error)
      throw error // Enhanced error already provided by makeRequest
    }
  }

    // Get detailed information about a specific media item
  async getMediaDetails(ratingKey: string): Promise<PlexMedia | null> {
    try {
      const result = await this.makeRequest<{ Metadata: PlexMedia[] }>(`/library/metadata/${ratingKey}`)
      return result.data.Metadata?.[0] || null
    } catch (error) {
      console.error(`❌ Media details failed for ${ratingKey}:`, error)
      return null
    }
  }

  // Get streaming URL for media
  getStreamUrl(ratingKey: string, partKey: string): string {
    return `${this.baseUrl}${partKey}?X-Plex-Token=${this.token}`
  }

  // Get transcoding session URL
  getTranscodeUrl(ratingKey: string, options: {
    width?: number
    height?: number
    videoBitrate?: number
    audioBitrate?: number
    videoCodec?: string
    audioCodec?: string
  } = {}): string {
    const params = new URLSearchParams({
      'X-Plex-Token': this.token,
      'X-Plex-Session-Identifier': `plex-watch-together-${Date.now()}`,
      'X-Plex-Product': 'Plex Watch Together',
      'path': `/library/metadata/${ratingKey}`,
      'mediaIndex': '0',
      'partIndex': '0',
      'protocol': 'hls',
      'fastSeek': '1',
      'directPlay': '0',
      'directStream': '1',
      'subtitleSize': '100',
      'audioBoost': '100',
      'location': 'wan',
      'addDebugOverlay': '0',
      'autoAdjustQuality': '0'
    })

    // Add optional parameters
    if (options.width) params.set('maxVideoBitrate', options.videoBitrate?.toString() || '4000')
    if (options.height) params.set('videoResolution', `${options.width}x${options.height}`)

    return `${this.baseUrl}/video/:/transcode/universal/start.m3u8?${params.toString()}`
  }

  // Stop transcoding session
  async stopTranscode(sessionKey: string): Promise<void> {
    await this.makeRequest(`/video/:/transcode/universal/stop?session=${sessionKey}`)
  }

  // Test basic connectivity with consistent request handling
  async testConnection(quickTest = false): Promise<boolean> {
    try {
      const config = quickTest ? { timeout: 15000 } : undefined // Use default for full test
      
      await this.makeRequest('/', config)
      return true
    } catch (error) {
      console.log('🔍 Connection test failed:', error instanceof Error ? error.message : error)
      return false
    }
  }

  // Enhanced diagnostics with detailed metrics from centralized manager
  async testConnectionWithDiagnostics(): Promise<{
    success: boolean;
    latency?: number;
    error?: string;
    serverInfo?: any;
    attempt?: number;
  }> {
    try {
      const result = await this.makeRequest('/')
      
      return {
        success: true,
        latency: result.latency,
        attempt: result.attempt,
        serverInfo: {
          name: (result.data as any)?.friendlyName || 'Plex Server',
          version: (result.data as any)?.version || 'Unknown',
          machineIdentifier: (result.data as any)?.machineIdentifier || 'unknown'
        }
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  // Get server identity without requiring full server list
  async getServerIdentity(): Promise<{ name: string; version: string; machineIdentifier: string } | null> {
    try {
      const result = await this.makeRequest<any>('/', { timeout: 15000 })
      return {
        name: result.data.friendlyName || 'Plex Server',
        version: result.data.version || 'Unknown',
        machineIdentifier: result.data.machineIdentifier || 'unknown'
      }
    } catch (error) {
      return null
    }
  }

  /**
   * Get current connection health status
   */
  getConnectionHealth(): ConnectionHealth & { healthScore: number; status: string } {
    const health = this.connectionHealth
    const totalRequests = health.successCount + health.failureCount
    const successRate = totalRequests > 0 ? health.successCount / totalRequests : 0
    const timeSinceLastSuccess = Date.now() - health.lastSuccessTime
    
    // Calculate health score (0-100)
    let healthScore = successRate * 100
    
    // Penalize for consecutive failures
    healthScore -= health.consecutiveFailures * 10
    
    // Penalize for high latency
    if (health.averageLatency > 5000) healthScore -= 20
    else if (health.averageLatency > 2000) healthScore -= 10
    
    // Penalize if no recent success
    if (timeSinceLastSuccess > 60000) healthScore -= 30
    
    healthScore = Math.max(0, Math.min(100, healthScore))
    
    let status = 'Excellent'
    if (healthScore < 80) status = 'Good'
    if (healthScore < 60) status = 'Fair'
    if (healthScore < 40) status = 'Poor'
    if (healthScore < 20) status = 'Critical'
    
    return {
      ...health,
      healthScore: Math.round(healthScore),
      status
    }
  }

  /**
   * Get seasons for a TV show
   */
  async getShowSeasons(showRatingKey: string): Promise<PlexSeason[]> {
    try {
      const result = await this.makeRequest<any>(`/library/metadata/${showRatingKey}/children`)
      
      if (!result.data?.Metadata) {
        return []
      }
      
      return result.data.Metadata.map((season: any) => ({
        ratingKey: season.ratingKey,
        key: season.key,
        type: season.type,
        title: season.title,
        summary: season.summary,
        index: season.index,
        thumb: season.thumb,
        art: season.art,
        leafCount: season.leafCount,
        viewedLeafCount: season.viewedLeafCount,
        addedAt: season.addedAt,
        updatedAt: season.updatedAt
      }))
    } catch (error) {
      console.error('Error fetching TV show seasons:', error)
      throw error
    }
  }

  /**
   * Get episodes for a season
   */
  async getSeasonEpisodes(seasonRatingKey: string): Promise<PlexEpisode[]> {
    try {
      const result = await this.makeRequest<any>(`/library/metadata/${seasonRatingKey}/children`)
      
      if (!result.data?.Metadata) {
        return []
      }
      
      return result.data.Metadata.map((episode: any) => ({
        ratingKey: episode.ratingKey,
        key: episode.key,
        type: episode.type,
        title: episode.title,
        summary: episode.summary,
        index: episode.index,
        parentIndex: episode.parentIndex,
        year: episode.year,
        thumb: episode.thumb,
        art: episode.art,
        duration: episode.duration,
        addedAt: episode.addedAt,
        updatedAt: episode.updatedAt,
        originallyAvailableAt: episode.originallyAvailableAt,
        contentRating: episode.contentRating,
        rating: episode.rating,
        viewCount: episode.viewCount,
        grandparentTitle: episode.grandparentTitle,
        parentTitle: episode.parentTitle,
        Media: episode.Media,
        Director: episode.Director,
        Writer: episode.Writer
      }))
    } catch (error) {
      console.error('Error fetching season episodes:', error)
      throw error
    }
  }

  /**
   * Get all episodes for a TV show (across all seasons)
   */
  async getShowEpisodes(showRatingKey: string): Promise<PlexEpisode[]> {
    try {
      const result = await this.makeRequest<any>(`/library/metadata/${showRatingKey}/allLeaves`)
      
      if (!result.data?.Metadata) {
        return []
      }
      
      return result.data.Metadata.map((episode: any) => ({
        ratingKey: episode.ratingKey,
        key: episode.key,
        type: episode.type,
        title: episode.title,
        summary: episode.summary,
        index: episode.index,
        parentIndex: episode.parentIndex,
        year: episode.year,
        thumb: episode.thumb,
        art: episode.art,
        duration: episode.duration,
        addedAt: episode.addedAt,
        updatedAt: episode.updatedAt,
        originallyAvailableAt: episode.originallyAvailableAt,
        contentRating: episode.contentRating,
        rating: episode.rating,
        viewCount: episode.viewCount,
        grandparentTitle: episode.grandparentTitle,
        parentTitle: episode.parentTitle,
        Media: episode.Media,
        Director: episode.Director,
        Writer: episode.Writer
      }))
    } catch (error) {
      console.error('Error fetching show episodes:', error)
      throw error
    }
  }
}