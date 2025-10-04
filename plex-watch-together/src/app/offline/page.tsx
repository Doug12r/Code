'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { 
  WifiOff, 
  RefreshCw, 
  Play, 
  Download, 
  Smartphone,
  CheckCircle,
  AlertCircle
} from 'lucide-react'
import { useEffect } from 'react'

export default function OfflinePage() {
  useEffect(() => {
    // Auto-reload when connection is restored
    function checkOnlineStatus() {
      if (navigator.onLine) {
        window.location.reload();
      }
    }
    
    window.addEventListener('online', checkOnlineStatus);
    
    // Periodic check every 10 seconds
    const interval = setInterval(() => {
      if (navigator.onLine) {
        fetch('/', { method: 'HEAD', cache: 'no-cache' })
          .then(() => window.location.reload())
          .catch(() => {});
      }
    }, 10000);
    
    return () => {
      window.removeEventListener('online', checkOnlineStatus);
      clearInterval(interval);
    };
  }, []);
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-2xl w-full space-y-6">
        {/* Main offline card */}
        <Card className="text-center">
          <CardHeader className="pb-6">
            <div className="w-16 h-16 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <WifiOff className="w-8 h-8" />
            </div>
            <CardTitle className="text-2xl">You're Offline</CardTitle>
            <CardDescription className="text-base">
              No internet connection detected. Don't worry - you can still access some features!
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Connection status */}
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 bg-orange-500 rounded-full animate-pulse"></div>
                <span className="text-orange-800 font-medium">
                  Waiting for connection...
                </span>
              </div>
              <p className="text-sm text-orange-700 mt-2">
                We'll automatically reconnect when your internet is back.
              </p>
            </div>

            {/* Retry button */}
            <Button 
              onClick={() => window.location.reload()} 
              className="w-full gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Try Again
            </Button>
          </CardContent>
        </Card>

        {/* Available features */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-600" />
              Available Offline
            </CardTitle>
            <CardDescription>
              These features work without an internet connection
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4">
              <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg">
                <Download className="w-5 h-5 text-green-600" />
                <div>
                  <p className="font-medium text-green-900">Cached Media</p>
                  <p className="text-sm text-green-700">
                    Continue watching previously loaded content
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg">
                <Play className="w-5 h-5 text-blue-600" />
                <div>
                  <p className="font-medium text-blue-900">Local Playback</p>
                  <p className="text-sm text-blue-700">
                    Media stored in your browser cache
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 p-3 bg-purple-50 rounded-lg">
                <Smartphone className="w-5 h-5 text-purple-600" />
                <div>
                  <p className="font-medium text-purple-900">App Interface</p>
                  <p className="text-sm text-purple-700">
                    Browse cached rooms and settings
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Limited features */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-amber-600" />
              Limited While Offline
            </CardTitle>
            <CardDescription>
              These features require an internet connection
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 text-sm text-gray-600">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-gray-400 rounded-full"></div>
                <span>Creating new watch rooms</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-gray-400 rounded-full"></div>
                <span>Real-time synchronization with friends</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-gray-400 rounded-full"></div>
                <span>Loading new media from Plex server</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-gray-400 rounded-full"></div>
                <span>Chat and messaging</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tips for better offline experience */}
        <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
          <CardHeader>
            <CardTitle className="text-blue-900">💡 Pro Tips for Offline Use</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="space-y-2">
              <p className="text-blue-800">
                <strong>Preload content:</strong> Open media while online to cache it for offline viewing
              </p>
              <p className="text-blue-800">
                <strong>Check connection:</strong> We'll automatically sync your actions when you're back online
              </p>
              <p className="text-blue-800">
                <strong>Mobile data:</strong> Consider enabling mobile data or finding a Wi-Fi connection
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="text-center text-sm text-gray-500">
          <p>Your offline actions will be synced automatically when you reconnect</p>
        </div>
      </div>
    </div>
  )
}