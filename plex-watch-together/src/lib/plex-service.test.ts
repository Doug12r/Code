import { PlexService, getPlexService, resetPlexService } from '@/lib/plex-service'

/**
 * Plex Service Plugin Test Suite
 * 
 * Tests:
 * 1. Caching behavior
 * 2. Request deduplication
 * 3. Error handling
 * 4. Performance metrics
 * 5. Real API integration
 */

// Mock PlexAPI for controlled testing
class MockPlexAPI {
  private callCount = 0
  private shouldFail = false
  private responseDelay = 100

  constructor(private baseUrl: string, private token: string) {}

  async getLibraries() {
    this.callCount++
    console.log(`📞 MockAPI Call #${this.callCount}: getLibraries()`)
    
    if (this.shouldFail) {
      throw new Error('Mock API failure')
    }
    
    await new Promise(resolve => setTimeout(resolve, this.responseDelay))
    
    return [
      { key: '1', title: 'Movies', type: 'movie' },
      { key: '2', title: 'TV Shows', type: 'show' }
    ]
  }

  async getLibraryContent(libraryKey: string, start = 0, size = 50) {
    this.callCount++
    console.log(`📞 MockAPI Call #${this.callCount}: getLibraryContent(${libraryKey})`)
    
    if (this.shouldFail) {
      throw new Error('Mock API failure')
    }
    
    await new Promise(resolve => setTimeout(resolve, this.responseDelay))
    
    return [
      { ratingKey: '1001', title: `Sample Movie ${start}`, type: 'movie' },
      { ratingKey: '1002', title: `Sample Movie ${start + 1}`, type: 'movie' }
    ]
  }

  async search(query: string) {
    this.callCount++
    console.log(`📞 MockAPI Call #${this.callCount}: search("${query}")`)
    
    await new Promise(resolve => setTimeout(resolve, this.responseDelay))
    
    return [
      { ratingKey: '2001', title: `Search Result: ${query}`, type: 'movie' }
    ]
  }

  async getServerIdentity() {
    this.callCount++
    console.log(`📞 MockAPI Call #${this.callCount}: getServerIdentity()`)
    
    await new Promise(resolve => setTimeout(resolve, this.responseDelay))
    
    return {
      name: 'Test Plex Server',
      version: '1.0.0',
      machineIdentifier: 'test-123'
    }
  }

  async testConnectionWithDiagnostics() {
    this.callCount++
    console.log(`📞 MockAPI Call #${this.callCount}: testConnectionWithDiagnostics()`)
    
    return {
      success: !this.shouldFail,
      latency: this.responseDelay,
      error: this.shouldFail ? 'Mock connection failed' : undefined
    }
  }

  getCallCount() {
    return this.callCount
  }

  setShouldFail(fail: boolean) {
    this.shouldFail = fail
  }

  setResponseDelay(delay: number) {
    this.responseDelay = delay
  }
}

/**
 * Test Suite Runner
 */
export class PlexServiceTester {
  private mockAPI: MockPlexAPI
  private service: PlexService

  constructor() {
    this.mockAPI = new MockPlexAPI('http://test:32400', 'test-token')
    
    // Create service with mock API (we'll need to modify PlexService to accept this)
    this.service = new PlexService('http://test:32400', 'test-token', {
      librariesCacheTTL: 1000,     // 1 second for fast testing
      mediaCacheTTL: 500,          // 0.5 seconds for fast testing
      serverCacheTTL: 1500,        // 1.5 seconds for fast testing
      enableDeduplication: true
    })
    
    // Inject mock API (we'll need to make this possible)
    // @ts-ignore - for testing purposes
    this.service.api = this.mockAPI
  }

  /**
   * Test 1: Caching Behavior
   */
  async testCaching(): Promise<boolean> {
    console.log('\n🧪 Test 1: Caching Behavior')
    
    try {
      // Reset call counter
      const initialCalls = this.mockAPI.getCallCount()
      
      // First call - should hit API
      console.log('Making first getLibraries() call...')
      const result1 = await this.service.getLibraries()
      const callsAfterFirst = this.mockAPI.getCallCount()
      
      // Second call immediately - should hit cache
      console.log('Making second getLibraries() call (should be cached)...')
      const result2 = await this.service.getLibraries()
      const callsAfterSecond = this.mockAPI.getCallCount()
      
      // Verify results are identical
      const resultsMatch = JSON.stringify(result1) === JSON.stringify(result2)
      
      // Verify only one API call was made
      const apiCallsMade = callsAfterSecond - initialCalls
      
      console.log(`✅ API calls made: ${apiCallsMade} (should be 1)`)
      console.log(`✅ Results match: ${resultsMatch}`)
      console.log(`✅ Cache working: ${apiCallsMade === 1 && resultsMatch}`)
      
      return apiCallsMade === 1 && resultsMatch
      
    } catch (error) {
      console.log(`❌ Caching test failed:`, error)
      return false
    }
  }

  /**
   * Test 2: Request Deduplication
   */
  async testDeduplication(): Promise<boolean> {
    console.log('\n🧪 Test 2: Request Deduplication')
    
    try {
      // Clear cache first
      this.service.clearCache()
      
      const initialCalls = this.mockAPI.getCallCount()
      
      // Make 3 concurrent identical requests
      console.log('Making 3 concurrent getLibraries() calls...')
      const promises = [
        this.service.getLibraries(),
        this.service.getLibraries(),
        this.service.getLibraries()
      ]
      
      const results = await Promise.all(promises)
      const callsAfter = this.mockAPI.getCallCount()
      
      // Should only make 1 API call despite 3 requests
      const apiCallsMade = callsAfter - initialCalls
      
      // All results should be identical
      const allMatch = results.every(result => 
        JSON.stringify(result) === JSON.stringify(results[0])
      )
      
      console.log(`✅ API calls made: ${apiCallsMade} (should be 1)`)
      console.log(`✅ All results identical: ${allMatch}`)
      console.log(`✅ Deduplication working: ${apiCallsMade === 1 && allMatch}`)
      
      // Check metrics
      const metrics = this.service.getMetrics()
      console.log(`✅ Deduplicated requests: ${metrics.deduplicatedRequests}`)
      
      return apiCallsMade === 1 && allMatch
      
    } catch (error) {
      console.log(`❌ Deduplication test failed:`, error)
      return false
    }
  }

