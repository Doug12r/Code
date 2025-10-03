'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import MediaLibrary from '@/components/media-library'
import { SyncedVideoPlayer } from '@/components/synced-video-player'
import { RealTimePerformanceDashboard } from '@/components/real-time-performance-dashboard'
import { useSocket } from '@/hooks/useSocket'
import { toast } from 'sonner'
import { 
  ArrowLeftIcon,
  UsersIcon,
  MessageSquareIcon,
  SettingsIcon,
  ShareIcon,
  CopyIcon,
  WifiIcon,
  WifiOffIcon,
  VideoIcon,
  TvIcon,
  ActivityIcon
} from 'lucide-react'

interface Room {
  id: string
  name: string
  description?: string
  inviteCode?: string
  isPublic: boolean
  allowChat?: boolean
  maxMembers: number
  creator: {
    id: string
    name: string
    image?: string
  }
  // Current media fields from database
  currentMediaId?: string
  currentMediaTitle?: string
  currentMediaType?: string
  currentPosition: number
  isPlaying: boolean
  // Plex metadata
  plexRatingKey?: string
  plexMachineId?: string
  plexLibrarySectionId?: string
}

interface RoomMember {
  id: string
  user: {
    id: string
    name: string
    image?: string
  }
  canControl: boolean
  canInvite: boolean
  isActive: boolean
  joinedAt: string
}

interface ChatMessage {
  id: string
  content: string
  user: {
    id: string
    name: string
    image?: string
  }
  createdAt: string
  type: string
}

