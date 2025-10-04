'use client'

import { useState, useEffect } from 'react'
import { Session } from 'next-auth'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { DashboardSkeleton, RoomListSkeleton, LoadingText, ContextualLoader, LoadingOverlay } from '@/components/ui/skeleton'
import { SmoothTransition, StaggeredTransition, LoadingStateDisplay, PageTransition } from '@/components/ui/transitions'
import { useLoadingState, useRoomLoading, useMediaLoading } from '@/hooks/useLoadingState'
import { 
  PlayIcon, 
  PlusIcon, 
  UsersIcon, 
  SettingsIcon,
  LogOutIcon,
  ServerIcon,
  LinkIcon,
  FilmIcon,
  TrashIcon,
  CrownIcon,
  ClockIcon,
  AlertCircleIcon
} from 'lucide-react'
import { signOut } from 'next-auth/react'
import { toast } from 'sonner'
import MediaLibrary from './media-library'
import { PlexSetupModal } from '@/components/plex-setup-modal'
import { EnhancedPlexSetup } from '@/components/enhanced-plex-setup'
import { PlexDiagnostics } from './plex-diagnostics'
import VideoPlayer from './video-player'

interface DashboardProps {
  session: Session
}

export function DashboardContent({ session }: DashboardProps) {
  const router = useRouter()
  const [rooms, setRooms] = useState([])
  const [showCreateRoom, setShowCreateRoom] = useState(false)
  const [showJoinRoom, setShowJoinRoom] = useState(false)
  const [showPlexSetup, setShowPlexSetup] = useState(false)
  const [newRoomName, setNewRoomName] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [plexStatus, setPlexStatus] = useState<any>(null)
  const [selectedMedia, setSelectedMedia] = useState<any>(null)
  const [showMediaLibrary, setShowMediaLibrary] = useState(false)
  const [showVideoPlayer, setShowVideoPlayer] = useState(false)
  const [deletingRoomId, setDeletingRoomId] = useState<string | null>(null)
  const [isInitialLoading, setIsInitialLoading] = useState(true)

  // Enhanced loading states
  const roomLoading = useRoomLoading()
  const mediaLoading = useMediaLoading()
  const dashboardLoading = useLoadingState({
    defaultTimeout: 30000,
    enableEstimatedTime: true
  })

  useEffect(() => {
    const initializeDashboard = async () => {
      dashboardLoading.startLoading({
        type: 'room',
        message: 'Loading dashboard...',
        estimatedTime: 2000
      })
      
      try {
        await Promise.all([fetchRooms(), checkPlexStatus()])
        dashboardLoading.completeLoading('Dashboard loaded successfully!')
      } catch (error) {
        dashboardLoading.errorLoading('Failed to load dashboard')
      } finally {
        setIsInitialLoading(false)
      }
    }

    initializeDashboard()
  }, [])

  const checkPlexStatus = async () => {
    try {
      const response = await fetch('/api/plex/setup')
      const data = await response.json()
      setPlexStatus(data)
    } catch (error) {
      console.error('Failed to check Plex status:', error)
    }
  }

  const handleSelectMedia = (media: any) => {
    console.log('Selected media:', media)
    setSelectedMedia(media)
    setShowVideoPlayer(true)
    setShowMediaLibrary(false)
  }

  const handleCloseVideoPlayer = () => {
    setShowVideoPlayer(false)
    setSelectedMedia(null)
  }

  const fetchRooms = async () => {
    try {
      const response = await fetch('/api/rooms')
      const data = await response.json()
      
      if (response.ok) {
        setRooms(data.rooms)
      } else {
        toast.error(data.error || 'Failed to fetch rooms')
      }
    } catch (error) {
      toast.error('Failed to fetch rooms')
      throw error
    }
  }

  const handleCreateRoom = async () => {
    if (!newRoomName.trim()) {
      toast.error('Please enter a room name')
      return
    }

    roomLoading.createRoom(selectedMedia?.title)
    try {
      const response = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          name: newRoomName,
          isPublic: false,
          maxMembers: 10,
          description: selectedMedia ? `Watching ${selectedMedia.title}` : undefined
        })
      })

      const data = await response.json()

      if (response.ok) {
        toast.success(`Room created! Invite code: ${data.room.inviteCode}`)
        
        // If we have selected media, share it to the room automatically
        if (selectedMedia) {
          try {
            await shareMediaToRoom(data.room.id, selectedMedia)
            toast.success(`${selectedMedia.title} shared to room!`)
          } catch (error) {
            console.error('Failed to share media:', error)
          }
        }
        
        setNewRoomName('')
        setShowCreateRoom(false)
        fetchRooms()
        
        // Navigate to the created room
        router.push(`/room/${data.room.id}`)
      } else {
        toast.error(data.error || 'Failed to create room')
      }
    } catch (error) {
      roomLoading.errorLoading('Failed to create room')
      toast.error('Failed to create room')
    } finally {
      if (!roomLoading.error) {
        roomLoading.completeLoading('Room created successfully!')
      }
    }
  }

  const shareMediaToRoom = async (roomId: string, media: any) => {
    const response = await fetch('/api/rooms/share-media', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId, media })
    })
    
    if (!response.ok) {
      throw new Error('Failed to share media to room')
    }
    
    return response.json()
  }

    const handleJoinRoom = async () => {
    if (!joinCode.trim()) {
      toast.error('Please enter a room code')
      return
    }

    try {
      const response = await fetch('/api/rooms/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteCode: joinCode.trim().toUpperCase() })
      })

      const data = await response.json()

      if (response.ok) {
        toast.success(`Joined "${data.room.name}" successfully!`)
        setJoinCode('')
        setShowJoinRoom(false)
        fetchRooms() // Refresh room list
        
        // Navigate to the joined room
        router.push(`/room/${data.room.id}`)
      } else {
        toast.error(data.error || 'Failed to join room')
      }
    } catch (error) {
      toast.error('Failed to join room')
      console.error('Join room error:', error)
    }
  }

  const handleDeleteRoom = async (roomId: string, roomName: string) => {
    if (!confirm(`Are you sure you want to delete the room "${roomName}"? This action cannot be undone.`)) {
      return
    }

    setDeletingRoomId(roomId)
    
    try {
      const response = await fetch(`/api/rooms?roomId=${roomId}`, {
        method: 'DELETE'
      })

      const data = await response.json()

      if (response.ok) {
        toast.success(`Room "${roomName}" deleted successfully!`)
        fetchRooms() // Refresh room list
      } else {
        toast.error(data.error || 'Failed to delete room')
      }
    } catch (error) {
      toast.error('Failed to delete room')
      console.error('Delete room error:', error)
    } finally {
      setDeletingRoomId(null)
    }
  }

  const handleJoinRoomById = async (roomId: string) => {
    try {
      // Navigate directly to the room
      router.push(`/room/${roomId}`)
    } catch (error) {
      toast.error('Failed to join room')
      console.error('Join room by ID error:', error)
    }
  }

  return (
    <PageTransition>
      <LoadingOverlay 
        visible={dashboardLoading.isLoading}
        type={dashboardLoading.state.type === 'idle' || dashboardLoading.state.type === 'error' ? 'room' : dashboardLoading.state.type}
        message={dashboardLoading.state.message}
        progress={dashboardLoading.state.progress}
      />
      
      <LoadingOverlay 
        visible={roomLoading.isLoading}
        type="room"
        message={roomLoading.state.message}
        onCancel={roomLoading.state.canCancel ? roomLoading.cancelLoading : undefined}
      />
      
      <LoadingOverlay 
        visible={mediaLoading.isLoading}
        type="media"
        message={mediaLoading.state.message}
      />

    <div className="min-h-screen bg-background">

      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Quick Actions */}
            <Card>
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
                <CardDescription>
                  Start or join a watch party in seconds
                </CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Button 
                  size="lg" 
                  className="h-20 flex-col space-y-2"
                  onClick={() => setShowCreateRoom(true)}
                >
                  <PlusIcon className="h-6 w-6" />
                  <span>Create Room</span>
                </Button>
                
                <Button 
                  variant="outline" 
                  size="lg" 
                  className="h-20 flex-col space-y-2"
                  onClick={() => setShowJoinRoom(true)}
                >
                  <LinkIcon className="h-6 w-6" />
                  <span>Join Room</span>
                </Button>
              </CardContent>
            </Card>

            {/* Create Room Modal */}
            {showCreateRoom && (
              <Card className="border-primary">
                <CardHeader>
                  <CardTitle>Create Watch Room</CardTitle>
                  <CardDescription>
                    Create a new room to watch movies with friends
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {selectedMedia && (
                    <Card className="p-3 bg-muted/50">
                      <div className="flex items-center gap-3">
                        <FilmIcon className="h-6 w-6 text-primary" />
                        <div>
                          <p className="font-medium">{selectedMedia.title}</p>
                          <p className="text-sm text-muted-foreground">
                            {selectedMedia.year} • Will be shared with room
                          </p>
                        </div>
                      </div>
                    </Card>
                  )}
                  
                  <div className="space-y-2">
                    <Label htmlFor="room-name">Room Name</Label>
                    <Input
                      id="room-name"
                      placeholder={selectedMedia ? `Watching ${selectedMedia.title}` : "Movie Night with Friends"}
                      value={newRoomName}
                      onChange={(e) => setNewRoomName(e.target.value)}
                    />
                  </div>
                  
                  <div className="flex space-x-2">
                    <Button 
                      onClick={handleCreateRoom} 
                      disabled={roomLoading.isLoading}
                      className="flex-1"
                    >
                      {roomLoading.isLoading ? (
                        <LoadingText text="Creating" />
                      ) : (
                        'Create Room'
                      )}
                    </Button>
                    <Button 
                      variant="outline" 
                      onClick={() => setShowCreateRoom(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Join Room Modal */}
            {showJoinRoom && (
              <Card className="border-primary">
                <CardHeader>
                  <CardTitle>Join Watch Room</CardTitle>
                  <CardDescription>
                    Enter the room code to join a watch party
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="join-code">Room Code</Label>
                    <Input
                      id="join-code"
                      placeholder="Enter room code"
                      value={joinCode}
                      onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                    />
                  </div>
                  
                  <div className="flex space-x-2">
                    <Button 
                      onClick={handleJoinRoom} 
                      className="flex-1"
                    >
                      Join Room
                    </Button>
                    <Button 
                      variant="outline" 
                      onClick={() => setShowJoinRoom(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Recent Rooms */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <UsersIcon className="h-5 w-5" />
                  <span>Your Watch Rooms</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <LoadingStateDisplay
                  isLoading={isInitialLoading}
                  loadingComponent={<RoomListSkeleton />}
                >
                  {rooms.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <UsersIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No rooms yet</p>
                    <p className="text-sm">Create or join a room to get started</p>
                  </div>
                ) : (
                    <StaggeredTransition show={true} staggerDelay={100} className="space-y-4">
                    {rooms.map((room: any) => {
                      const isOwner = room.creator?.id === session.user?.id
                      const isActive = room.isActive
                      
                      return (
                        <Card key={room.id} className={`p-4 hover:shadow-md transition-shadow ${
                          isActive ? 'border-green-200 bg-green-50/50' : 'border-gray-200'
                        }`}>
                          <div className="flex justify-between items-start">
                            <div className="space-y-2 flex-1">
                              <div className="flex items-center space-x-2">
                                <h3 className="font-medium">{room.name}</h3>
                                {isOwner && (
                                  <Badge variant="secondary" className="text-xs gap-1">
                                    <CrownIcon className="h-3 w-3" />
                                    Owner
                                  </Badge>
                                )}
                                {isActive && (
                                  <Badge variant="default" className="text-xs gap-1">
                                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                                    Active
                                  </Badge>
                                )}
                              </div>
                              
                              {room.description && (
                                <p className="text-sm text-muted-foreground">{room.description}</p>
                              )}
                              
                              <div className="flex items-center flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                                <span className="flex items-center space-x-1">
                                  <UsersIcon className="h-4 w-4" />
                                  <span>{room.memberCount}/{room.maxMembers}</span>
                                </span>
                                <span className="flex items-center space-x-1">
                                  <span>Code:</span>
                                  <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono">
                                    {room.inviteCode}
                                  </code>
                                </span>
                                {room.currentMedia && (
                                  <span className="flex items-center space-x-1">
                                    <FilmIcon className="h-4 w-4" />
                                    <span className="truncate max-w-32">{room.currentMedia}</span>
                                  </span>
                                )}
                                {room.updatedAt && (
                                  <span className="flex items-center space-x-1">
                                    <ClockIcon className="h-3 w-3" />
                                    <span>{new Date(room.updatedAt).toLocaleDateString()}</span>
                                  </span>
                                )}
                              </div>
                            </div>
                            
                            <div className="flex space-x-2 ml-4">
                              <Button 
                                size="sm" 
                                onClick={() => handleJoinRoomById(room.id)}
                                disabled={room.memberCount >= room.maxMembers}
                              >
                                <PlayIcon className="h-4 w-4 mr-1" />
                                {room.memberCount >= room.maxMembers ? 'Full' : 'Join'}
                              </Button>
                              
                              {isOwner && (
                                <Button 
                                  size="sm" 
                                  variant="destructive"
                                  onClick={() => handleDeleteRoom(room.id, room.name)}
                                  disabled={deletingRoomId === room.id}
                                >
                                  {deletingRoomId === room.id ? (
                                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                  ) : (
                                    <TrashIcon className="h-4 w-4" />
                                  )}
                                </Button>
                              )}
                            </div>
                          </div>
                          
                          {!isActive && (
                            <div className="mt-3 p-2 bg-yellow-50 border border-yellow-200 rounded-md flex items-center gap-2">
                              <AlertCircleIcon className="h-4 w-4 text-yellow-600" />
                              <span className="text-sm text-yellow-700">Room is inactive</span>
                            </div>
                          )}
                        </Card>
                      )
                    })}
                    </StaggeredTransition>
                )}
                </LoadingStateDisplay>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            
            {/* Plex Status */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <ServerIcon className="h-5 w-5" />
                  <span>Plex Server</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Status:</span>
                  <Badge variant={plexStatus?.connected ? "default" : "secondary"}>
                    {plexStatus?.connected ? "Connected" : "Not Connected"}
                  </Badge>
                </div>
                
                {plexStatus?.connected && plexStatus.server && (
                  <div className="text-xs text-muted-foreground space-y-1">
                    <p>User: {plexStatus.server.username}</p>
                    <p>Libraries: {plexStatus.server.libraries}</p>
                  </div>
                )}
                
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full"
                  onClick={() => setShowPlexSetup(true)}
                >
                  <SettingsIcon className="h-4 w-4 mr-2" />
                  {plexStatus?.connected ? "Manage Plex" : "Setup Plex Server"}
                </Button>
              </CardContent>
            </Card>

            {/* Connection Diagnostics */}
            {plexStatus?.connected && (
              <PlexDiagnostics />
            )}

            {/* Quick Stats */}
            <Card>
              <CardHeader>
                <CardTitle>Your Stats</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Rooms Created:</span>
                  <span className="font-medium">
                    {rooms.filter((room: any) => room.creator?.id === session.user?.id).length}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Movies Watched:</span>
                  <span className="font-medium">0</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Friends Invited:</span>
                  <span className="font-medium">0</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Media Library Section */}
        {plexStatus?.connected && !showVideoPlayer && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold">Browse Media</h2>
                <p className="text-muted-foreground">
                  Select content from your Plex server to watch with friends
                </p>
              </div>
              {selectedMedia && (
                <Card className="p-4 max-w-sm">
                  <div className="flex items-center gap-3">
                    <FilmIcon className="h-8 w-8 text-primary" />
                    <div>
                      <p className="font-medium">{selectedMedia.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {selectedMedia.year} • Ready to watch
                      </p>
                    </div>
                  </div>
                </Card>
              )}
            </div>

            <MediaLibrary
              onSelectMedia={handleSelectMedia}
              plexToken={plexStatus.server?.token}
              plexUrl={plexStatus.server?.url}
            />
          </div>
        )}

        {/* 🎬 Video Player - Watch Together Experience */}
        {showVideoPlayer && selectedMedia && plexStatus?.connected && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold">Now Playing</h2>
                <p className="text-muted-foreground">
                  🚀 Ultra-fast localhost connection active
                </p>
              </div>
              <div className="flex gap-2">
                <Button 
                  onClick={() => setShowCreateRoom(true)}
                  className="gap-2"
                >
                  <PlusIcon className="h-4 w-4" />
                  Create Watch Party
                </Button>
                <Button 
                  variant="outline" 
                  onClick={handleCloseVideoPlayer}
                >
                  ← Back to Library
                </Button>
              </div>
            </div>

            {/* Quick Watch Party Actions */}
            <Card className="p-4 bg-gradient-to-r from-primary/5 to-blue-500/5 border-primary/20">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <UsersIcon className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold">Watch with Friends</h3>
                    <p className="text-sm text-muted-foreground">
                      Create a room to sync playback with friends
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button 
                    size="sm"
                    onClick={() => setShowCreateRoom(true)}
                  >
                    Create Room
                  </Button>
                  <Button 
                    size="sm"
                    variant="outline"
                    onClick={() => setShowJoinRoom(true)}
                  >
                    Join Room
                  </Button>
                </div>
              </div>
            </Card>

            <VideoPlayer
              media={selectedMedia}
              plexUrl={plexStatus.server?.url}
              plexToken={plexStatus.server?.token}
              onClose={handleCloseVideoPlayer}
            />
          </div>
        )}
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
    </div>
    </PageTransition>
  )
}