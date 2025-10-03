'use client'

import React, { useState, useEffect, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { 
  Activity, 
  Users, 
  Zap, 
  Clock, 
  Wifi, 
  AlertTriangle,
  CheckCircle,
  TrendingUp,
  Server,
  Database
} from 'lucide-react'

interface PerformanceMetrics {
  // Socket Performance
  socketConnections: number
  avgLatency: number
  messageRate: number
  eventsPerSecond: number
  bandwidthUsage: number
  
  // Room Metrics
  activeRooms: number
  totalMembers: number
  syncEvents: number
  conflictResolutions: number
  
  // Server Performance
  cpuUsage: number
  memoryUsage: number // Node.js heap percentage
  heapUsed?: number // MB
  heapTotal?: number // MB
  rss?: number // MB - actual RAM used by process
  isCpuSimulated?: boolean
  activeTranscodingSessions: number
  cacheHitRatio: number
  
  // Sync Quality
  syncAccuracy: number
  avgSyncDrift: number
  recoveryEvents: number
  healthyConnections: number
}

interface PerformanceTrend {
  timestamp: number
  value: number
}

interface RealTimePerformanceDashboardProps {
  roomId?: string
  updateInterval?: number
  maxDataPoints?: number
}

export function RealTimePerformanceDashboard({
  roomId,
  updateInterval = 2000,
  maxDataPoints = 50
}: RealTimePerformanceDashboardProps) {
  const [metrics, setMetrics] = useState<PerformanceMetrics>({
    socketConnections: 0,
    avgLatency: 0,
    messageRate: 0,
    eventsPerSecond: 0,
    bandwidthUsage: 0,
    activeRooms: 0,
    totalMembers: 0,
    syncEvents: 0,
    conflictResolutions: 0,
    cpuUsage: 0,
    memoryUsage: 0,
    heapUsed: 0,
    heapTotal: 0,
    rss: 0,
    isCpuSimulated: true,
    activeTranscodingSessions: 0,
    cacheHitRatio: 0,
    syncAccuracy: 100,
    avgSyncDrift: 0,
    recoveryEvents: 0,
    healthyConnections: 0
  })

  const [trends, setTrends] = useState<{
    latency: PerformanceTrend[]
    messageRate: PerformanceTrend[]
    syncAccuracy: PerformanceTrend[]
    cpuUsage: PerformanceTrend[]
  }>({
    latency: [],
    messageRate: [],
    syncAccuracy: [],
    cpuUsage: []
  })

  const [alerts, setAlerts] = useState<Array<{
    id: string
    level: 'info' | 'warning' | 'error'
    message: string
    timestamp: number
  }>>([])

  const wsRef = useRef<WebSocket | null>(null)
  const metricsInterval = useRef<NodeJS.Timeout | null>(null)

  // Initialize real-time metrics connection using polling
  useEffect(() => {
    // Polling method for metrics
    const startPolling = () => {
      metricsInterval.current = setInterval(async () => {
        try {
          const response = await fetch(`/api/metrics${roomId ? `?room=${roomId}` : ''}`)
          if (response.ok) {
            const data = await response.json()
            updateMetrics(data.metrics)
          }
        } catch (error) {
          console.error('Failed to fetch metrics:', error)
        }
      }, updateInterval)
    }

    // Start polling immediately
    startPolling()
    
    // Initial fetch
    const fetchInitialMetrics = async () => {
      try {
        const response = await fetch(`/api/metrics${roomId ? `?room=${roomId}` : ''}`)
        if (response.ok) {
          const data = await response.json()
          updateMetrics(data.metrics)
        }
      } catch (error) {
        console.error('Failed to fetch initial metrics:', error)
      }
    }
    
    fetchInitialMetrics()

    return () => {
      if (metricsInterval.current) {
        clearInterval(metricsInterval.current)
      }
    }
  }, [roomId, updateInterval])

  const updateMetrics = (newMetrics: Partial<PerformanceMetrics>) => {
    const now = Date.now()
    
    setMetrics(prev => ({ ...prev, ...newMetrics }))
    
    // Update trends
    setTrends(prev => ({
      latency: [...prev.latency.slice(-maxDataPoints + 1), { timestamp: now, value: newMetrics.avgLatency || 0 }],
      messageRate: [...prev.messageRate.slice(-maxDataPoints + 1), { timestamp: now, value: newMetrics.messageRate || 0 }],
      syncAccuracy: [...prev.syncAccuracy.slice(-maxDataPoints + 1), { timestamp: now, value: newMetrics.syncAccuracy || 100 }],
      cpuUsage: [...prev.cpuUsage.slice(-maxDataPoints + 1), { timestamp: now, value: newMetrics.cpuUsage || 0 }]
    }))

    // Check for performance alerts
    checkPerformanceAlerts(newMetrics)
  }

  const checkPerformanceAlerts = (newMetrics: Partial<PerformanceMetrics>) => {
    const now = Date.now()
    
    if (newMetrics.avgLatency && newMetrics.avgLatency > 500) {
      addAlert({
        id: `latency_${now}`,
        level: 'warning',
        message: `High latency detected: ${newMetrics.avgLatency}ms`,
        timestamp: now
      })
    }
    
    if (newMetrics.syncAccuracy && newMetrics.syncAccuracy < 90) {
      addAlert({
        id: `sync_${now}`,
        level: 'error',
        message: `Poor sync accuracy: ${newMetrics.syncAccuracy}%`,
        timestamp: now
      })
    }
    
    if (newMetrics.cpuUsage && newMetrics.cpuUsage > 80) {
      addAlert({
        id: `cpu_${now}`,
        level: 'warning',
        message: `High CPU usage: ${newMetrics.cpuUsage}%`,
        timestamp: now
      })
    }
  }

  const addAlert = (alert: typeof alerts[0]) => {
    setAlerts(prev => [alert, ...prev.slice(0, 9)]) // Keep last 10 alerts
  }

  const getPerformanceStatus = () => {
    const { avgLatency, syncAccuracy, cpuUsage, memoryUsage } = metrics
    
    if (avgLatency > 500 || syncAccuracy < 85 || cpuUsage > 90 || memoryUsage > 90) {
      return { status: 'poor', color: 'text-red-600 bg-red-50 border-red-200' }
    }
    if (avgLatency > 200 || syncAccuracy < 95 || cpuUsage > 70 || memoryUsage > 70) {
      return { status: 'fair', color: 'text-yellow-600 bg-yellow-50 border-yellow-200' }
    }
    if (avgLatency > 100 || syncAccuracy < 98 || cpuUsage > 50 || memoryUsage > 50) {
      return { status: 'good', color: 'text-blue-600 bg-blue-50 border-blue-200' }
    }
    return { status: 'excellent', color: 'text-green-600 bg-green-50 border-green-200' }
  }

  const performanceStatus = getPerformanceStatus()

  return (
    <div className="space-y-6">
      {/* Overall Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5" />
            Real-time Performance Dashboard
            <Badge className={performanceStatus.color}>
              {performanceStatus.status.charAt(0).toUpperCase() + performanceStatus.status.slice(1)}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold">{metrics.socketConnections}</div>
              <div className="text-sm text-gray-600">Active Connections</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">{metrics.avgLatency}ms</div>
              <div className="text-sm text-gray-600">Avg Latency</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">{metrics.syncAccuracy}%</div>
              <div className="text-sm text-gray-600">Sync Accuracy</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">{metrics.eventsPerSecond}</div>
              <div className="text-sm text-gray-600">Events/sec</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Real-time Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        
        {/* Socket Performance */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Wifi className="w-4 h-4" />
              Socket Performance
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Latency</span>
                <span>{metrics.avgLatency}ms</span>
              </div>
              <Progress 
                value={(metrics.avgLatency / 500) * 100} 
                color={metrics.avgLatency > 200 ? "bg-red-500" : metrics.avgLatency > 100 ? "bg-yellow-500" : "bg-green-500"}
              />
            </div>
            
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Message Rate</span>
                <span>{metrics.messageRate}/s</span>
              </div>
              <Progress value={(metrics.messageRate / 100) * 100} />
            </div>
            
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Bandwidth</span>
                <span>{(metrics.bandwidthUsage / 1024).toFixed(1)}KB/s</span>
              </div>
              <Progress value={(metrics.bandwidthUsage / 10240) * 100} />
            </div>
          </CardContent>
        </Card>

        {/* Room Metrics */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Users className="w-4 h-4" />
              Room Activity
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-600">Active Rooms</span>
                <div className="text-lg font-bold">{metrics.activeRooms}</div>
              </div>
              <div>
                <span className="text-gray-600">Total Members</span>
                <div className="text-lg font-bold">{metrics.totalMembers}</div>
              </div>
              <div>
                <span className="text-gray-600">Sync Events</span>
                <div className="text-lg font-bold">{metrics.syncEvents}</div>
              </div>
              <div>
                <span className="text-gray-600">Conflicts</span>
                <div className="text-lg font-bold text-red-600">{metrics.conflictResolutions}</div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Healthy Connections</span>
                <span>{metrics.healthyConnections}/{metrics.socketConnections}</span>
              </div>
              <Progress 
                value={metrics.socketConnections > 0 ? (metrics.healthyConnections / metrics.socketConnections) * 100 : 100}
                color="bg-green-500"
              />
            </div>
          </CardContent>
        </Card>

        {/* Server Performance */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Server className="w-4 h-4" />
              Node.js Process
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>CPU Usage {metrics.isCpuSimulated ? '(simulated)' : ''}</span>
                <span>{metrics.cpuUsage}%</span>
              </div>
              <Progress 
                value={metrics.cpuUsage}
                color={metrics.cpuUsage > 80 ? "bg-red-500" : metrics.cpuUsage > 60 ? "bg-yellow-500" : "bg-green-500"}
              />
            </div>
            
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Heap Memory</span>
                <span>{metrics.memoryUsage}% ({metrics.heapUsed}/{metrics.heapTotal}MB)</span>
              </div>
              <Progress 
                value={metrics.memoryUsage}
                color={metrics.memoryUsage > 80 ? "bg-red-500" : metrics.memoryUsage > 60 ? "bg-yellow-500" : "bg-green-500"}
              />
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-600">Process RAM</span>
                <div className="text-lg font-bold">{metrics.rss}MB</div>
              </div>
              <div>
                <span className="text-gray-600">Cache Hit</span>
                <div className="text-lg font-bold">{metrics.cacheHitRatio}%</div>
              </div>
            </div>
            
            <div className="text-xs text-gray-500 bg-gray-50 p-2 rounded">
              💡 This shows Node.js process memory, not system RAM
            </div>
          </CardContent>
        </Card>

        {/* Sync Quality */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Zap className="w-4 h-4" />
              Sync Quality
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Accuracy</span>
                <span>{metrics.syncAccuracy}%</span>
              </div>
              <Progress 
                value={metrics.syncAccuracy}
                color={metrics.syncAccuracy > 95 ? "bg-green-500" : metrics.syncAccuracy > 85 ? "bg-yellow-500" : "bg-red-500"}
              />
            </div>
            
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Avg Drift</span>
                <span>{metrics.avgSyncDrift.toFixed(2)}s</span>
              </div>
              <Progress 
                value={Math.min((metrics.avgSyncDrift / 2) * 100, 100)}
                color={metrics.avgSyncDrift < 0.5 ? "bg-green-500" : metrics.avgSyncDrift < 1 ? "bg-yellow-500" : "bg-red-500"}
              />
            </div>

            <div className="text-sm">
              <span className="text-gray-600">Recovery Events: </span>
              <span className="font-bold">{metrics.recoveryEvents}</span>
            </div>
          </CardContent>
        </Card>

        {/* Performance Trends */}
        <Card className="md:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <TrendingUp className="w-4 h-4" />
              Performance Trends
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="h-20 bg-gray-50 rounded flex items-center justify-center">
                <div className="text-sm text-gray-600">
                  Latency Trend: {trends.latency.length > 0 && (
                    <span className="font-mono">
                      {trends.latency.slice(-5).map(t => `${t.value}ms`).join(' → ')}
                    </span>
                  )}
                </div>
              </div>
              
              <div className="grid grid-cols-3 gap-4 text-xs">
                <div className="text-center">
                  <div className="font-bold">Avg Latency</div>
                  <div>{trends.latency.length > 0 ? 
                    (trends.latency.reduce((sum, t) => sum + t.value, 0) / trends.latency.length).toFixed(0) : 0}ms
                  </div>
                </div>
                <div className="text-center">
                  <div className="font-bold">Peak Messages</div>
                  <div>{trends.messageRate.length > 0 ? 
                    Math.max(...trends.messageRate.map(t => t.value)) : 0}/s
                  </div>
                </div>
                <div className="text-center">
                  <div className="font-bold">Min Accuracy</div>
                  <div>{trends.syncAccuracy.length > 0 ? 
                    Math.min(...trends.syncAccuracy.map(t => t.value)).toFixed(1) : 100}%
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <AlertTriangle className="w-4 h-4" />
              Recent Alerts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-32 overflow-y-auto">
              {alerts.slice(0, 5).map((alert) => (
                <div 
                  key={alert.id} 
                  className={`flex items-center gap-2 p-2 rounded text-sm ${
                    alert.level === 'error' ? 'bg-red-50 text-red-800' :
                    alert.level === 'warning' ? 'bg-yellow-50 text-yellow-800' :
                    'bg-blue-50 text-blue-800'
                  }`}
                >
                  {alert.level === 'error' ? <AlertTriangle className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
                  <span>{alert.message}</span>
                  <span className="ml-auto text-xs opacity-60">
                    {new Date(alert.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}