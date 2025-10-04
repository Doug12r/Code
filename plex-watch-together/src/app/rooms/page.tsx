'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Navigation } from '@/components/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { 
  PlusIcon,
  UsersIcon,
  CalendarIcon,
  CopyIcon,
  ExternalLinkIcon,
  TvIcon,
  UserIcon,
  LockIcon,
  UnlockIcon,
  PlayIcon
} from 'lucide-react'

interface Room {
  id: string
  name: string
  description?: string
  inviteCode: string
  isPublic: boolean
  maxMembers: number
  memberCount: number
  creator: {
    id: string
    name: string
    image?: string
  }
  isActive: boolean
  currentMedia?: string
  createdAt: string
  updatedAt: string
}

export default function RoomsPage() {
  const { data: session } = useSession()
  const router = useRouter()
  
  const [rooms, setRooms] = useState<Room[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [joining, setJoining] = useState(false)
  
  // Create room form
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [roomName, setRoomName] = useState('')
  const [roomDescription, setRoomDescription] = useState('')
  const [isPublic, setIsPublic] = useState(false)
  const [maxMembers, setMaxMembers] = useState(10)
  
  // Join room form
  const [showJoinDialog, setShowJoinDialog] = useState(false)
  const [inviteCode, setInviteCode] = useState('')

  // Load user's rooms
  useEffect(() => {
    if (session?.user) {
      loadRooms()
    }
  }, [session])

  const loadRooms = async () => {
    try {
      const response = await fetch('/api/rooms')
      
      if (response.ok) {
        const data = await response.json()
        setRooms(data.rooms || [])
      } else {
        toast.error('Failed to load rooms')
      }
    } catch (error) {
      console.error('Error loading rooms:', error)
      toast.error('Failed to load rooms')
    } finally {
      setLoading(false)
    }
  }

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!roomName.trim()) {
      toast.error('Room name is required')
      return
    }

    setCreating(true)

    try {
      const response = await fetch('/api/rooms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: roomName.trim(),
          description: roomDescription.trim() || undefined,
          isPublic,
          maxMembers,
        }),
      })

      if (response.ok) {
        const data = await response.json()
        toast.success('Room created successfully!')
        
        // Reset form
        setRoomName('')
        setRoomDescription('')
        setIsPublic(false)
        setMaxMembers(10)
        setShowCreateDialog(false)
        
        // Refresh rooms list
        loadRooms()
        
        // Navigate to the new room
        router.push(`/room/${data.room.id}`)
      } else {
        const data = await response.json()
        toast.error(data.error || 'Failed to create room')
      }
    } catch (error) {
      console.error('Error creating room:', error)
      toast.error('Failed to create room')
    } finally {
      setCreating(false)
    }
  }

  const handleJoinRoom = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!inviteCode.trim()) {
      toast.error('Invite code is required')
      return
    }

    setJoining(true)

    try {
      const response = await fetch('/api/rooms/join', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          inviteCode: inviteCode.trim().toUpperCase(),
        }),
      })

      if (response.ok) {
        const data = await response.json()
        toast.success('Joined room successfully!')
        
        // Reset form
        setInviteCode('')
        setShowJoinDialog(false)
        
        // Refresh rooms list
        loadRooms()
        
        // Navigate to the room
        router.push(`/room/${data.room.id}`)
      } else {
        const data = await response.json()
        toast.error(data.error || 'Failed to join room')
      }
    } catch (error) {
      console.error('Error joining room:', error)
      toast.error('Failed to join room')
    } finally {
      setJoining(false)
    }
  }

  const copyInviteCode = (code: string) => {
    navigator.clipboard.writeText(code).then(() => {
      toast.success('Invite code copied to clipboard!')
    })
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  if (!session) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card>
          <CardContent className="p-8 text-center">
            <h2 className="text-2xl font-bold mb-4">Authentication Required</h2>
            <p className="text-muted-foreground mb-4">Please sign in to access rooms.</p>
            <Button onClick={() => router.push('/auth/signin')}>
              Sign In
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <>
      <Navigation />
      <div className="container mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Watch Rooms</h1>
          <p className="text-muted-foreground mt-2">
            Create or join rooms to watch content together with friends
          </p>
        </div>
        
        <div className="flex gap-2">
          <Dialog open={showJoinDialog} onOpenChange={setShowJoinDialog}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <ExternalLinkIcon className="h-4 w-4 mr-2" />
                Join Room
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Join a Room</DialogTitle>
                <DialogDescription>
                  Enter the invite code to join a watch party room
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleJoinRoom} className="space-y-4">
                <div>
                  <Label htmlFor="inviteCode">Invite Code</Label>
                  <Input
                    id="inviteCode"
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                    placeholder="Enter invite code (e.g., ABC123)"
                    maxLength={10}
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowJoinDialog(false)}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={joining || !inviteCode.trim()}
                    className="flex-1"
                  >
                    {joining ? 'Joining...' : 'Join Room'}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>

          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogTrigger asChild>
              <Button>
                <PlusIcon className="h-4 w-4 mr-2" />
                Create Room
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create a New Room</DialogTitle>
                <DialogDescription>
                  Set up a watch party room where you and your friends can watch together
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreateRoom} className="space-y-4">
                <div>
                  <Label htmlFor="roomName">Room Name</Label>
                  <Input
                    id="roomName"
                    value={roomName}
                    onChange={(e) => setRoomName(e.target.value)}
                    placeholder="Enter room name"
                    maxLength={50}
                  />
                </div>
                
                <div>
                  <Label htmlFor="roomDescription">Description (Optional)</Label>
                  <Textarea
                    id="roomDescription"
                    value={roomDescription}
                    onChange={(e) => setRoomDescription(e.target.value)}
                    placeholder="Describe what you'll be watching"
                    maxLength={200}
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <Label htmlFor="isPublic">Public Room</Label>
                  <Switch
                    id="isPublic"
                    checked={isPublic}
                    onCheckedChange={setIsPublic}
                  />
                </div>
                
                <div>
                  <Label htmlFor="maxMembers">Maximum Members</Label>
                  <Input
                    id="maxMembers"
                    type="number"
                    min={2}
                    max={20}
                    value={maxMembers}
                    onChange={(e) => setMaxMembers(parseInt(e.target.value) || 10)}
                  />
                </div>

                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowCreateDialog(false)}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={creating || !roomName.trim()}
                    className="flex-1"
                  >
                    {creating ? 'Creating...' : 'Create Room'}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Rooms Grid */}
      {rooms.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <div className="h-16 w-16 mx-auto mb-4 bg-muted rounded-lg flex items-center justify-center">
              <TvIcon className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium mb-2">No Rooms Yet</h3>
            <p className="text-muted-foreground mb-4">
              Create your first room or join one with an invite code to get started
            </p>
            <div className="flex gap-2 justify-center">
              <Button onClick={() => setShowCreateDialog(true)}>
                Create Room
              </Button>
              <Button variant="outline" onClick={() => setShowJoinDialog(true)}>
                Join Room
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {rooms.map((room) => (
            <Card key={room.id} className="hover:shadow-lg transition-shadow cursor-pointer">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-lg">{room.name}</CardTitle>
                    {room.description && (
                      <p className="text-sm text-muted-foreground mt-1">
                        {room.description}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 ml-2">
                    {room.isPublic ? (
                      <UnlockIcon className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <LockIcon className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                </div>
              </CardHeader>
              
              <CardContent className="space-y-4">
                {/* Room Stats */}
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <UsersIcon className="h-4 w-4" />
                    <span>{room.memberCount}/{room.maxMembers}</span>
                  </div>
                  <Badge variant={room.isActive ? 'default' : 'secondary'}>
                    {room.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </div>

                {/* Current Media */}
                {room.currentMedia && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <PlayIcon className="h-4 w-4" />
                    <span className="truncate">{room.currentMedia}</span>
                  </div>
                )}

                {/* Creator Info */}
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <UserIcon className="h-4 w-4" />
                  <span>Created by {room.creator.name}</span>
                </div>

                {/* Timestamps */}
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <CalendarIcon className="h-3 w-3" />
                  <span>Created {formatDate(room.createdAt)}</span>
                </div>

                <Separator />

                {/* Actions */}
                <div className="flex gap-2">
                  <Button
                    onClick={() => router.push(`/room/${room.id}`)}
                    className="flex-1"
                    size="sm"
                  >
                    Enter Room
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation()
                      copyInviteCode(room.inviteCode)
                    }}
                  >
                    <CopyIcon className="h-3 w-3" />
                  </Button>
                </div>

                {/* Invite Code */}
                <div className="text-center">
                  <span className="text-xs text-muted-foreground">Invite Code: </span>
                  <Badge variant="outline" className="font-mono text-xs">
                    {room.inviteCode}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      </div>
    </>
  )
}