'use client'

import React, { useRef, useEffect, useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Settings,
  Wifi,
  WifiOff,
  Activity,
  BarChart3
} from 'lucide-react'
import { AdaptiveStreamingManager, StreamQuality, NetworkMetrics } from '@/lib/adaptive-streaming'

interface AdaptiveVideoPlayerProps {
  src: string
  title?: string
  poster?: string
  autoPlay?: boolean
  muted?: boolean
  onTimeUpdate?: (currentTime: number) => void
  onPlay?: () => void
  onPause?: () => void
  onSeek?: (time: number) => void
  canControl?: boolean
  showStats?: boolean
  adaptiveConfig?: {
    enableAdaptive?: boolean
    maxQuality?: string
    minQuality?: string
  }
}

interface PlayerStats {
  currentQuality: StreamQuality | null
  availableQualities: StreamQuality[]
  networkQuality: any
  bufferHealth: any
  bandwidthHistory: number[]
  qualitySwitches: number
}

export function AdaptiveVideoPlayer({
  src,
  title = 'Media',
  poster,
  autoPlay = false,
  muted = false,
  onTimeUpdate,
  onPlay,
  onPause,
  onSeek,
  canControl = true,
  showStats = false,
  adaptiveConfig = {}
}: AdaptiveVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamingManagerRef = useRef<AdaptiveStreamingManager | null>(null)
  
  // Player state
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const [isMuted, setIsMuted] = useState(muted)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showControls, setShowControls] = useState(true)
  const [isLoading, setIsLoading] = useState(false)
  
  // Adaptive streaming state
  const [currentQuality, setCurrentQuality] = useState<StreamQuality | null>(null)
  const [availableQualities, setAvailableQualities] = useState<StreamQuality[]>([])
  const [networkStatus, setNetworkStatus] = useState<'excellent' | 'good' | 'fair' | 'poor'>('good')
  const [bandwidthEstimate, setBandwidthEstimate] = useState(0)
  const [bufferLevel, setBufferLevel] = useState(0)
  const [showAdvancedStats, setShowAdvancedStats] = useState(false)
  const [playerStats, setPlayerStats] = useState<PlayerStats | null>(null)
  
  // Network monitoring
  const [pingStartTime, setPingStartTime] = useState<number | null>(null)
  const [bandwidthTestActive, setBandwidthTestActive] = useState(false)

  // Initialize adaptive streaming
  useEffect(() => {
    if (!src) return

    const manager = new AdaptiveStreamingManager(adaptiveConfig)
    streamingManagerRef.current = manager

    // Detect device capabilities
    const deviceCapabilities = {
      width: window.screen.width,
      height: window.screen.height
    }

    // Initialize with media URL
    const qualities = manager.initialize(src, deviceCapabilities)
    setAvailableQualities(qualities)
    setCurrentQuality(manager.getCurrentQuality())

    return () => {
      streamingManagerRef.current = null
    }
  }, [src, adaptiveConfig])

  // Network monitoring and bandwidth estimation
  useEffect(() => {
    let networkMonitorInterval: NodeJS.Timeout

    const startNetworkMonitoring = () => {
      networkMonitorInterval = setInterval(async () => {
        await measureNetworkMetrics()
      }, 5000) // Monitor every 5 seconds
    }

    const measureNetworkMetrics = async () => {
      try {
        // Ping test for latency
        const pingStart = performance.now()
        await fetch('/api/ping', { method: 'HEAD' })
        const latency = performance.now() - pingStart

        // Estimate bandwidth using small data transfer
        const bandwidthStart = performance.now()
        const response = await fetch('/api/bandwidth-test?size=100kb')
        const bandwidthEnd = performance.now()
        const data = await response.blob()
        
        const transferTime = (bandwidthEnd - bandwidthStart) / 1000 // seconds
        const bytes = data.size
        const bandwidth = (bytes * 8) / transferTime // bits per second

        // Update streaming manager
        if (streamingManagerRef.current) {
          const newQuality = streamingManagerRef.current.updateNetrics({
            bandwidth,
            latency,
            packetLoss: 0, // Would need more sophisticated measurement
            jitter: Math.random() * 20 // Simulated
          })

          if (newQuality) {
            handleQualityChange(newQuality)
          }

          // Update UI
          const networkQuality = streamingManagerRef.current.getNetworkQuality()
          setNetworkStatus(networkQuality.category)
          setBandwidthEstimate(bandwidth)
          
          // Update stats
          const stats = streamingManagerRef.current.getStatistics()
          setPlayerStats({
            currentQuality: stats.currentQuality,
            availableQualities: availableQualities,
            networkQuality: stats.networkQuality,
            bufferHealth: stats.bufferHealth,
            bandwidthHistory: [bandwidthEstimate, bandwidth].slice(-10),
            qualitySwitches: stats.qualitySwitches
          })
        }
      } catch (error) {
        console.error('Network monitoring error:', error)
      }
    }

    startNetworkMonitoring()
    return () => {
      if (networkMonitorInterval) {
        clearInterval(networkMonitorInterval)
      }
    }
  }, [availableQualities, bandwidthEstimate])

  // Video event handlers
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

  const handleQualityChange = useCallback((quality: StreamQuality) => {
    if (!videoRef.current || !streamingManagerRef.current) return

    const video = videoRef.current
    const wasPlaying = !video.paused
    const currentTime = video.currentTime

    setIsLoading(true)

    // Switch video source
    video.src = quality.url || src
    video.currentTime = currentTime

    const handleLoadComplete = () => {
      setIsLoading(false)
      setCurrentQuality(quality)
      
      if (wasPlaying) {
        video.play()
      }
      
      video.removeEventListener('canplay', handleLoadComplete)
    }

    video.addEventListener('canplay', handleLoadComplete)
  }, [src])

  const handleManualQualityChange = useCallback((qualityId: string) => {
    if (!streamingManagerRef.current) return

    const quality = streamingManagerRef.current.setQuality(qualityId)
    if (quality) {
      handleQualityChange(quality)
    }
  }, [handleQualityChange])

  // Video element event listeners
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const handleTimeUpdate = () => {
      const time = video.currentTime
      setCurrentTime(time)
      onTimeUpdate?.(time)
      
      // Update buffer level
      if (video.buffered.length > 0) {
        const bufferedEnd = video.buffered.end(video.buffered.length - 1)
        const bufferAhead = bufferedEnd - video.currentTime
        setBufferLevel(Math.min(100, (bufferAhead / 10) * 100)) // 10 seconds = 100%
      }
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

  const getNetworkIcon = () => {
    switch (networkStatus) {
      case 'excellent':
      case 'good':
        return <Wifi className="w-4 h-4 text-green-500" />
      case 'fair':
        return <Wifi className="w-4 h-4 text-yellow-500" />
      case 'poor':
        return <WifiOff className="w-4 h-4 text-red-500" />
      default:
        return <Wifi className="w-4 h-4 text-gray-500" />
    }
  }

  const getBandwidthDisplay = () => {
    if (bandwidthEstimate < 1000000) {
      return `${Math.round(bandwidthEstimate / 1000)} Kbps`
    }
    return `${Math.round(bandwidthEstimate / 1000000)} Mbps`
  }

  return (
    <div className="relative w-full">
      <TooltipProvider>
        {/* Video Container */}
        <div className="relative bg-black rounded-lg overflow-hidden">
          {/* Video Element */}
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
                <span>Switching quality...</span>
              </div>
            </div>
          )}

          {/* Controls Overlay */}
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
                  {/* Play/Pause */}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={isPlaying ? handlePause : handlePlay}
                    disabled={!canControl}
                    className="text-white hover:bg-white hover:bg-opacity-20"
                  >
                    {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  </Button>

                  {/* Volume */}
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

                  {/* Title */}
                  <span className="text-white text-sm font-medium ml-4">{title}</span>
                </div>

                <div className="flex items-center gap-2">
                  {/* Quality Selector */}
                  <Select value={currentQuality?.id || 'auto'} onValueChange={handleManualQualityChange}>
                    <SelectTrigger className="w-24 h-8 text-white border-white bg-transparent">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {availableQualities.map((quality) => (
                        <SelectItem key={quality.id} value={quality.id}>
                          {quality.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {/* Network Status */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center gap-1 text-white">
                        {getNetworkIcon()}
                        <span className="text-xs">{getBandwidthDisplay()}</span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Network: {networkStatus}</p>
                      <p>Bandwidth: {getBandwidthDisplay()}</p>
                    </TooltipContent>
                  </Tooltip>

                  {/* Stats Toggle */}
                  {showStats && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowAdvancedStats(!showAdvancedStats)}
                      className="text-white hover:bg-white hover:bg-opacity-20"
                    >
                      <BarChart3 className="w-4 h-4" />
                    </Button>
                  )}

                  {/* Settings */}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-white hover:bg-white hover:bg-opacity-20"
                  >
                    <Settings className="w-4 h-4" />
                  </Button>

                  {/* Fullscreen */}
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

        {/* Advanced Stats Panel */}
        {showAdvancedStats && playerStats && (
          <Card className="mt-4">
            <CardContent className="p-4">
              <h4 className="font-medium mb-3 flex items-center gap-2">
                <Activity className="w-4 h-4" />
                Streaming Statistics
              </h4>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-gray-600">Current Quality</span>
                  <div className="font-bold">{playerStats.currentQuality?.label || 'Auto'}</div>
                </div>
                
                <div>
                  <span className="text-gray-600">Network Quality</span>
                  <div className="flex items-center gap-1">
                    {getNetworkIcon()}
                    <span className="font-bold capitalize">{networkStatus}</span>
                  </div>
                </div>
                
                <div>
                  <span className="text-gray-600">Buffer Level</span>
                  <div className="flex items-center gap-2">
                    <Progress value={bufferLevel} className="h-2 flex-1" />
                    <span className="font-bold">{bufferLevel.toFixed(0)}%</span>
                  </div>
                </div>
                
                <div>
                  <span className="text-gray-600">Quality Switches</span>
                  <div className="font-bold">{playerStats.qualitySwitches}</div>
                </div>
              </div>
              
              <div className="mt-3 text-xs text-gray-500">
                <p>Adaptive streaming automatically adjusts quality based on network conditions.</p>
              </div>
            </CardContent>
          </Card>
        )}
      </TooltipProvider>
    </div>
  )
}