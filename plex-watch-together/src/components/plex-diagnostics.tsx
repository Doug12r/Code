'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { 
  CheckCircle, 
  XCircle, 
  Clock, 
  Wifi, 
  AlertCircle,
  RefreshCw,
  Server,
  Network
} from 'lucide-react';

interface ConnectionResult {
  url: string;
  success: boolean;
  latency?: number;
  error?: string;
  serverInfo?: {
    name: string;
    version: string;
    machineIdentifier: string;
  };
}

interface TestResults {
  results: ConnectionResult[];
  recommendation: {
    message: string;
    bestUrl?: string;
    latency?: number;
    suggestions?: string[];
  };
}

export function PlexDiagnostics() {
  const [testResults, setTestResults] = useState<TestResults | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>('');

  const runDiagnostics = async () => {
    setIsLoading(true);
    setTestResults(null);
    setError('');

    try {
      console.log('Starting comprehensive diagnostics...');
      
      const response = await fetch('/api/plex/network-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseUrl: 'https://douglinux.duckdns.org:443' }),
      });

      const data = await response.json();
      
      if (data.results) {
        setTestResults({
          results: data.results,
          recommendation: {
            message: data.recommendations?.[0] || 'Connection test completed',
            bestUrl: data.results.find((r: ConnectionResult) => r.success)?.url,
            latency: data.results.find((r: ConnectionResult) => r.success)?.latency,
            suggestions: data.recommendations || []
          }
        });
      } else {
        throw new Error('No test results received');
      }
    } catch (err) {
      console.error('Diagnostics failed:', err);
      setError(err instanceof Error ? err.message : 'Diagnostic test failed');
    } finally {
      setIsLoading(false);
    }
  }

  const runSimpleTest = async () => {
    setIsLoading(true);
    setTestResults(null);
    setError('');

    try {
      console.log('Running simple connection test...');
      
      const response = await fetch('/api/plex/simple-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          url: 'https://douglinux.duckdns.org:443',
          timeout: 15000
        }),
      });

      const data = await response.json();
      
      // Convert simple test result to match our interface
      const result: ConnectionResult = {
        url: 'https://douglinux.duckdns.org:443',
        success: data.success,
        latency: data.latency,
        error: data.error
      };

      setTestResults({
        results: [result],
        recommendation: {
          message: data.success 
            ? `✅ Simple test successful! Server is reachable in ${data.latency}ms`
            : `❌ Simple test failed: ${data.error}`,
          bestUrl: data.success ? result.url : undefined,
          latency: data.latency,
          suggestions: data.success ? [] : [
            'Check if Plex server is running',
            'Verify network connectivity',
            'Check firewall settings'
          ]
        }
      });
    } catch (err) {
      console.error('Simple test failed:', err);
      setError(err instanceof Error ? err.message : 'Simple test failed');
    } finally {
      setIsLoading(false);
    }
  };

  const formatLatency = (latency?: number) => {
    if (!latency) return 'N/A';
    if (latency < 100) return `${latency}ms (Excellent)`;
    if (latency < 300) return `${latency}ms (Good)`;
    if (latency < 1000) return `${latency}ms (Fair)`;
    return `${latency}ms (Slow)`;
  };

  const getStatusIcon = (success: boolean, latency?: number) => {
    if (!success) return <XCircle className="h-5 w-5 text-destructive" />;
    if (latency && latency < 300) return <CheckCircle className="h-5 w-5 text-green-600" />;
    return <CheckCircle className="h-5 w-5 text-yellow-600" />;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Network className="h-5 w-5" />
          Plex Connection Diagnostics
        </CardTitle>
        <CardDescription>
          Test your Plex server connectivity and diagnose network issues
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <Button 
            onClick={runSimpleTest} 
            disabled={isLoading}
            variant="outline"
          >
            {isLoading ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Testing...
              </>
            ) : (
              <>
                <Clock className="h-4 w-4 mr-2" />
                Quick Test
              </>
            )}
          </Button>
          
          <Button 
            onClick={runDiagnostics} 
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Running...
              </>
            ) : (
              <>
                <Wifi className="h-4 w-4 mr-2" />
                Full Diagnostics
              </>
            )}
          </Button>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Diagnostic Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {testResults && (
          <div className="space-y-4">
            {/* Overall Status */}
            <Alert variant={testResults.recommendation.bestUrl ? "default" : "destructive"}>
              <Server className="h-4 w-4" />
              <AlertTitle>Connection Status</AlertTitle>
              <AlertDescription>{testResults.recommendation.message}</AlertDescription>
            </Alert>

            {/* Best Connection Info */}
            {testResults.recommendation.bestUrl && (
              <Card className="bg-green-50 border-green-200">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm text-green-800">✅ Recommended Connection</CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="space-y-2 text-sm">
                    <div><strong>URL:</strong> {testResults.recommendation.bestUrl}</div>
                    {testResults.recommendation.latency && (
                      <div><strong>Latency:</strong> {formatLatency(testResults.recommendation.latency)}</div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Detailed Results */}
            <div className="space-y-3">
              <h4 className="font-semibold text-sm">Connection Test Results</h4>
              {testResults.results.map((result, index) => (
                <Card key={index} className="p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(result.success, result.latency)}
                      <code className="text-sm font-mono bg-muted px-2 py-1 rounded">
                        {result.url}
                      </code>
                    </div>
                    <Badge variant={result.success ? "default" : "destructive"}>
                      {result.success ? "Success" : "Failed"}
                    </Badge>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 text-xs text-muted-foreground">
                    <div>
                      <strong>Latency:</strong> {formatLatency(result.latency)}
                    </div>
                    {result.serverInfo && (
                      <div>
                        <strong>Server:</strong> {result.serverInfo.name}
                      </div>
                    )}
                  </div>
                  
                  {result.error && (
                    <div className="mt-2 text-xs text-destructive bg-destructive/10 p-2 rounded">
                      <strong>Error:</strong> {result.error}
                    </div>
                  )}
                  
                  {result.serverInfo && (
                    <div className="mt-2 text-xs text-muted-foreground">
                      <strong>Version:</strong> {result.serverInfo.version} | 
                      <strong> ID:</strong> {result.serverInfo.machineIdentifier.slice(0, 8)}...
                    </div>
                  )}
                </Card>
              ))}
            </div>

            {/* DNS Issues Notice */}
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Common Network Issues</AlertTitle>
              <AlertDescription>
                <div className="space-y-2 text-sm">
                  <p><strong>EAI_AGAIN errors:</strong> DNS resolution failures, often due to DuckDNS service issues</p>
                  <p><strong>Connection timeouts:</strong> Server may be overloaded or network connectivity is poor</p>
                  <p><strong>Quick fixes:</strong> Try refreshing the page, check DuckDNS status, or restart your router</p>
                </div>
              </AlertDescription>
            </Alert>

            {/* Troubleshooting Suggestions */}
            {testResults.recommendation.suggestions && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">🔧 Troubleshooting Suggestions</CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <ul className="space-y-1 text-sm text-muted-foreground">
                    {testResults.recommendation.suggestions.map((suggestion, index) => (
                      <li key={index} className="flex items-start gap-2">
                        <span className="text-primary">•</span>
                        {suggestion}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}