export default function RoomPage() {
  const { data: session } = useSession()
  const params = useParams()
  const router = useRouter()
  const roomId = params?.id as string
  
  const [room, setRoom] = useState<Room | null>(null)
  const [members, setMembers] = useState<RoomMember[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [plexStatus, setPlexStatus] = useState<any>(null)
  
  // UI State
  const [showMediaLibrary, setShowMediaLibrary] = useState(false)
  const [showChat, setShowChat] = useState(true)
  const [showPerformance, setShowPerformance] = useState(false)
  const [chatInput, setChatInput] = useState('')
  
  // Socket connection
  const {
    connected,
    connecting,
    error: socketError,
    socket,
    joinRoom,
    leaveRoom,
    emitChatMessage,
    connectionQuality
  } = useSocket({
    roomId,
    autoConnect: true
  })

  // Load room data
  useEffect(() => {
    if (roomId && session?.user) {
      loadRoomData()
      checkPlexStatus()
    }
  }, [roomId, session])

  const checkPlexStatus = async () => {
    try {
      const response = await fetch('/api/plex/setup')
      const data = await response.json()
      setPlexStatus(data)
    } catch (error) {
      console.error('Failed to check Plex status:', error)
    }
  }

  // Join socket room
  useEffect(() => {
    if (connected && roomId) {
      joinRoom(roomId)
    }
  }, [connected, roomId, joinRoom])

  // Socket event listeners
  useEffect(() => {
    if (!socket) return

    const handleUserJoined = (data: { user: any }) => {
      console.log('👋 User joined:', data.user.name)
      toast.success(`${data.user.name} joined the room`)
      // Refresh members list
      loadRoomData()
    }

    const handleUserLeft = (data: { userId: string; reason?: string }) => {
      console.log('👋 User left:', data.userId)
      setMembers(prev => prev.filter(member => member.user.id !== data.userId))
    }

    const handleNewChatMessage = (message: ChatMessage) => {
      setMessages(prev => [...prev, message])
      
      // Auto-scroll chat
      setTimeout(() => {
        const chatContainer = document.getElementById('chat-messages')
        if (chatContainer) {
          chatContainer.scrollTop = chatContainer.scrollHeight
        }
      }, 100)
    }

    const handleRoomState = (data: any) => {
      console.log('📋 Room state updated:', data)
      if (data.members) {
        setMembers(data.members)
      }
    }

    socket.on('user-joined', handleUserJoined)
    socket.on('user-left', handleUserLeft)
    socket.on('new-chat-message', handleNewChatMessage)
    socket.on('room-state', handleRoomState)

    return () => {
      socket.off('user-joined', handleUserJoined)
      socket.off('user-left', handleUserLeft)
      socket.off('new-chat-message', handleNewChatMessage)
      socket.off('room-state', handleRoomState)
    }
  }, [socket])

  const loadRoomData = async () => {
    if (!roomId || !session?.user) return

    try {
      // Load room details
      const roomResponse = await fetch(`/api/rooms/${roomId}`)
      if (!roomResponse.ok) {
        if (roomResponse.status === 404) {
          setError('Room not found')
        } else if (roomResponse.status === 403) {
          setError('Access denied to this room')
        } else {
          setError('Failed to load room')
        }
        return
      }

      const roomData = await roomResponse.json()
      setRoom(roomData.room)

      // Load room members
      const membersResponse = await fetch(`/api/rooms/${roomId}/members`)
      if (membersResponse.ok) {
        const membersData = await membersResponse.json()
        setMembers(membersData.members || [])
      }

      // Load recent chat messages
      const messagesResponse = await fetch(`/api/rooms/${roomId}/messages?limit=50`)
      if (messagesResponse.ok) {
        const messagesData = await messagesResponse.json()
        setMessages(messagesData.messages || [])
      }

    } catch (error) {
      console.error('Error loading room data:', error)
      setError('Failed to load room')
    } finally {
      setLoading(false)
    }
  }

  const handleMediaSelect = async (media: any) => {
    if (!room || !session?.user) return

    try {
      // Extract just the rating key from the full path for consistent storage
      const ratingKey = media.key?.replace(/^\/library\/metadata\//, '') || media.ratingKey
      
      const response = await fetch(`/api/rooms/${roomId}/media`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          mediaId: ratingKey, // Store just the rating key, not the full path
          mediaTitle: media.title,
          mediaType: media.type,
        }),
      })

      if (response.ok) {
        toast.success(`Now playing: ${media.title}`)
        setShowMediaLibrary(false)
        // Refresh room data to get updated media info
        loadRoomData()
      } else {
        toast.error('Failed to set media')
      }
    } catch (error) {
      console.error('Error setting media:', error)
      toast.error('Failed to set media')
    }
  }

  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!chatInput.trim() || !connected) return
    
    emitChatMessage(chatInput.trim())
    setChatInput('')
  }

  const copyInviteLink = () => {
    if (!room) return
    
    const inviteUrl = `${window.location.origin}/rooms?invite=${room.inviteCode}`
    navigator.clipboard.writeText(inviteUrl).then(() => {
      toast.success('Invite link copied to clipboard!')
    })
  }

  const getMediaUrl = () => {
    if (!room?.currentMediaId) return undefined
    
    // Use the same working proxy endpoint as dashboard video player  
    const params = new URLSearchParams({
      key: `/library/metadata/${room.currentMediaId}`
    })
    
    return `/api/video/proxy?${params.toString()}`
  }

  const getCurrentMember = () => {
    return members.find(member => member.user.id === session?.user?.id)
  }

  if (!session) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card>
          <CardContent className="p-8 text-center">
            <h2 className="text-2xl font-bold mb-4">Authentication Required</h2>
            <p className="text-muted-foreground mb-4">Please sign in to access this room.</p>
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

  if (error || !room) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card>
          <CardContent className="p-8 text-center">
            <h2 className="text-2xl font-bold mb-4">Room Error</h2>
            <p className="text-muted-foreground mb-4">{error || 'Room not found'}</p>
            <div className="flex gap-2 justify-center">
              <Button onClick={() => router.push('/rooms')}>
                <ArrowLeftIcon className="h-4 w-4 mr-2" />
                Back to Rooms
              </Button>
              <Button variant="outline" onClick={() => loadRoomData()}>
                Try Again
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  const currentMember = getCurrentMember()

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push('/rooms')}
              >
                <ArrowLeftIcon className="h-4 w-4 mr-2" />
                Back
              </Button>
              
              <div>
                <h1 className="text-2xl font-bold">{room.name}</h1>
                {room.description && (
                  <p className="text-sm text-muted-foreground">{room.description}</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Connection Status */}
              <Badge variant={connected ? 'default' : 'destructive'} className="gap-1">
                {connected ? (
                  <WifiIcon className="h-3 w-3" />
                ) : (
                  <WifiOffIcon className="h-3 w-3" />
                )}
                {connected ? 'Connected' : 'Disconnected'}
              </Badge>

              {/* Member Count */}
              <Badge variant="outline">
                <UsersIcon className="h-3 w-3 mr-1" />
                {members.length}
              </Badge>

              {/* Actions */}
              <Button
                variant="outline"
                size="sm"
                onClick={copyInviteLink}
              >
                <ShareIcon className="h-4 w-4 mr-2" />
                Share
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowMediaLibrary(true)}
                disabled={!currentMember?.canControl}
              >
                <VideoIcon className="h-4 w-4 mr-2" />
                Select Media
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowPerformance(!showPerformance)}
              >
                <ActivityIcon className="h-4 w-4 mr-2" />
                {showPerformance ? 'Hide' : 'Show'} Performance
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Performance Dashboard */}
      {showPerformance && (
        <div className="border-b bg-muted/30">
          <div className="container mx-auto px-4 py-4">
            <RealTimePerformanceDashboard roomId={roomId} />
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Video Player */}
          <div className="lg:col-span-3">
            {room.currentMediaId ? (
              <SyncedVideoPlayer
                roomId={roomId}
                mediaUrl={getMediaUrl()}
                mediaTitle={room.currentMediaTitle || 'Unknown Media'}
                canControl={currentMember?.canControl || false}
              />
            ) : (
              <Card>
                <CardContent className="flex flex-col items-center justify-center h-96">
                  <div className="text-center space-y-4">
                    <div className="h-16 w-16 mx-auto bg-muted rounded-lg flex items-center justify-center">
                      <TvIcon className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <div>
                      <h3 className="text-lg font-medium">No Media Selected</h3>
                      <p className="text-sm text-muted-foreground mb-4">
                        Choose something to watch together
                      </p>
                      <Button
                        onClick={() => setShowMediaLibrary(true)}
                        disabled={!currentMember?.canControl}
                      >
                        <VideoIcon className="h-4 w-4 mr-2" />
                        Browse Media
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            {/* Room Members */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <UsersIcon className="h-4 w-4" />
                  Members ({members.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="max-h-48">
                  <div className="space-y-2">
                    {members.map((member) => (
                      <div key={member.id} className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={member.user.image} />
                          <AvatarFallback>
                            {member.user.name?.slice(0, 2).toUpperCase() || 'U'}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {member.user.name}
                          </p>
                          <div className="flex gap-1">
                            {member.user.id === room.creator.id && (
                              <Badge variant="default" className="text-xs">Host</Badge>
                            )}
                            {member.canControl && member.user.id !== room.creator.id && (
                              <Badge variant="outline" className="text-xs">Control</Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            {/* Chat */}
            {room.allowChat && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <MessageSquareIcon className="h-4 w-4" />
                    Chat
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ScrollArea className="h-64">
                    <div id="chat-messages" className="space-y-2">
                      {messages.map((message) => (
                        <div key={message.id} className="text-sm">
                          {message.type === 'system' ? (
                            <div className="text-muted-foreground italic text-center">
                              {message.content}
                            </div>
                          ) : (
                            <div>
                              <span className="font-medium text-primary">
                                {message.user.name}:
                              </span>{' '}
                              <span>{message.content}</span>
                            </div>
                          )}
                        </div>
                      ))}
                      {messages.length === 0 && (
                        <div className="text-center text-muted-foreground text-xs py-8">
                          No messages yet
                        </div>
                      )}
                    </div>
                  </ScrollArea>

                  <form onSubmit={handleChatSubmit} className="flex gap-2">
                    <Input
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      placeholder="Type a message..."
                      className="text-sm"
                      maxLength={500}
                      disabled={!connected}
                    />
                    <Button 
                      type="submit" 
                      size="sm" 
                      disabled={!chatInput.trim() || !connected}
                    >
                      Send
                    </Button>
                  </form>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>

      {/* Media Library Modal */}
      {showMediaLibrary && (
        <div className="fixed inset-0 z-50 bg-background">
          <div className="flex flex-col h-full">
            <div className="border-b p-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">Select Media</h2>
                <Button
                  variant="ghost"
                  onClick={() => setShowMediaLibrary(false)}
                >
                  Close
                </Button>
              </div>
            </div>
            <div className="flex-1 overflow-hidden">
              <MediaLibrary
                onSelectMedia={handleMediaSelect}
                plexToken={plexStatus?.server?.token}
                plexUrl={plexStatus?.server?.url}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}