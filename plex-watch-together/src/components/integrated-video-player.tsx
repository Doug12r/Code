'use client'

import React, { useRef, useEffect, useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Settings,
  BarChart3,
  Zap,
  HardDrive,
  Activity,
  Wifi,
  Database
} from 'lucide-react'

// Import our enhanced services
import { AdaptiveStreamingManager, NetworkMetrics, createAdaptiveStreamingManager } from '@/lib/adaptive-streaming'
import { AdvancedBufferingManager, createBufferingManager } from '@/lib/advanced-buffering'
import { MediaCacheManager, createCacheManager } from '@/lib/media-cache-manager'

interface IntegratedVideoPlayerProps {
  src: string
  title?: string
  poster?: string
  autoPlay?: boolean
  muted?: boolean
  roomId?: string
  onTimeUpdate?: (currentTime: number) => void
  onPlay?: () => void
  onPause?: () => void
  onSeek?: (time: number) => void
  canControl?: boolean
  enableAdvancedFeatures?: boolean
}

interface PlayerPerformance {
  streaming: any
  buffering: any
  caching: any
  overall: {
    score: number
    status: 'excellent' | 'good' | 'fair' | 'poor'
    recommendations: string[]
  }
}

export function IntegratedVideoPlayer({
  src,
  title = 'Media',
  poster,
  autoPlay = false,
  muted = false,
  roomId,
  onTimeUpdate,
  onPlay,
  onPause,
  onSeek,
  canControl = true,
  enableAdvancedFeatures = true
}: IntegratedVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamingManagerRef = useRef<AdaptiveStreamingManager | null>(null)
  const bufferingManagerRef = useRef<AdvancedBufferingManager | null>(null)
  const cacheManagerRef = useRef<MediaCacheManager | null>(null)
  
  // Player state
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const [isMuted, setIsMuted] = useState(muted)
  const [isLoading, setIsLoading] = useState(false)
  const [showControls, setShowControls] = useState(true)
  
  // Enhanced features state
  const [currentQuality, setCurrentQuality] = useState<any>(null)
  const [availableQualities, setAvailableQualities] = useState<any[]>([])
  const [showPerformancePanel, setShowPerformancePanel] = useState(false)
  const [performance, setPerformance] = useState<PlayerPerformance | null>(null)
  const [networkMetrics, setNetworkMetrics] = useState<NetworkMetrics | null>(null)

  // Initialize enhanced services
  useEffect(() => {
    if (!enableAdvancedFeatures || !src) return

    console.log('🚀 Initializing integrated video player with advanced features')

    // Initialize adaptive streaming
    const streamingManager = createAdaptiveStreamingManager({
      enableAdaptive: true,
      maxQuality: '1080p',
      minQuality: '240p'
    })
    streamingManagerRef.current = streamingManager

    // Initialize buffering manager
    const bufferingManager = createBufferingManager({
      minBufferSize: 5,
      maxBufferSize: 30,
      targetBufferSize: 10,
      adaptiveBuffering: true
    })
    bufferingManagerRef.current = bufferingManager

    // Initialize cache manager
    const cacheManager = createCacheManager({
      maxCacheSize: 100 * 1024 * 1024, // 100MB
      maxSegments: 500,
      preloadDistance: 20,
      cacheWarming: true
    })
    cacheManagerRef.current = cacheManager

    // Setup adaptive streaming
    const qualities = streamingManager.initialize(src)
    setAvailableQualities(qualities)
    setCurrentQuality(streamingManager.getCurrentQuality())

    console.log('✅ Integrated video player initialized successfully')

    return () => {
      streamingManagerRef.current = null
      bufferingManagerRef.current = null
      cacheManagerRef.current = null
    }
  }, [src, enableAdvancedFeatures])

  // Performance monitoring loop
  useEffect(() => {
    if (!enableAdvancedFeatures) return

    const monitoringInterval = setInterval(async () => {
      await updatePerformanceMetrics()
    }, 2000)

    return () => clearInterval(monitoringInterval)
  }, [enableAdvancedFeatures])

  // Network monitoring
  useEffect(() => {
    if (!enableAdvancedFeatures) return

    const networkInterval = setInterval(async () => {
      await measureNetworkPerformance()
    }, 5000)

    return () => clearInterval(networkInterval)
  }, [enableAdvancedFeatures])

  const updatePerformanceMetrics = useCallback(async () => {
    const video = videoRef.current
    if (!video || !streamingManagerRef.current || !bufferingManagerRef.current || !cacheManagerRef.current) {
      return
    }

    try {
      // Update buffering metrics
      const bufferMetrics = bufferingManagerRef.current.updateBufferMetrics(video)
      
      // Get streaming statistics
      const streamingStats = streamingManagerRef.current.getStatistics()
      
      // Get cache analytics
      const cacheAnalytics = cacheManagerRef.current.getCacheAnalytics()

      // Update network conditions for all services
      if (networkMetrics) {
        bufferingManagerRef.current.updateNetworkCondition({
          bandwidth: networkMetrics.bandwidth,
          latency: networkMetrics.latency,
          stability: 100 - (networkMetrics.jitter / 100) * 100,
          quality: networkMetrics.bandwidth > 5000000 ? 'excellent' : 
                  networkMetrics.bandwidth > 2000000 ? 'good' :
                  networkMetrics.bandwidth > 1000000 ? 'fair' : 'poor'
        })

        cacheManagerRef.current.updateNetworkConditions(networkMetrics.bandwidth, networkMetrics.latency)
      }

      // Calculate overall performance score
      const overallScore = calculateOverallPerformance(streamingStats, bufferMetrics, cacheAnalytics)

      setPerformance({
        streaming: streamingStats,
        buffering: bufferingManagerRef.current.getBufferAnalytics(),
        caching: cacheAnalytics,
        overall: overallScore
      })

      // Trigger intelligent preloading
      if (currentQuality && networkMetrics) {
        await cacheManagerRef.current.preloadSegments(
          currentTime,
          currentQuality.id,
          availableQualities.map(q => q.id),
          networkMetrics.bandwidth
        )
      }

    } catch (error) {
      console.error('Performance monitoring error:', error)
    }
  }, [currentTime, currentQuality, availableQualities, networkMetrics])

  const measureNetworkPerformance = useCallback(async () => {
    try {
      // Measure latency
      const pingStart = window.performance.now()
      await fetch('/api/ping', { method: 'HEAD' })
      const latency = window.performance.now() - pingStart

      // Measure bandwidth
      const bandwidthStart = window.performance.now()
      const response = await fetch('/api/bandwidth-test?size=50kb')
      const bandwidthEnd = window.performance.now()
      const data = await response.blob()
      
      const transferTime = (bandwidthEnd - bandwidthStart) / 1000
      const bandwidth = (data.size * 8) / transferTime // bits per second
      
      const metrics: NetworkMetrics = {
        bandwidth,
        latency,
        packetLoss: 0,
        jitter: Math.random() * 20,
        timestamp: Date.now()
      }

      setNetworkMetrics(metrics)

      // Update streaming manager
      if (streamingManagerRef.current) {
        const newQuality = streamingManagerRef.current.updateNetrics(metrics)
        if (newQuality) {
          setCurrentQuality(newQuality)
          handleQualitySwitch(newQuality)
        }
      }

    } catch (error) {
      console.error('Network measurement error:', error)
    }
  }, [])

  const handleQualitySwitch = useCallback((newQuality: any) => {
    const video = videoRef.current
    if (!video) return

    console.log(`🎯 Quality switch: ${currentQuality?.label || 'unknown'} → ${newQuality.label}`)
    
    // In a real implementation, this would switch the video source
    // For now, we'll just update the state
    setCurrentQuality(newQuality)
  }, [currentQuality])

  const calculateOverallPerformance = useCallback((streaming: any, buffering: any, caching: any) => {
    const streamingScore = streaming.networkQuality.score
    const bufferingScore = buffering.performance.bufferEfficiency
    const cachingScore = caching.optimization.cacheEfficiency
    
    const overallScore = Math.round((streamingScore * 0.4) + (bufferingScore * 0.3) + (cachingScore * 0.3))
    
    let status: 'excellent' | 'good' | 'fair' | 'poor'
    let recommendations: string[] = []

    if (overallScore >= 80) {
      status = 'excellent'
      recommendations.push('Performance is optimal')
    } else if (overallScore >= 60) {
      status = 'good'
      recommendations.push('Consider enabling higher quality settings')
    } else if (overallScore >= 40) {
      status = 'fair'
      recommendations.push('Check network connection')
      recommendations.push('Clear cache if issues persist')
    } else {
      status = 'poor'
      recommendations.push('Check internet connection')
      recommendations.push('Lower video quality')
      recommendations.push('Close other applications using bandwidth')
    }

    return { score: overallScore, status, recommendations }
  }, [])

  // Standard video controls
  const handlePlay = useCallback(() => {
    if (videoRef.current && canControl) {
      videoRef.current.play()
      setIsPlaying(true)
      onPlay?.()
    }
  }, [canControl, onPlay])

  const handlePause = useCallback(() => {
    if (videoRef.current && canControl) {
      videoRef.current.pause()
      setIsPlaying(false)
      onPause?.()
    }
  }, [canControl, onPause])

  const handleSeek = useCallback((time: number) => {
    if (videoRef.current && canControl) {
      videoRef.current.currentTime = time
      setCurrentTime(time)
      onSeek?.(time)
    }
  }, [canControl, onSeek])

  // Video event listeners
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const handleTimeUpdate = () => {
      const time = video.currentTime
      setCurrentTime(time)
      onTimeUpdate?.(time)
    }

    const handleLoadedMetadata = () => {
      setDuration(video.duration)
    }

    const handleWaiting = () => {
      setIsLoading(true)
    }

    const handleCanPlay = () => {
      setIsLoading(false)
    }

    video.addEventListener('timeupdate', handleTimeUpdate)
    video.addEventListener('loadedmetadata', handleLoadedMetadata)
    video.addEventListener('waiting', handleWaiting)
    video.addEventListener('canplay', handleCanPlay)

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate)
      video.removeEventListener('loadedmetadata', handleLoadedMetadata)
      video.removeEventListener('waiting', handleWaiting)
      video.removeEventListener('canplay', handleCanPlay)
    }
  }, [onTimeUpdate])

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60)
    const seconds = Math.floor(time % 60)
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }

  const getPerformanceColor = (score: number) => {
    if (score >= 80) return 'text-green-600'
    if (score >= 60) return 'text-blue-600'
    if (score >= 40) return 'text-yellow-600'
    return 'text-red-600'
  }

  const getStatusIcon = (type: 'streaming' | 'buffering' | 'caching') => {
    switch (type) {
      case 'streaming':
        return <Wifi className="w-4 h-4" />
      case 'buffering':
        return <Activity className="w-4 h-4" />
      case 'caching':
        return <Database className="w-4 h-4" />
    }
  }

  return (
    <div className="space-y-4">
      {/* Main Video Player */}
      <div className="relative bg-black rounded-lg overflow-hidden">
        <video
          ref={videoRef}
          className="w-full h-auto"
          src={currentQuality?.url || src}
          poster={poster}
          autoPlay={autoPlay}
          muted={isMuted}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
        />

        {/* Loading Overlay */}
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50">
            <div className="flex items-center gap-2 text-white">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
              <span>Optimizing stream...</span>
            </div>
          </div>
        )}

        {/* Controls */}
        {showControls && (
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black to-transparent p-4">
            {/* Progress Bar */}
            <div className="mb-4">
              <div 
                className="w-full h-1 bg-gray-600 rounded cursor-pointer"
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect()
                  const percent = (e.clientX - rect.left) / rect.width
                  handleSeek(percent * duration)
                }}
              >
                <div 
                  className="h-full bg-white rounded"
                  style={{ width: `${(currentTime / duration) * 100}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-white mt-1">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            {/* Control Buttons */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={isPlaying ? handlePause : handlePlay}
                  disabled={!canControl}
                  className="text-white hover:bg-white hover:bg-opacity-20"
                >
                  {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                </Button>

                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsMuted(!isMuted)}
                    className="text-white hover:bg-white hover:bg-opacity-20"
                  >
                    {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                  </Button>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={volume}
                    onChange={(e) => setVolume(parseFloat(e.target.value))}
                    className="w-16 h-1"
                  />
                </div>

                <span className="text-white text-sm font-medium ml-4">{title}</span>
              </div>

              <div className="flex items-center gap-2">
                {/* Quality indicator */}
                {currentQuality && (
                  <Badge variant="outline" className="text-white border-white">
                    {currentQuality.label}
                  </Badge>
                )}

                {/* Performance indicators */}
                {performance && (
                  <div className="flex items-center gap-1">
                    <Badge 
                      variant="outline" 
                      className={`border-white ${getPerformanceColor(performance.overall.score)}`}
                    >
                      {performance.overall.score}%
                    </Badge>
                  </div>
                )}

                {/* Network status */}
                {networkMetrics && (
                  <Badge variant="outline" className="text-white border-white">
                    {Math.round(networkMetrics.bandwidth / 1000000)}Mbps
                  </Badge>
                )}

                {/* Performance Panel Toggle */}
                {enableAdvancedFeatures && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowPerformancePanel(!showPerformancePanel)}
                    className="text-white hover:bg-white hover:bg-opacity-20"
                  >
                    <BarChart3 className="w-4 h-4" />
                  </Button>
                )}

                <Button
                  variant="ghost"
                  size="sm"
                  className="text-white hover:bg-white hover:bg-opacity-20"
                >
                  <Settings className="w-4 h-4" />
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  className="text-white hover:bg-white hover:bg-opacity-20"
                >
                  <Maximize className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Advanced Performance Panel */}
      {showPerformancePanel && performance && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="w-5 h-5" />
              Integrated Performance Monitoring
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="overview" className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="streaming">
                  <div className="flex items-center gap-1">
                    {getStatusIcon('streaming')}
                    Streaming
                  </div>
                </TabsTrigger>
                <TabsTrigger value="buffering">
                  <div className="flex items-center gap-1">
                    {getStatusIcon('buffering')}
                    Buffering
                  </div>
                </TabsTrigger>
                <TabsTrigger value="caching">
                  <div className="flex items-center gap-1">
                    {getStatusIcon('caching')}
                    Caching
                  </div>
                </TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="text-center">
                    <div className={`text-3xl font-bold ${getPerformanceColor(performance.overall.score)}`}>
                      {performance.overall.score}%
                    </div>
                    <div className="text-sm text-gray-600">Overall Performance</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold capitalize">{performance.overall.status}</div>
                    <div className="text-sm text-gray-600">Status</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold">{currentQuality?.label || 'Auto'}</div>
                    <div className="text-sm text-gray-600">Current Quality</div>
                  </div>
                </div>

                {/* Real-time metrics grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-blue-50 p-3 rounded-lg">
                    <div className="flex items-center gap-2">
                      <Wifi className="w-4 h-4 text-blue-600" />
                      <span className="text-sm text-gray-600">Network</span>
                    </div>
                    <div className="text-lg font-bold text-blue-600">
                      {networkMetrics ? `${Math.round(networkMetrics.bandwidth / 1000000)}Mbps` : 'N/A'}
                    </div>
                  </div>
                  
                  <div className="bg-green-50 p-3 rounded-lg">
                    <div className="flex items-center gap-2">
                      <Activity className="w-4 h-4 text-green-600" />
                      <span className="text-sm text-gray-600">Buffer</span>
                    </div>
                    <div className="text-lg font-bold text-green-600">
                      {performance.buffering.currentBuffer.length.toFixed(1)}s
                    </div>
                  </div>
                  
                  <div className="bg-purple-50 p-3 rounded-lg">
                    <div className="flex items-center gap-2">
                      <Database className="w-4 h-4 text-purple-600" />
                      <span className="text-sm text-gray-600">Cache</span>
                    </div>
                    <div className="text-lg font-bold text-purple-600">
                      {performance.caching.overview.hitRate}%
                    </div>
                  </div>
                  
                  <div className="bg-orange-50 p-3 rounded-lg">
                    <div className="flex items-center gap-2">
                      <Activity className="w-4 h-4 text-orange-600" />
                      <span className="text-sm text-gray-600">Quality</span>
                    </div>
                    <div className="text-lg font-bold text-orange-600">
                      {performance.streaming.networkQuality.category}
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <h4 className="font-medium">Recommendations</h4>
                  {performance.overall.recommendations.map((rec, i) => (
                    <div key={i} className="text-sm text-gray-600 flex items-center gap-2">
                      <Zap className="w-3 h-3" />
                      {rec}
                    </div>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="streaming" className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="text-gray-600">Network Quality</span>
                    <div className="font-bold capitalize">{performance.streaming.networkQuality.category}</div>
                  </div>
                  <div>
                    <span className="text-gray-600">Quality Switches</span>
                    <div className="font-bold">{performance.streaming.qualitySwitches}</div>
                  </div>
                  <div>
                    <span className="text-gray-600">Avg Bandwidth</span>
                    <div className="font-bold">{Math.round(performance.streaming.averageBandwidth / 1000000)}Mbps</div>
                  </div>
                  <div>
                    <span className="text-gray-600">Buffer Health</span>
                    <div className="font-bold">{performance.streaming.bufferHealth.level}%</div>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <h4 className="font-medium">Available Qualities</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {availableQualities.map((quality) => (
                      <Badge 
                        key={quality.id} 
                        variant={quality.id === currentQuality?.id ? "default" : "outline"}
                        className="justify-center"
                      >
                        {quality.label}
                      </Badge>
                    ))}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="buffering" className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="text-gray-600">Buffer Length</span>
                    <div className="font-bold">{performance.buffering.currentBuffer.length.toFixed(1)}s</div>
                  </div>
                  <div>
                    <span className="text-gray-600">Buffer Health</span>
                    <div className="font-bold">{Math.round(performance.buffering.currentBuffer.health)}%</div>
                  </div>
                  <div>
                    <span className="text-gray-600">Buffering Events</span>
                    <div className="font-bold">{performance.buffering.performance.bufferingEvents}</div>
                  </div>
                  <div>
                    <span className="text-gray-600">Efficiency</span>
                    <div className="font-bold">{performance.buffering.performance.bufferEfficiency}%</div>
                  </div>
                </div>

                {/* Buffer visualization */}
                <div className="space-y-2">
                  <h4 className="font-medium">Buffer Status</h4>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-blue-600 h-2 rounded-full" 
                      style={{ 
                        width: `${Math.min(100, (performance.buffering.currentBuffer.length / 30) * 100)}%` 
                      }}
                    />
                  </div>
                  <div className="text-xs text-gray-600">
                    Target: {performance.buffering.currentBuffer.targetSize}s | 
                    Current: {performance.buffering.currentBuffer.length.toFixed(1)}s
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="caching" className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="text-gray-600">Cache Size</span>
                    <div className="font-bold">{performance.caching.overview.totalSize}MB</div>
                  </div>
                  <div>
                    <span className="text-gray-600">Hit Rate</span>
                    <div className="font-bold">{performance.caching.overview.hitRate}%</div>
                  </div>
                  <div>
                    <span className="text-gray-600">Segments</span>
                    <div className="font-bold">{performance.caching.overview.segmentCount}</div>
                  </div>
                  <div>
                    <span className="text-gray-600">Utilization</span>
                    <div className="font-bold">{performance.caching.overview.utilization}%</div>
                  </div>
                </div>

                {/* Cache efficiency visualization */}
                <div className="space-y-2">
                  <h4 className="font-medium">Cache Efficiency</h4>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-green-600 h-2 rounded-full" 
                      style={{ width: `${performance.caching.overview.hitRate}%` }}
                    />
                  </div>
                  <div className="text-xs text-gray-600">
                    Hit Rate: {performance.caching.overview.hitRate}% | 
                    Miss Rate: {100 - performance.caching.overview.hitRate}%
                  </div>
                </div>

                <div className="space-y-2">
                  <h4 className="font-medium">Cache Status</h4>
                  <div className="text-sm text-gray-600">
                    Preloading: {performance.caching.optimization.preloadingActive ? 'Active' : 'Inactive'}
                  </div>
                  <div className="text-sm text-gray-600">
                    Eviction Policy: {performance.caching.optimization.evictionPolicy}
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}
    </div>
  )
}