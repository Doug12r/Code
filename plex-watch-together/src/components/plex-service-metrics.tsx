'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Activity, 
  Zap, 
  Database, 
  RefreshCw,
  TrendingUp,
  Clock
} from 'lucide-react';

interface PluginMetrics {
  totalRequests: number;
  cacheHits: number;
  cacheMisses: number;
  deduplicatedRequests: number;
  averageResponseTime: number;
  errorRate: number;
  cacheSize: number;
  activeRequests: number;
  cacheHitRate: number;
}

interface PluginInsights {
  performance: {
    status: string;
    responseTimeMs: number;
    errorRatePercent: number;
  };
  caching: {
    effectiveness: string;
    hitRatePercent: number;
    entriesStored: number;
    memorySaved: number;
  };
  deduplication: {
    requestsSaved: number;
    isEffective: boolean;
  };
}

export function PlexServiceMetrics() {
  const [metrics, setMetrics] = useState<PluginMetrics | null>(null);
  const [insights, setInsights] = useState<PluginInsights | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>('');

  const fetchMetrics = async () => {
    setIsLoading(true);
    setError('');

    try {
      const response = await fetch('/api/plex/v2/performance');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const data = await response.json();
      setMetrics(data.metrics);
      setInsights(data.insights);
    } catch (err) {
      console.error('Failed to fetch plugin metrics:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch metrics');
    } finally {
      setIsLoading(false);
    }
  };

  const clearCache = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/plex/v2/performance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'clearCache' })
      });
      
      if (response.ok) {
        await fetchMetrics(); // Refresh metrics
      }
    } catch (err) {
      console.error('Failed to clear cache:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
    
    // Auto-refresh every 15 seconds to show real-time performance
    const interval = setInterval(fetchMetrics, 15000);
    return () => clearInterval(interval);
  }, []);

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'excellent': return 'bg-green-100 text-green-800';
      case 'good': return 'bg-blue-100 text-blue-800';
      case 'needs attention': return 'bg-yellow-100 text-yellow-800';
      case 'poor': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-purple-600" />
          Plex Service Plugin
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchMetrics}
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </CardTitle>
        <CardDescription>
          Real-time performance monitoring with intelligent caching & deduplication
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="text-red-600 text-sm">
            Error: {error}
          </div>
        )}

        {metrics && insights && (
          <div className="space-y-4">
            {/* Performance Overview */}
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">{metrics.totalRequests}</div>
                <div className="text-xs text-muted-foreground">Total Requests</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">{insights.performance.responseTimeMs}ms</div>
                <div className="text-xs text-muted-foreground">Avg Response</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-600">{insights.caching.hitRatePercent}%</div>
                <div className="text-xs text-muted-foreground">Cache Hit Rate</div>
              </div>
            </div>

            {/* Status Badges */}
            <div className="flex flex-wrap gap-2">
              <Badge className={getStatusColor(insights.performance.status)}>
                Performance: {insights.performance.status}
              </Badge>
              <Badge className={getStatusColor(insights.caching.effectiveness)}>
                Caching: {insights.caching.effectiveness}
              </Badge>
              {insights.deduplication.isEffective && (
                <Badge className="bg-purple-100 text-purple-800">
                  Deduplication Active
                </Badge>
              )}
            </div>

            {/* Detailed Stats */}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Database className="h-4 w-4 text-blue-600" />
                  <span>Cache Performance</span>
                </div>
                <div className="pl-6 space-y-1 text-xs text-muted-foreground">
                  <div>Hits: {metrics.cacheHits} | Misses: {metrics.cacheMisses}</div>
                  <div>Entries Stored: {metrics.cacheSize}</div>
                  <div>API Calls Saved: {insights.caching.memorySaved}</div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-green-600" />
                  <span>Smart Features</span>
                </div>
                <div className="pl-6 space-y-1 text-xs text-muted-foreground">
                  <div>Deduplicated: {metrics.deduplicatedRequests}</div>
                  <div>Active Requests: {metrics.activeRequests}</div>
                  <div>Error Rate: {insights.performance.errorRatePercent}%</div>
                </div>
              </div>
            </div>

            {/* Impact Summary */}
            <div className="border-t pt-3">
              <div className="text-sm font-medium mb-2 flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Performance Impact
              </div>
              <div className="text-xs text-muted-foreground space-y-1">
                <div>• Avoided {insights.caching.memorySaved} redundant API calls through caching</div>
                <div>• Prevented {metrics.deduplicatedRequests} duplicate requests in flight</div>
                <div>• Average response time: {insights.performance.responseTimeMs}ms</div>
                {insights.caching.hitRatePercent > 50 && (
                  <div className="text-green-600">• Excellent cache utilization reducing server load!</div>
                )}
              </div>
            </div>

            {/* Controls */}
            <div className="flex gap-2 pt-2 border-t">
              <Button
                variant="outline"
                size="sm"
                onClick={clearCache}
                disabled={isLoading}
              >
                <Database className="h-3 w-3 mr-1" />
                Clear Cache
              </Button>
              <div className="flex-1" />
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Auto-refresh: 15s
              </div>
            </div>
          </div>
        )}

        {isLoading && !metrics && (
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">Loading metrics...</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}