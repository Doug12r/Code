/**
 * Enhanced Plex Setup Component
 * Provides automatic server discovery and easy connection setup
 */

'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, CheckCircle, XCircle, Globe, Shield, Zap, ExternalLink } from 'lucide-react'

interface PlexConnection {
  connected: boolean
  status: string
  connection?: {
    url: string
    username?: string
    serverId?: string
    libraryCount: number
    libraries: Array<{ key: string; title: string; type: string }>
  }
  message: string
  setupUrl?: string
  error?: string
}

interface PlexServer {
  url: string
  name: string
  reachable: boolean
  local: boolean
  https: boolean
}

export function EnhancedPlexSetup() {
  const [connectionStatus, setConnectionStatus] = useState<PlexConnection | null>(null)
  const [discoveredServers, setDiscoveredServers] = useState<PlexServer[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isConnecting, setIsConnecting] = useState(false)
  const [claimToken, setClaimToken] = useState<string>('')
  const [showClaimInput, setShowClaimInput] = useState<boolean>(false)

  // Check current connection status
  useEffect(() => {
    checkConnection()
  }, [])

  const checkConnection = async () => {
    setIsLoading(true)
    try {
      const response = await fetch('/api/plex/connection')
      const data = await response.json()
      setConnectionStatus(data)
    } catch (error) {
      console.error('Failed to check connection:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const openClaimPage = () => {
    window.open('https://plex.tv/claim', '_blank', 'width=600,height=700,scrollbars=yes,resizable=yes')
    setShowClaimInput(true)
  }

  const connectWithPlex = async () => {
    if (!claimToken.trim()) {
      alert('Please enter a claim token first. Click "Get Claim Token" to get one from Plex.')
      return
    }

    if (!claimToken.startsWith('claim-')) {
      alert('Please enter a valid claim token. It should start with "claim-" followed by a long string.')
      return
    }

    setIsConnecting(true)
    try {
      const response = await fetch('/api/plex/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          claimToken: claimToken.trim(),
          serverUrl: 'auto' // Auto-discover Plex server
        })
      })

      if (response.ok) {
        await checkConnection()
        setShowClaimInput(false)
        setClaimToken('')
        alert('Successfully connected to Plex!')
      } else {
        const errorData = await response.json()
        let errorMessage = errorData.error || 'Setup failed'
        
        if (errorMessage.includes('claim')) {
          errorMessage = 'Invalid or expired claim token. Please get a new one from plex.tv/claim'
        }
        
        alert(errorMessage)
      }
    } catch (error) {
      console.error('Connection failed:', error)
      alert('Connection failed: ' + (error instanceof Error ? error.message : 'Unknown error'))
    } finally {
      setIsConnecting(false)
    }
  }

  const disconnectPlex = async () => {
    try {
      await fetch('/api/plex/connection', { method: 'DELETE' })
      await checkConnection()
    } catch (error) {
      console.error('Failed to disconnect:', error)
    }
  }

  if (isLoading) {
    return (
      <Card className="w-full max-w-2xl mx-auto">
        <CardContent className="flex items-center justify-center p-8">
          <Loader2 className="h-8 w-8 animate-spin mr-3" />
          <span>Checking Plex connection...</span>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6 w-full max-w-2xl mx-auto">
      {/* Connection Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Plex Connection Status
          </CardTitle>
          <CardDescription>
            Manage your Plex Media Server connection
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {connectionStatus?.connected ? (
            <div className="space-y-4">
              <Alert className="border-green-200 bg-green-50">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-800">
                  {connectionStatus.message}
                </AlertDescription>
              </Alert>
              
              {connectionStatus.connection && (
                <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg">
                  <div>
                    <p className="text-sm font-medium">Server URL</p>
                    <p className="text-sm text-gray-600">{connectionStatus.connection.url}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium">Username</p>
                    <p className="text-sm text-gray-600">{connectionStatus.connection.username || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium">Libraries</p>
                    <p className="text-sm text-gray-600">{connectionStatus.connection.libraryCount} found</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium">Status</p>
                    <Badge variant="secondary" className="bg-green-100 text-green-800">
                      Connected
                    </Badge>
                  </div>
                </div>
              )}
              
              {connectionStatus.connection?.libraries && connectionStatus.connection.libraries.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-2">Available Libraries</p>
                  <div className="flex flex-wrap gap-2">
                    {connectionStatus.connection.libraries.map((lib) => (
                      <Badge key={lib.key} variant="outline">
                        {lib.title} ({lib.type})
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <Button onClick={checkConnection} variant="outline" size="sm">
                  Refresh Status
                </Button>
                <Button onClick={disconnectPlex} variant="destructive" size="sm">
                  Disconnect
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <Alert className="border-orange-200 bg-orange-50">
                <XCircle className="h-4 w-4 text-orange-600" />
                <AlertDescription className="text-orange-800">
                  {connectionStatus?.message || 'Plex not connected'}
                </AlertDescription>
              </Alert>

              <div className="space-y-3">
                <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg">
                  <Shield className="h-4 w-4 text-blue-600" />
                  <span className="text-sm text-blue-800">
                    Easy one-click setup with automatic server discovery
                  </span>
                </div>
                
                <div className="flex items-center gap-2 p-3 bg-green-50 rounded-lg">
                  <Zap className="h-4 w-4 text-green-600" />
                  <span className="text-sm text-green-800">
                    Secure authentication with encrypted token storage
                  </span>
                </div>
              </div>

              {!showClaimInput ? (
                <Button 
                  onClick={openClaimPage} 
                  disabled={isConnecting}
                  className="w-full"
                  size="lg"
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Get Claim Token from Plex
                </Button>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="claimToken">Claim Token</Label>
                    <Input
                      id="claimToken"
                      placeholder="claim-DiiXvRb1nmxafwG7o9WV"
                      value={claimToken}
                      onChange={(e) => setClaimToken(e.target.value)}
                      className="font-mono text-sm"
                    />
                    <p className="text-sm text-gray-600">
                      Copy the full claim code from the Plex page (starts with "claim-")
                    </p>
                  </div>
                  
                  <div className="flex gap-2">
                    <Button 
                      onClick={connectWithPlex} 
                      disabled={isConnecting || !claimToken.trim() || !claimToken.startsWith('claim-')}
                      className="flex-1"
                    >
                      {isConnecting ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          Connecting...
                        </>
                      ) : (
                        'Connect to Plex'
                      )}
                    </Button>
                    
                    <Button 
                      onClick={() => {
                        setShowClaimInput(false)
                        setClaimToken('')
                      }}
                      variant="outline"
                      disabled={isConnecting}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}

              {isConnecting && (
                <Alert>
                  <AlertDescription>
                    Connecting to your Plex server. This may take a moment...
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Help Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">How It Works</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-gray-600">
          <div className="flex gap-3">
            <div className="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xs font-bold">1</div>
            <p>Click "Get Claim Token from Plex" to open the Plex authorization page</p>
          </div>
          <div className="flex gap-3">
            <div className="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xs font-bold">2</div>
            <p>Sign in to your Plex account and copy the full claim code (starts with "claim-")</p>
          </div>
          <div className="flex gap-3">
            <div className="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xs font-bold">3</div>
            <p>Return here, paste the complete claim code, and click "Connect to Plex"</p>
          </div>
          <div className="flex gap-3">
            <div className="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xs font-bold">4</div>
            <p>The app will automatically discover your server and set up the connection</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}