'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Activity, 
  CheckCircle, 
  XCircle, 
  AlertTriangle,
  RefreshCw,
  Wifi
} from 'lucide-react';

interface ConnectionHealthData {
  connectionHealth: {
    successCount: number;
    failureCount: number;
    averageLatency: number;
    lastSuccessTime: number;
    consecutiveFailures: number;
    healthScore: number;
    status: string;
  };
  lastTest: {
    success: boolean;
    latency?: number;
    attempt?: number;
    error?: string;
  };
  recommendations: string[];
  timestamp: string;
}

export function NetworkHealthMonitor() {
  const [healthData, setHealthData] = useState<ConnectionHealthData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>('');

  const fetchHealthData = async () => {
    setIsLoading(true);
    setError('');

    try {
      const response = await fetch('/api/plex/health');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const data = await response.json();
      setHealthData(data);
    } catch (err) {
      console.error('Health check failed:', err);
      setError(err instanceof Error ? err.message : 'Health check failed');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchHealthData();
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchHealthData, 30000);
    return () => clearInterval(interval);
  }, []);

  const getHealthIcon = (status: string) => {
    switch (status.toLowerCase()) {
      case 'excellent':
        return <CheckCircle className="h-5 w-5 text-green-600" />;
      case 'good':
        return <CheckCircle className="h-5 w-5 text-blue-600" />;
      case 'fair':
        return <AlertTriangle className="h-5 w-5 text-yellow-600" />;
      case 'poor':
      case 'critical':
        return <XCircle className="h-5 w-5 text-red-600" />;
      default:
        return <Activity className="h-5 w-5 text-gray-600" />;
    }
  };

  const getHealthColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'excellent': return 'bg-green-100 text-green-800 border-green-200';
      case 'good': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'fair': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'poor': return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'critical': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const formatLatency = (latency?: number) => {
    if (!latency) return 'N/A';
    return `${latency}ms`;
  };

  const formatTime = (timestamp: number) => {
    if (timestamp === 0) return 'Never';
    return new Date(timestamp).toLocaleTimeString();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wifi className="h-5 w-5" />
          Network Health Monitor
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchHealthData}
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </CardTitle>
        <CardDescription>
          Real-time monitoring of Plex server connectivity
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="text-red-600 text-sm">
            Error: {error}
          </div>
        )}

        {healthData && (
          <div className="space-y-4">
            {/* Overall Health Status */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {getHealthIcon(healthData.connectionHealth.status)}
                <div>
                  <div className="font-semibold">{healthData.connectionHealth.status}</div>
                  <div className="text-sm text-muted-foreground">
                    Health Score: {healthData.connectionHealth.healthScore}/100
                  </div>
                </div>
              </div>
              <Badge 
                variant="outline" 
                className={getHealthColor(healthData.connectionHealth.status)}
              >
                {healthData.connectionHealth.status}
              </Badge>
            </div>

            {/* Statistics */}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="font-medium text-green-600">
                  ✅ Successful: {healthData.connectionHealth.successCount}
                </div>
                <div className="text-muted-foreground">
                  Avg Latency: {formatLatency(healthData.connectionHealth.averageLatency)}
                </div>
              </div>
              <div>
                <div className="font-medium text-red-600">
                  ❌ Failed: {healthData.connectionHealth.failureCount}
                </div>
                <div className="text-muted-foreground">
                  Consecutive: {healthData.connectionHealth.consecutiveFailures}
                </div>
              </div>
            </div>

            {/* Last Test Results */}
            <div className="border-t pt-3">
              <div className="text-sm font-medium mb-2">Latest Test</div>
              <div className="flex items-center gap-2 text-sm">
                {healthData.lastTest.success ? (
                  <CheckCircle className="h-4 w-4 text-green-600" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-600" />
                )}
                <span>
                  {healthData.lastTest.success ? 'Success' : 'Failed'}
                  {healthData.lastTest.latency && ` (${healthData.lastTest.latency}ms)`}
                  {healthData.lastTest.attempt && ` - attempt ${healthData.lastTest.attempt}`}
                </span>
              </div>
              {healthData.lastTest.error && (
                <div className="text-xs text-red-600 mt-1">
                  {healthData.lastTest.error}
                </div>
              )}
            </div>

            {/* Recommendations */}
            {healthData.recommendations.length > 0 && (
              <div className="border-t pt-3">
                <div className="text-sm font-medium mb-2">💡 Recommendations</div>
                <ul className="space-y-1 text-xs text-muted-foreground">
                  {healthData.recommendations.map((rec, index) => (
                    <li key={index} className="flex items-start gap-1">
                      <span>•</span>
                      <span>{rec}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Timestamp */}
            <div className="text-xs text-muted-foreground text-center border-t pt-2">
              Last updated: {new Date(healthData.timestamp).toLocaleString()}
            </div>
          </div>
        )}

        {isLoading && !healthData && (
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">Loading health data...</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}