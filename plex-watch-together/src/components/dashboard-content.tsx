'use client'

import { useState, useEffect } from 'react'
import { Session } from 'next-auth'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { 
  PlayIcon, 
  PlusIcon, 
  UsersIcon, 
  SettingsIcon,
  LogOutIcon,
  ServerIcon,
  LinkIcon,
  FilmIcon
} from 'lucide-react'
import { signOut } from 'next-auth/react'
import { toast } from 'sonner'
import MediaLibrary from './media-library'
import { PlexSetupModal } from './plex-setup-modal'
import { PlexDiagnostics } from './plex-diagnostics'

interface DashboardProps {
  session: Session
}

export function DashboardContent({ session }: DashboardProps) {
  const [rooms, setRooms] = useState([])
  const [isLoadingRooms, setIsLoadingRooms] = useState(true)
  const [showCreateRoom, setShowCreateRoom] = useState(false)
  const [showJoinRoom, setShowJoinRoom] = useState(false)
  const [showPlexSetup, setShowPlexSetup] = useState(false)
  const [newRoomName, setNewRoomName] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [plexStatus, setPlexStatus] = useState<any>(null)
  const [selectedMedia, setSelectedMedia] = useState<any>(null)
  const [showMediaLibrary, setShowMediaLibrary] = useState(false)
  const [showVideoPlayer, setShowVideoPlayer] = useState(false)

  useEffect(() => {
    fetchRooms()
    checkPlexStatus()
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
      setIsLoadingRooms(true)
      const response = await fetch('/api/rooms')
      const data = await response.json()
      
      if (response.ok) {
        setRooms(data.rooms)
      } else {
        toast.error(data.error || 'Failed to fetch rooms')
      }
    } catch (error) {
      toast.error('Failed to fetch rooms')
    } finally {
      setIsLoadingRooms(false)
    }
  }

  const handleCreateRoom = async () => {
    if (!newRoomName.trim()) {
      toast.error('Please enter a room name')
      return
    }

    if (!selectedMedia) {
      toast.error('Please select media to watch')
      return
    }

    setIsCreating(true)
    try {
      const response = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          name: newRoomName,
          isPublic: false,
          maxMembers: 10
        })
      })

      const data = await response.json()

      if (response.ok) {
        toast.success(`Room created! Invite code: ${data.room.inviteCode}`)
        setNewRoomName('')
        setShowCreateRoom(false)
        fetchRooms()
      } else {
        toast.error(data.error || 'Failed to create room')
      }
    } catch (error) {
      toast.error('Failed to create room')
    } finally {
      setIsCreating(false)
    }
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
      } else {
        toast.error(data.error || 'Failed to join room')
      }
    } catch (error) {
      toast.error('Failed to join room')
      console.error('Join room error:', error)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <PlayIcon className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-semibold">Plex Watch Together</h1>
          </div>
          
          <div className="flex items-center space-x-4">
            <span className="text-sm text-muted-foreground">
              Welcome, {session.user?.name || session.user?.email}
            </span>
            <Button variant="outline" size="sm" onClick={() => signOut()}>
              <LogOutIcon className="h-4 w-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </div>
      </header>

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
                  <div className="space-y-2">
                    <Label htmlFor="room-name">Room Name</Label>
                    <Input
                      id="room-name"
                      placeholder="Movie Night with Friends"
                      value={newRoomName}
                      onChange={(e) => setNewRoomName(e.target.value)}
                    />
                  </div>
                  
                  <div className="flex space-x-2">
                    <Button 
                      onClick={handleCreateRoom} 
                      disabled={isCreating}
                      className="flex-1"
                    >
                      {isCreating ? 'Creating...' : 'Create Room'}
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
                {isLoadingRooms ? (
                  <div className="text-center py-8 text-muted-foreground">
                    Loading rooms...
                  </div>
                ) : rooms.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <UsersIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No rooms yet</p>
                    <p className="text-sm">Create or join a room to get started</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {rooms.map((room: any) => (
                      <Card key={room.id} className="p-4 hover:shadow-md transition-shadow">
                        <div className="flex justify-between items-start">
                          <div className="space-y-2">
                            <h3 className="font-medium">{room.name}</h3>
                            {room.description && (
                              <p className="text-sm text-muted-foreground">{room.description}</p>
                            )}
                            <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                              <span className="flex items-center space-x-1">
                                <UsersIcon className="h-4 w-4" />
                                <span>{room.memberCount}/{room.maxMembers}</span>
                              </span>
                              <span>Code: {room.inviteCode}</span>
                              {room.currentMedia && (
                                <span>📺 {room.currentMedia}</span>
                              )}
                            </div>
                          </div>
                          <div className="flex space-x-2">
                            <Button size="sm">
                              <PlayIcon className="h-4 w-4 mr-1" />
                              Join
                            </Button>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
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
                  <span className="font-medium">0</span>
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
        {plexStatus?.connected && (
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
      </div>

      {/* Plex Setup Modal */}
      <PlexSetupModal
        isOpen={showPlexSetup}
        onOpenChange={setShowPlexSetup}
        onPlexConnected={checkPlexStatus}
      />
    </div>
  )
}