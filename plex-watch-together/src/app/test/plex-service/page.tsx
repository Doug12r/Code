'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loader2 } from 'lucide-react'

interface TestResult {
  name: string
  success: boolean
  duration: number
  error?: string
  data?: any
}

export default function PlexServiceTestPage() {
  const [results, setResults] = useState<TestResult[]>([])
  const [isRunning, setIsRunning] = useState(false)
  const [currentTest, setCurrentTest] = useState<string>('')

  const runTest = async (name: string, endpoint: string, options: RequestInit = {}) => {
    setCurrentTest(name)
    const startTime = performance.now()

    try {
      const response = await fetch(endpoint, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers
        }
      })

      const endTime = performance.now()
      const duration = Math.round(endTime - startTime)

      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`)
      }

      const data = await response.json()

      return {
        name,
        success: true,
        duration,
        data: Array.isArray(data) ? `${data.length} items` : 'Success'
      }
    } catch (error) {
      const endTime = performance.now()
      const duration = Math.round(endTime - startTime)

      return {
        name,
        success: false,
        duration,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }

  const runCacheTest = async () => {
    setIsRunning(true)
    setResults([])
    
    try {
      // Test 1: First call (cache miss)
      const result1 = await runTest('First Call (Cache Miss)', '/api/plex/libraries')
      setResults(prev => [...prev, result1])

      // Small delay to see the difference
      await new Promise(resolve => setTimeout(resolve, 100))

      // Test 2: Second call (cache hit)
      const result2 = await runTest('Second Call (Cache Hit)', '/api/plex/libraries')
      setResults(prev => [...prev, result2])

      // Test 3: Third call (still cache hit)
      const result3 = await runTest('Third Call (Still Cache Hit)', '/api/plex/libraries')
      setResults(prev => [...prev, result3])

    } finally {
      setIsRunning(false)
      setCurrentTest('')
    }
  }

  const runConcurrentTest = async () => {
    setIsRunning(true)
    setResults([])
    
    try {
      setCurrentTest('5 Concurrent Requests (Deduplication Test)')
      
      const startTime = performance.now()
      
      // Make 5 concurrent requests
      const promises = Array.from({ length: 5 }, (_, i) => 
        fetch('/api/plex/libraries').then(res => res.json())
      )
      
      await Promise.all(promises)
      
      const endTime = performance.now()
      const duration = Math.round(endTime - startTime)
      
      setResults([{
        name: '5 Concurrent Requests',
        success: true,
        duration,
        data: 'All requests completed (deduplication should mean only 1 API call was made)'
      }])

    } catch (error) {
      setResults([{
        name: '5 Concurrent Requests',
        success: false,
        duration: 0,
        error: error instanceof Error ? error.message : String(error)
      }])
    } finally {
      setIsRunning(false)
      setCurrentTest('')
    }
  }

  const runMetricsTest = async () => {
    setIsRunning(true)
    setResults([])
    
    try {
      const result = await runTest('Performance Metrics', '/api/plex/v2/performance')
      setResults([result])
    } finally {
      setIsRunning(false)
      setCurrentTest('')
    }
  }

  const clearCache = async () => {
    setIsRunning(true)
    setCurrentTest('Clearing Cache')
    
    try {
      const result = await runTest('Clear Cache', '/api/plex/v2/performance', {
        method: 'POST',
        body: JSON.stringify({ action: 'clear-cache' })
      })
      setResults([result])
    } finally {
      setIsRunning(false)
      setCurrentTest('')
    }
  }

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <h1 className="text-3xl font-bold mb-6">Plex Service Plugin Testing</h1>
      
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Cache Performance Test</CardTitle>
            <CardDescription>
              Tests how caching improves response times. First call should be slower (cache miss), 
              subsequent calls should be much faster (cache hits).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              onClick={runCacheTest} 
              disabled={isRunning}
              className="w-full"
            >
              {isRunning && currentTest.includes('Cache') ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Running...</>
              ) : (
                'Run Cache Test'
              )}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Concurrent Request Test</CardTitle>
            <CardDescription>
              Tests request deduplication. Makes 5 concurrent identical requests - 
              deduplication should ensure only 1 actual API call is made.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              onClick={runConcurrentTest} 
              disabled={isRunning}
              className="w-full"
            >
              {isRunning && currentTest.includes('Concurrent') ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Running...</>
              ) : (
                'Run Concurrent Test'
              )}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Performance Metrics</CardTitle>
            <CardDescription>
              View current plugin performance metrics including cache hit rates, 
              response times, and recommendations.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              onClick={runMetricsTest} 
              disabled={isRunning}
              className="w-full"
              variant="outline"
            >
              {isRunning && currentTest.includes('Metrics') ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading...</>
              ) : (
                'View Metrics'
              )}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cache Control</CardTitle>
            <CardDescription>
              Clear all caches to reset the plugin state. Useful for testing 
              cache miss behavior or starting fresh.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              onClick={clearCache} 
              disabled={isRunning}
              className="w-full"
              variant="destructive"
            >
              {isRunning && currentTest.includes('Cache') ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Clearing...</>
              ) : (
                'Clear Cache'
              )}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Current Test Status */}
      {isRunning && currentTest && (
        <Card className="mt-6">
          <CardContent className="pt-6">
            <div className="flex items-center justify-center">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              <span>Running: {currentTest}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {results.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Test Results</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {results.map((result, index) => (
                <div key={index} className="flex items-center justify-between p-3 border rounded">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{result.name}</span>
                      <Badge variant={result.success ? 'default' : 'destructive'}>
                        {result.success ? 'SUCCESS' : 'FAILED'}
                      </Badge>
                    </div>
                    {result.error && (
                      <p className="text-sm text-red-600 mt-1">{result.error}</p>
                    )}
                    {result.data && (
                      <p className="text-sm text-gray-600 mt-1">{result.data}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-mono">
                      {result.duration}ms
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Testing Instructions */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>💡 Testing Tips</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-disc list-inside space-y-2 text-sm">
            <li><strong>Cache Test:</strong> First call should be slower (~100-500ms), subsequent calls should be much faster (~1-10ms)</li>
            <li><strong>Concurrent Test:</strong> Despite 5 requests, only 1 API call should be made due to deduplication</li>
            <li><strong>Performance Metrics:</strong> Shows cache hit rates, average response times, and optimization recommendations</li>
            <li><strong>Clear Cache:</strong> Resets all caches - useful for testing cache miss behavior again</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}