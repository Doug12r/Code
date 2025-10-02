'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { 
  ServerIcon, 
  CheckCircleIcon, 
  AlertCircleIcon, 
  ExternalLinkIcon,
  RefreshCwIcon
} from 'lucide-react'
import { toast } from 'sonner'

interface PlexSetupModalProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  onPlexConnected: () => void
}

export function PlexSetupModal({ isOpen, onOpenChange, onPlexConnected }: PlexSetupModalProps) {
  // 🚀 Smart defaults: localhost for development, reverse proxy for production
  const [serverUrl, setServerUrl] = useState(
    process.env.NODE_ENV === 'development' 
      ? 'http://localhost:32400' 
      : 'https://douglinux.duckdns.org:443'
  )
  const [claimToken, setClaimToken] = useState('')
  const [isConnecting, setIsConnecting] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle')
  const [plexStatus, setPlexStatus] = useState<any>(null)
  const [isLoadingStatus, setIsLoadingStatus] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [testResults, setTestResults] = useState<any>(null)
  const [useManualToken, setUseManualToken] = useState(false)
  const [manualToken, setManualToken] = useState('')

  useEffect(() => {
    if (isOpen) {
      checkPlexStatus()
    }
  }, [isOpen])

  const checkPlexStatus = async () => {
    setIsLoadingStatus(true)
    try {
      const response = await fetch('/api/plex/setup')
      const data = await response.json()
      setPlexStatus(data)
    } catch (error) {
      console.error('Failed to check Plex status:', error)
    } finally {
      setIsLoadingStatus(false)
    }
  }

  const testConnection = async () => {
    if (!serverUrl.trim()) {
      toast.error('Please enter a server URL first')
      return
    }

    setIsTesting(true)
    setTestResults(null)
    
    try {
      const response = await fetch('/api/plex/test-connection', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ serverUrl })
      })

      const data = await response.json()
      setTestResults(data.results)
      
      const accessibleUrls = data.results.filter((r: any) => r.accessible)
      if (accessibleUrls.length > 0) {
        toast.success(`Found ${accessibleUrls.length} accessible endpoint(s)`)
      } else {
        toast.error('No accessible endpoints found')
      }
    } catch (error) {
      console.error('Connection test failed:', error)
      toast.error('Connection test failed')
    } finally {
      setIsTesting(false)
    }
  }

    const handleSetupPlex = async () => {
    if (!serverUrl.trim()) {
      toast.error('Please enter a server URL')
      return
    }

    if (useManualToken) {
      if (!manualToken.trim()) {
        toast.error('Please enter your Plex token')
        return
      }
    } else {
      if (!claimToken.trim()) {
        toast.error('Please enter a claim token')
        return
      }
    }

    setIsConnecting(true)
    setConnectionStatus('testing')

    try {
      const requestBody: any = {
        serverUrl: serverUrl.trim()
      }

      if (useManualToken) {
        requestBody.manualToken = manualToken.trim()
      } else {
        requestBody.claimToken = claimToken.trim()
      }

      const response = await fetch('/api/plex/setup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      })

      const data = await response.json()

      if (response.ok) {
        setConnectionStatus('success')
        toast.success('Plex server connected successfully!')
        // Clear sensitive data
        setClaimToken('')
        setManualToken('')
        checkPlexStatus() // Refresh status
        onPlexConnected() // Notify parent
        
        // Auto close after success
        setTimeout(() => {
          onOpenChange(false)
        }, 2000)
      } else {
        setConnectionStatus('error')
        toast.error(data.error || 'Failed to connect to Plex server')
      }
    } catch (error) {
      setConnectionStatus('error')
      toast.error('Failed to connect to Plex server')
      console.error('Plex connection error:', error)
    } finally {
      setIsConnecting(false)
    }
  }

  const generateNewClaimToken = () => {
    window.open('https://plex.tv/claim', '_blank')
    toast.info('Get your claim token from the opened page and paste it here')
  }

  const testAlternativeUrl = () => {
    const currentUrl = serverUrl
    // 🌐 Smart URL cycling: localhost → https → http
    if (currentUrl.includes('localhost:32400')) {
      setServerUrl('https://douglinux.duckdns.org:443')
      toast.info('Switched to HTTPS reverse proxy')
    } else if (currentUrl.includes('https://douglinux.duckdns.org:443')) {
      setServerUrl('http://douglinux.duckdns.org:80')
      toast.info('Switched to HTTP reverse proxy')
    } else {
      setServerUrl('http://localhost:32400')
      toast.info('Switched to localhost (fastest)')
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <ServerIcon className="h-5 w-5" />
            <span>Connect Plex Server</span>
          </DialogTitle>
          <DialogDescription>
            Connect your Plex server to browse and stream your media library
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          
          {/* Current Status */}
          {!isLoadingStatus && plexStatus && (
            <Card className={plexStatus.connected ? 'border-green-200 bg-green-50' : 'border-orange-200 bg-orange-50'}>
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    {plexStatus.connected ? (
                      <CheckCircleIcon className="h-5 w-5 text-green-600" />
                    ) : (
                      <AlertCircleIcon className="h-5 w-5 text-orange-600" />
                    )}
                    <span className="font-medium">
                      {plexStatus.connected ? 'Connected' : 'Not Connected'}
                    </span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={checkPlexStatus}
                    disabled={isLoadingStatus}
                  >
                    <RefreshCwIcon className="h-4 w-4 mr-1" />
                    Refresh
                  </Button>
                </div>
                
                {plexStatus.connected && plexStatus.server && (
                  <div className="mt-3 space-y-2 text-sm">
                    <p><strong>Server:</strong> {plexStatus.server.url}</p>
                    <p><strong>User:</strong> {plexStatus.server.username}</p>
                    <p><strong>Libraries:</strong> {plexStatus.server.libraries} ({plexStatus.server.libraryTypes.join(', ')})</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Setup Form */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="server-url">Plex Server URL</Label>
              <div className="space-y-2">
                <Input
                  id="server-url"
                  value={serverUrl}
                  onChange={(e) => setServerUrl(e.target.value)}
                  placeholder="https://your-plex-server:32400"
                />
                
                {/* Quick Preset Buttons */}
                <div className="flex flex-wrap gap-2 text-xs">
                  <Button
                    variant={serverUrl.includes('localhost') ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => {
                      setServerUrl('http://localhost:32400')
                      toast.success('Set to localhost - fastest for development!')
                    }}
                    type="button"
                  >
                    🚀 Localhost
                  </Button>
                  <Button
                    variant={serverUrl.includes('https://douglinux') ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => {
                      setServerUrl('https://douglinux.duckdns.org:443')
                      toast.info('Set to HTTPS reverse proxy')
                    }}
                    type="button"
                  >
                    🔒 HTTPS
                  </Button>
                  <Button
                    variant={serverUrl.includes('http://douglinux') ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => {
                      setServerUrl('http://douglinux.duckdns.org:80')
                      toast.info('Set to HTTP reverse proxy')
                    }}
                    type="button"
                  >
                    🌐 HTTP
                  </Button>
                </div>
                
                <div className="flex space-x-2">
                  <Button
                    variant="outline"
                    onClick={testConnection}
                    disabled={isTesting || !serverUrl.trim()}
                    type="button"
                    className="flex-1"
                  >
                    {isTesting ? (
                      <>
                        <RefreshCwIcon className="h-4 w-4 mr-2 animate-spin" />
                        Testing...
                      </>
                    ) : (
                      'Test Connection'
                    )}
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                🚀 <strong>Localhost (recommended for development)</strong> - Direct connection to local Plex server for fastest performance. Click "Switch URL" to cycle between options.
              </p>
              
              {/* Connection Test Results */}
              {testResults && (
                <div className="mt-3 p-3 border rounded-lg bg-muted/50">
                  <h4 className="text-sm font-medium mb-2">Connection Test Results:</h4>
                  <div className="space-y-1">
                    {testResults.map((result: any, index: number) => (
                      <div key={index} className="flex items-center justify-between text-sm">
                        <span className="font-mono text-xs">{result.url}</span>
                        <div className="flex items-center space-x-2">
                          {result.accessible ? (
                            <CheckCircleIcon className="h-4 w-4 text-green-600" />
                          ) : (
                            <AlertCircleIcon className="h-4 w-4 text-red-600" />
                          )}
                          <span className={result.accessible ? 'text-green-600' : 'text-red-600'}>
                            {result.message}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Authentication Method Toggle */}
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="use-manual-token"
                  checked={useManualToken}
                  onChange={(e) => setUseManualToken(e.target.checked)}
                  className="rounded border-gray-300"
                />
                <Label htmlFor="use-manual-token" className="text-sm">
                  Use manual Plex token (for connection issues)
                </Label>
              </div>

              {useManualToken ? (
                <div className="space-y-2">
                  <Label htmlFor="manual-token">Manual Plex Token</Label>
                  <Input
                    id="manual-token"
                    value={manualToken}
                    onChange={(e) => setManualToken(e.target.value)}
                    placeholder="Your Plex authentication token"
                    type="password"
                  />
                  <div className="text-xs text-muted-foreground space-y-1">
                    <p>🔧 Use this if claim tokens keep failing due to network issues.</p>
                    <p>Find your token in Plex settings or browser network requests.</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="claim-token">Plex Claim Token</Label>
                  <div className="flex space-x-2">
                    <Input
                      id="claim-token"
                      value={claimToken}
                      onChange={(e) => setClaimToken(e.target.value)}
                      placeholder="claim-xxxxxxxxx"
                      type="password"
                    />
                    <Button
                      variant="outline"
                      onClick={generateNewClaimToken}
                      type="button"
                    >
                      <ExternalLinkIcon className="h-4 w-4 mr-1" />
                      Get Token
                    </Button>
                  </div>
                  <div className="text-xs text-muted-foreground space-y-1">
                    <p>⚠️ Claim tokens expire in 4 minutes. Get a new one if you see a 403 error.</p>
                    <p>💡 Visit <a href="https://plex.tv/claim" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">plex.tv/claim</a> to get a fresh token.</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Connection Status */}
          {connectionStatus !== 'idle' && (
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center space-x-2">
                  {connectionStatus === 'testing' && (
                    <>
                      <RefreshCwIcon className="h-4 w-4 animate-spin text-blue-600" />
                      <span>Testing connection...</span>
                    </>
                  )}
                  {connectionStatus === 'success' && (
                    <>
                      <CheckCircleIcon className="h-4 w-4 text-green-600" />
                      <span className="text-green-600">Successfully connected!</span>
                    </>
                  )}
                  {connectionStatus === 'error' && (
                    <>
                      <AlertCircleIcon className="h-4 w-4 text-red-600" />
                      <span className="text-red-600">Connection failed</span>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          <Separator />

          {/* Help Instructions */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Setup Instructions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="space-y-1">
                <p className="font-medium">1. Get Claim Token:</p>
                <p className="text-muted-foreground">
                  Click "Get Token" to visit plex.tv/claim and copy the token
                </p>
              </div>
              <div className="space-y-1">
                <p className="font-medium">2. Server URL:</p>
                <p className="text-muted-foreground">
                  🚀 <strong>Localhost</strong>: Ultra-fast direct connection (recommended for testing)<br />
                  🔒 <strong>HTTPS</strong>: Secure reverse proxy connection<br />
                  🌐 <strong>HTTP</strong>: Alternative reverse proxy if HTTPS fails
                </p>
              </div>
              <div className="space-y-1">
                <p className="font-medium">3. Connect:</p>
                <p className="text-muted-foreground">
                  Click "Connect to Plex" to authenticate and test the connection
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Action Buttons */}
          <div className="flex space-x-2 justify-end">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleSetupPlex} 
              disabled={isConnecting || !serverUrl.trim() || (useManualToken ? !manualToken.trim() : !claimToken.trim())}
            >
              {isConnecting ? (
                <>
                  <RefreshCwIcon className="h-4 w-4 mr-2 animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <ServerIcon className="h-4 w-4 mr-2" />
                  Connect to Plex
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}