'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Navigation } from '@/components/navigation'
import MediaLibrary from '@/components/media-library'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ServerIcon, SettingsIcon, PlayIcon, PlusIcon } from 'lucide-react'
import { toast } from 'sonner'
import { EnhancedPlexSetup } from '@/components/enhanced-plex-setup'

export default function LibraryPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const [plexStatus, setPlexStatus] = useState<any>(null)
  const [selectedMedia, setSelectedMedia] = useState<any>(null)
  const [showPlexSetup, setShowPlexSetup] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (session?.user) {
      checkPlexStatus()
    }
  }, [session])

  const checkPlexStatus = async () => {
    try {
      const response = await fetch('/api/plex/setup')
      const data = await response.json()
      setPlexStatus(data)
    } catch (error) {
      console.error('Failed to check Plex status:', error)
      toast.error('Failed to check Plex connection')
    } finally {
      setLoading(false)
    }
  }

  const handleSelectMedia = (media: any) => {
    setSelectedMedia(media)
    toast.success(`Selected: ${media.title}`)
  }

  const handleCreateRoomWithMedia = () => {
    if (!selectedMedia) {
      toast.error('Please select media first')
      return
    }
    
    // Navigate to rooms page with selected media in URL params
    const mediaParams = new URLSearchParams({
      title: selectedMedia.title,
      year: selectedMedia.year || '',
      key: selectedMedia.key || '',
      type: selectedMedia.type || 'movie'
    })
    
    router.push(`/rooms?createRoom=true&media=${encodeURIComponent(mediaParams.toString())}`)
  }

  if (!session) {
    return (
      <>
        <Navigation />
        <div className="flex items-center justify-center min-h-screen">
          <Card>
            <CardContent className="p-8 text-center">
              <h2 className="text-2xl font-bold mb-4">Authentication Required</h2>
              <p className="text-muted-foreground mb-4">Please sign in to access your media library.</p>
              <Button onClick={() => router.push('/auth/signin')}>
                Sign In
              </Button>
            </CardContent>
          </Card>
        </div>
      </>
    )
  }

  if (loading) {
    return (
      <>
        <Navigation />
        <div className="flex items-center justify-center min-h-screen">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      </>
    )
  }

  if (!plexStatus?.connected) {
    return (
      <>
        <Navigation />
        <div className="container mx-auto px-4 py-8">
          <Card className="max-w-2xl mx-auto">
            <CardHeader className="text-center">
              <div className="h-16 w-16 mx-auto mb-4 bg-muted rounded-lg flex items-center justify-center">
                <ServerIcon className="h-8 w-8 text-muted-foreground" />
              </div>
              <CardTitle className="text-2xl">Plex Server Required</CardTitle>
              <p className="text-muted-foreground">
                Connect your Plex server to browse and stream your media library
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-muted/50 p-4 rounded-lg">
                <h3 className="font-semibold mb-2">What you'll need:</h3>
                <ul className="text-sm space-y-1 text-muted-foreground">
                  <li>• A running Plex Media Server</li>
                  <li>• Your Plex authentication token</li>
                  <li>• Server URL (local or remote)</li>
                </ul>
              </div>
              
              <div className="flex gap-2">
                <Button 
                  onClick={() => setShowPlexSetup(true)}
                  className="flex-1"
                >
                  <SettingsIcon className="h-4 w-4 mr-2" />
                  Setup Plex Connection
                </Button>
                <Button 
                  variant="outline"
                  onClick={() => router.push('/dashboard')}
                >
                  Back to Dashboard
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </>
    )
  }

  return (
    <>
      <Navigation />
      <div className="container mx-auto px-4 py-8 min-h-screen">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">Media Library</h1>
            <p className="text-muted-foreground mt-2">
              Browse your Plex media collection and create watch parties
            </p>
          </div>
          
          <div className="flex items-center gap-4">
            {/* Plex Status */}
            <div className="flex items-center gap-2">
              <ServerIcon className="h-4 w-4 text-green-500" />
              <Badge variant="default">
                Connected to {plexStatus.server?.username || 'Plex'}
              </Badge>
            </div>
            
            <Button
              variant="outline"
              onClick={() => setShowPlexSetup(true)}
            >
              <SettingsIcon className="h-4 w-4 mr-2" />
              Manage Connection
            </Button>
          </div>
        </div>

        {/* Selected Media Banner */}
        {selectedMedia && (
          <Card className="mb-8 border-primary bg-primary/5">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="h-16 w-12 bg-primary/10 rounded flex items-center justify-center">
                    <PlayIcon className="h-8 w-8 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold">{selectedMedia.title}</h3>
                    <p className="text-muted-foreground">
                      {selectedMedia.year} • {selectedMedia.type || 'Movie'}
                      {selectedMedia.duration && (
                        <> • {Math.round(selectedMedia.duration / 60000)} min</>
                      )}
                    </p>
                    <p className="text-sm text-green-600 font-medium mt-1">
                      ✓ Ready for watch party
                    </p>
                  </div>
                </div>
                
                <div className="flex gap-2">
                  <Button onClick={handleCreateRoomWithMedia}>
                    <PlusIcon className="h-4 w-4 mr-2" />
                    Create Room
                  </Button>
                  <Button 
                    variant="outline"
                    onClick={() => setSelectedMedia(null)}
                  >
                    Clear Selection
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Media Library */}
        <div className="h-[calc(100vh-300px)]">
          <ScrollArea className="h-full">
            <MediaLibrary
              onSelectMedia={handleSelectMedia}
              plexToken={plexStatus.server?.token}
              plexUrl={plexStatus.server?.url}
            />
          </ScrollArea>
        </div>
      </div>

      {/* Plex Setup Modal */}
      {showPlexSetup && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold">Plex Connection Manager</h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowPlexSetup(false)}
              >
                ✕
              </Button>
            </div>
            <EnhancedPlexSetup />
          </div>
        </div>
      )}
    </>
  )
}