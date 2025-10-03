'use client'

import React, { useState, useEffect } from 'react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Wifi, WifiOff, Activity, Zap, Clock, Users } from 'lucide-react'

interface NetworkMetrics {
  latency: number
  jitter: number
  bandwidth: number
  quality: 'excellent' | 'good' | 'fair' | 'poor'
  packetsLost: number
  reconnections: number
}

interface RoomMetrics {
  activeConnections: number
  messageRate: number
  syncEvents: number
  averageLatency: number
  totalMembers: number
}

interface EnhancedNetworkHealthProps {
  metrics: NetworkMetrics
  roomMetrics?: RoomMetrics
  isConnected: boolean
  showDetails?: boolean
  compact?: boolean
}

export function EnhancedNetworkHealth({
  metrics,
  roomMetrics,
  isConnected,
  showDetails = false,
  compact = false
}: EnhancedNetworkHealthProps) {
  const [historicalData, setHistoricalData] = useState<{
    latencies: number[]
    qualities: string[]
    timestamps: number[]
  }>({
    latencies: [],
    qualities: [],
    timestamps: []
  })

  // Update historical data
  useEffect(() => {
    const now = Date.now()
    setHistoricalData(prev => ({
      latencies: [...prev.latencies.slice(-20), metrics.latency],
      qualities: [...prev.qualities.slice(-20), metrics.quality],
      timestamps: [...prev.timestamps.slice(-20), now]
    }))
  }, [metrics.latency, metrics.quality])

  const getQualityColor = (quality: string) => {
    switch (quality) {
      case 'excellent':
        return 'text-green-600 bg-green-50 border-green-200'
      case 'good':
        return 'text-blue-600 bg-blue-50 border-blue-200'
      case 'fair':
        return 'text-yellow-600 bg-yellow-50 border-yellow-200'
      case 'poor':
        return 'text-red-600 bg-red-50 border-red-200'
      default:
        return 'text-gray-600 bg-gray-50 border-gray-200'
    }
  }

  const getLatencyColor = (latency: number) => {
    if (latency < 50) return 'bg-green-500'
    if (latency < 150) return 'bg-blue-500'
    if (latency < 300) return 'bg-yellow-500'
    return 'bg-red-500'
  }

  const getQualityIcon = () => {
    if (!isConnected) return <WifiOff className="w-4 h-4" />
    
    switch (metrics.quality) {
      case 'excellent':
        return <Wifi className="w-4 h-4 text-green-600" />
      case 'good':
        return <Wifi className="w-4 h-4 text-blue-600" />
      case 'fair':
        return <Wifi className="w-4 h-4 text-yellow-600" />
      case 'poor':
        return <WifiOff className="w-4 h-4 text-red-600" />
      default:
        return <Wifi className="w-4 h-4 text-gray-400" />
    }
  }

  const getRecommendation = () => {
    if (!isConnected) return 'Reconnecting to server...'
    if (metrics.quality === 'poor') return 'Connection issues detected. Check network.'
    if (metrics.quality === 'fair') return 'Moderate performance. Consider refreshing.'
    if (metrics.latency > 200) return 'High latency detected.'
    if (metrics.jitter > 50) return 'Network instability detected.'
    return 'Connection is stable'
  }

  // Compact view for minimal space usage
  if (compact) {
    return (
      <div className="flex items-center gap-2 text-sm">
        {getQualityIcon()}
        <Badge className={getQualityColor(metrics.quality)}>
          {metrics.latency}ms
        </Badge>
        {!isConnected && (
          <span className="text-red-500 text-xs">Disconnected</span>
        )}
      </div>
    )
  }

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Activity className="w-5 h-5" />
          Network Health
          <Badge className={getQualityColor(metrics.quality)}>
            {metrics.quality.charAt(0).toUpperCase() + metrics.quality.slice(1)}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Connection Status */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {getQualityIcon()}
            <span className="font-medium">
              {isConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
          <div className="text-sm text-gray-600">
            {getRecommendation()}
          </div>
        </div>

        {/* Latency Metrics */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4" />
              <span className="text-sm font-medium">Latency</span>
            </div>
            <span className="text-sm">{metrics.latency}ms</span>
          </div>
          <Progress
            value={Math.min((metrics.latency / 500) * 100, 100)}
            className="h-2"
            color={getLatencyColor(metrics.latency)}
          />
        </div>

        {showDetails && (
          <>
            {/* Detailed Metrics */}
            <div className="grid grid-cols-2 gap-4 pt-2">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-blue-500" />
                  <span className="text-sm font-medium">Jitter</span>
                </div>
                <span className="text-lg font-mono">{metrics.jitter.toFixed(1)}ms</span>
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-green-500" />
                  <span className="text-sm font-medium">Bandwidth</span>
                </div>
                <span className="text-lg font-mono">
                  {(metrics.bandwidth / 1000000).toFixed(1)}MB/s
                </span>
              </div>

              <div className="space-y-1">
                <span className="text-sm font-medium text-red-500">Packet Loss</span>
                <span className="text-lg font-mono">{metrics.packetsLost}</span>
              </div>

              <div className="space-y-1">
                <span className="text-sm font-medium text-orange-500">Reconnects</span>
                <span className="text-lg font-mono">{metrics.reconnections}</span>
              </div>
            </div>

            {/* Room Performance Metrics */}
            {roomMetrics && (
              <div className="border-t pt-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  <span className="font-medium">Room Performance</span>
                </div>
                
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-600">Active Connections</span>
                    <div className="font-mono text-lg">{roomMetrics.activeConnections}</div>
                  </div>
                  
                  <div>
                    <span className="text-gray-600">Total Members</span>
                    <div className="font-mono text-lg">{roomMetrics.totalMembers}</div>
                  </div>
                  
                  <div>
                    <span className="text-gray-600">Message Rate</span>
                    <div className="font-mono text-lg">{roomMetrics.messageRate}/s</div>
                  </div>
                  
                  <div>
                    <span className="text-gray-600">Sync Events</span>
                    <div className="font-mono text-lg">{roomMetrics.syncEvents}</div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Average Room Latency</span>
                    <span className="text-sm">{roomMetrics.averageLatency}ms</span>
                  </div>
                  <Progress
                    value={Math.min((roomMetrics.averageLatency / 500) * 100, 100)}
                    className="h-2"
                    color={getLatencyColor(roomMetrics.averageLatency)}
                  />
                </div>
              </div>
            )}

            {/* Historical Trend */}
            <div className="border-t pt-4 space-y-2">
              <span className="text-sm font-medium">Latency Trend (Last 20 samples)</span>
              <div className="flex items-end gap-1 h-8">
                {historicalData.latencies.slice(-20).map((latency, index) => (
                  <div
                    key={index}
                    className={`w-2 ${getLatencyColor(latency)} opacity-70`}
                    style={{
                      height: `${Math.min((latency / 500) * 100, 100)}%`
                    }}
                    title={`${latency}ms`}
                  />
                ))}
              </div>
            </div>

            {/* Quality Distribution */}
            <div className="border-t pt-4 space-y-2">
              <span className="text-sm font-medium">Quality Distribution</span>
              <div className="flex gap-2 text-xs">
                {['excellent', 'good', 'fair', 'poor'].map(quality => {
                  const count = historicalData.qualities.filter(q => q === quality).length
                  const percentage = historicalData.qualities.length > 0 
                    ? (count / historicalData.qualities.length) * 100 
                    : 0
                  
                  return (
                    <Badge
                      key={quality}
                      className={`${getQualityColor(quality)} text-xs`}
                    >
                      {quality}: {percentage.toFixed(0)}%
                    </Badge>
                  )
                })}
              </div>
            </div>
          </>
        )}

        {/* Connection Recommendations */}
        {metrics.quality === 'poor' && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm">
            <div className="font-medium text-red-800 mb-1">Connection Issues Detected</div>
            <div className="text-red-700">
              High latency ({metrics.latency}ms) and poor quality detected. 
              Consider refreshing the page or checking your network connection.
            </div>
          </div>
        )}

        {metrics.jitter > 50 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm">
            <div className="font-medium text-yellow-800 mb-1">Network Instability</div>
            <div className="text-yellow-700">
              High jitter ({metrics.jitter.toFixed(1)}ms) may cause sync issues. 
              Network stability problems detected.
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}