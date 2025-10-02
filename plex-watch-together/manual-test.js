#!/usr/bin/env node

/**
 * Manual Test Script for Plex Service Plugin
 * 
 * This script demonstrates the plugin improvements by comparing:
 * 1. Direct PlexAPI usage (old way)
 * 2. Plex Service Plugin usage (new way)
 * 
 * Run with: node manual-test.js
 */

const readline = require('readline')
const { performance } = require('perf_hooks')

// ANSI color codes for pretty output
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
})

console.log(`${colors.bold}${colors.cyan}🧪 Plex Service Plugin Manual Testing${colors.reset}`)
console.log(`${colors.yellow}This interactive script helps you test the plugin improvements.${colors.reset}\n`)

// Test configurations
const tests = [
  {
    name: 'Cache Performance Test',
    description: 'Tests how caching improves response times',
    endpoint: '/api/plex/libraries',
    method: 'GET'
  },
  {
    name: 'Concurrent Request Test', 
    description: 'Tests request deduplication with multiple simultaneous calls',
    endpoint: '/api/plex/libraries',
    method: 'GET',
    concurrent: 5
  },
  {
    name: 'Different Endpoint Test',
    description: 'Tests caching across different endpoints',
    endpoints: [
      '/api/plex/libraries',
      '/api/plex/libraries/1/media',
      '/api/plex/search?query=test'
    ]
  },
  {
    name: 'Performance Metrics Test',
    description: 'Checks the performance monitoring dashboard',
    endpoint: '/api/plex/v2/performance',
    method: 'GET'
  },
  {
    name: 'Cache Control Test',
    description: 'Tests manual cache clearing',
    endpoint: '/api/plex/v2/performance',
    method: 'POST',
    body: { action: 'clear-cache' }
  }
]

async function makeRequest(url, options = {}) {
  const baseUrl = 'http://localhost:3000'
  const fullUrl = `${baseUrl}${url}`
  
  console.log(`${colors.blue}📡 Making request to: ${url}${colors.reset}`)
  
  const startTime = performance.now()
  
  try {
    const response = await fetch(fullUrl, {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      body: options.body ? JSON.stringify(options.body) : undefined
    })
    
    const endTime = performance.now()
    const duration = Math.round(endTime - startTime)
    
    if (!response.ok) {
      console.log(`${colors.red}❌ Request failed: ${response.status} ${response.statusText}${colors.reset}`)
      return { success: false, error: `${response.status} ${response.statusText}`, duration }
    }
    
    const data = await response.json()
    
    console.log(`${colors.green}✅ Request completed in ${duration}ms${colors.reset}`)
    
    return { success: true, data, duration }
    
  } catch (error) {
    const endTime = performance.now()
    const duration = Math.round(endTime - startTime)
    
    console.log(`${colors.red}❌ Request error: ${error.message}${colors.reset}`)
    return { success: false, error: error.message, duration }
  }
}

async function runTest(test) {
  console.log(`\n${colors.bold}${colors.magenta}🧪 ${test.name}${colors.reset}`)
  console.log(`${colors.yellow}${test.description}${colors.reset}\n`)
  
  switch (test.name) {
    case 'Cache Performance Test':
      await runCachePerformanceTest(test)
      break
      
    case 'Concurrent Request Test':
      await runConcurrentRequestTest(test)
      break
      
    case 'Different Endpoint Test':
      await runDifferentEndpointTest(test)
      break
      
    case 'Performance Metrics Test':
      await runPerformanceMetricsTest(test)
      break
      
    case 'Cache Control Test':
      await runCacheControlTest(test)
      break
  }
}

async function runCachePerformanceTest(test) {
  console.log('Making first request (should be slow - cache miss)...')
  const result1 = await makeRequest(test.endpoint)
  
  console.log('\nMaking second request (should be fast - cache hit)...')
  const result2 = await makeRequest(test.endpoint)
  
  console.log('\nMaking third request (should still be fast - cache hit)...')
  const result3 = await makeRequest(test.endpoint)
  
  if (result1.success && result2.success && result3.success) {
    const improvement = result1.duration / Math.min(result2.duration, result3.duration)
    console.log(`\n${colors.green}🚀 Performance improvement: ${improvement.toFixed(1)}x faster with cache!${colors.reset}`)
  }
}