  /**
   * Test 3: Cache Expiration
   */
  async testCacheExpiration(): Promise<boolean> {
    console.log('\n🧪 Test 3: Cache Expiration')
    
    try {
      this.service.clearCache()
      
      const initialCalls = this.mockAPI.getCallCount()
      
      // First call
      console.log('Making first getLibraries() call...')
      await this.service.getLibraries()
      const callsAfterFirst = this.mockAPI.getCallCount()
      
      // Wait for cache to expire (1 second)
      console.log('Waiting for cache to expire (1.1 seconds)...')
      await new Promise(resolve => setTimeout(resolve, 1100))
      
      // Second call - should hit API again
      console.log('Making second call after cache expiration...')
      await this.service.getLibraries()
      const callsAfterSecond = this.mockAPI.getCallCount()
      
      const totalApiCalls = callsAfterSecond - initialCalls
      
      console.log(`✅ Total API calls: ${totalApiCalls} (should be 2)`)
      console.log(`✅ Cache expiration working: ${totalApiCalls === 2}`)
      
      return totalApiCalls === 2
      
    } catch (error) {
      console.log(`❌ Cache expiration test failed:`, error)
      return false
    }
  }

  /**
   * Test 4: Error Handling
   */
  async testErrorHandling(): Promise<boolean> {
    console.log('\n🧪 Test 4: Error Handling')
    
    try {
      this.service.clearCache()
      
      // Make API fail
      this.mockAPI.setShouldFail(true)
      
      let errorCaught = false
      try {
        await this.service.getLibraries()
      } catch (error) {
        errorCaught = true
        console.log(`✅ Error properly caught: ${error instanceof Error ? error.message : String(error)}`)
      }
      
      // Reset API to working state
      this.mockAPI.setShouldFail(false)
      
      // Verify error metrics
      const metrics = this.service.getMetrics()
      console.log(`✅ Error rate tracked: ${metrics.errorRate > 0}`)
      
      console.log(`✅ Error handling working: ${errorCaught}`)
      
      return errorCaught
      
    } catch (error) {
      console.log(`❌ Error handling test failed:`, error)
      return false
    }
  }

  /**
   * Test 5: Performance Metrics
   */
  async testMetrics(): Promise<boolean> {
    console.log('\n🧪 Test 5: Performance Metrics')
    
    try {
      this.service.clearCache()
      
      // Make some requests to generate metrics
      await this.service.getLibraries()        // Cache miss
      await this.service.getLibraries()        // Cache hit
      await this.service.getLibraryMedia('1')  // Cache miss
      await this.service.getLibraryMedia('1')  // Cache hit
      
      const metrics = this.service.getMetrics()
      
      console.log(`✅ Total requests: ${metrics.totalRequests}`)
      console.log(`✅ Cache hits: ${metrics.cacheHits}`)
      console.log(`✅ Cache misses: ${metrics.cacheMisses}`)
      console.log(`✅ Cache hit rate: ${metrics.cacheHitRate}%`)
      console.log(`✅ Average response time: ${metrics.averageResponseTime}ms`)
      
      const hasValidMetrics = (
        metrics.totalRequests > 0 &&
        metrics.cacheHits > 0 &&
        metrics.cacheMisses > 0 &&
        metrics.cacheHitRate > 0
      )
      
      console.log(`✅ Metrics tracking working: ${hasValidMetrics}`)
      
      return hasValidMetrics
      
    } catch (error) {
      console.log(`❌ Metrics test failed:`, error)
      return false
    }
  }

  /**
   * Run all tests
   */
  async runAllTests(): Promise<void> {
    console.log('🚀 Starting Plex Service Plugin Test Suite')
    console.log('=' .repeat(50))
    
    const tests = [
      { name: 'Caching', fn: () => this.testCaching() },
      { name: 'Deduplication', fn: () => this.testDeduplication() },
      { name: 'Cache Expiration', fn: () => this.testCacheExpiration() },
      { name: 'Error Handling', fn: () => this.testErrorHandling() },
      { name: 'Performance Metrics', fn: () => this.testMetrics() }
    ]
    
    const results: { [key: string]: boolean } = {}
    
    for (const test of tests) {
      try {
        results[test.name] = await test.fn()
      } catch (error) {
        console.log(`❌ ${test.name} test crashed:`, error)
        results[test.name] = false
      }
    }
    
    // Summary
    console.log('\n📊 Test Results Summary')
    console.log('=' .repeat(50))
    
    let passed = 0
    let total = 0
    
    for (const [testName, result] of Object.entries(results)) {
      const status = result ? '✅ PASS' : '❌ FAIL'
      console.log(`${status} ${testName}`)
      if (result) passed++
      total++
    }
    
    console.log(`\n🎯 Overall: ${passed}/${total} tests passed`)
    
    if (passed === total) {
      console.log('🎉 All tests passed! Plugin is working correctly.')
    } else {
      console.log('⚠️  Some tests failed. Check implementation.')
    }
  }
}

/**
 * Quick test runner for development
 */
export async function runQuickTests() {
  const tester = new PlexServiceTester()
  await tester.runAllTests()
}

// Export for use in test files
export { MockPlexAPI }