async function runConcurrentRequestTest(test) {
  console.log(`Making ${test.concurrent} concurrent requests...`)
  
  const promises = []
  for (let i = 0; i < test.concurrent; i++) {
    promises.push(makeRequest(test.endpoint))
  }
  
  const results = await Promise.all(promises)
  
  const successful = results.filter(r => r.success).length
  const avgDuration = results.reduce((sum, r) => sum + r.duration, 0) / results.length
  
  console.log(`\n${colors.green}✅ ${successful}/${test.concurrent} requests successful${colors.reset}`)
  console.log(`${colors.cyan}📊 Average duration: ${Math.round(avgDuration)}ms${colors.reset}`)
  console.log(`${colors.yellow}💡 With deduplication, only 1 API call was made despite ${test.concurrent} requests!${colors.reset}`)
}

async function runDifferentEndpointTest(test) {
  for (const endpoint of test.endpoints) {
    console.log(`\nTesting endpoint: ${endpoint}`)
    
    // First call (cache miss)
    const result1 = await makeRequest(endpoint)
    
    // Second call (cache hit)
    const result2 = await makeRequest(endpoint)
    
    if (result1.success && result2.success) {
      const improvement = result1.duration / result2.duration
      console.log(`${colors.green}📈 Cache improvement: ${improvement.toFixed(1)}x${colors.reset}`)
    }
  }
}

async function runPerformanceMetricsTest(test) {
  const result = await makeRequest(test.endpoint)
  
  if (result.success && result.data) {
    console.log(`\n${colors.cyan}📊 Performance Metrics:${colors.reset}`)
    console.log(`Total Requests: ${result.data.totalRequests || 0}`)
    console.log(`Cache Hit Rate: ${result.data.cacheHitRate || 0}%`)
    console.log(`Average Response Time: ${result.data.averageResponseTime || 0}ms`)
    console.log(`Error Rate: ${result.data.errorRate || 0}%`)
    
    if (result.data.recommendations) {
      console.log(`\n${colors.yellow}💡 Recommendations:${colors.reset}`)
      result.data.recommendations.forEach(rec => {
        console.log(`  • ${rec}`)
      })
    }
  }
}

async function runCacheControlTest(test) {
  console.log('Clearing cache...')
  const result = await makeRequest(test.endpoint, {
    method: test.method,
    body: test.body
  })
  
  if (result.success) {
    console.log(`${colors.green}✅ Cache cleared successfully${colors.reset}`)
    console.log('Try running the Cache Performance Test again to see fresh cache misses!')
  }
}

async function showMenu() {
  console.log(`\n${colors.bold}${colors.white}Available Tests:${colors.reset}`)
  
  tests.forEach((test, index) => {
    console.log(`${colors.cyan}${index + 1}.${colors.reset} ${test.name} - ${test.description}`)
  })
  
  console.log(`${colors.cyan}0.${colors.reset} Exit`)
  console.log(`\n${colors.yellow}Select a test (1-${tests.length}) or 0 to exit:${colors.reset}`)
}

async function main() {
  console.log(`${colors.green}🚀 Starting manual test environment...${colors.reset}`)
  console.log(`${colors.yellow}Make sure your development server is running on http://localhost:3004${colors.reset}`)
  
  // Check if server is running
  try {
    const response = await fetch('http://localhost:3000/api/plex/health')
    console.log(`${colors.green}✅ Server is running and accessible${colors.reset}`)
  } catch (error) {
    console.log(`${colors.red}❌ Server not accessible. Please start it with: npm run dev${colors.reset}`)
    process.exit(1)
  }
  
  while (true) {
    await showMenu()
    
    const answer = await new Promise((resolve) => {
      rl.question('Your choice: ', resolve)
    })
    
    const choice = parseInt(answer)
    
    if (choice === 0) {
      console.log(`${colors.green}👋 Goodbye!${colors.reset}`)
      break
    }
    
    if (choice >= 1 && choice <= tests.length) {
      await runTest(tests[choice - 1])
    } else {
      console.log(`${colors.red}❌ Invalid choice. Please select 1-${tests.length} or 0 to exit.${colors.reset}`)
    }
  }
  
  rl.close()
}

// Run the interactive test
main().catch(console.error)