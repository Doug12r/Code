'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Textarea } from '@/components/ui/textarea'
import { 
  PlayIcon, 
  PauseIcon, 
  VolumeIcon,
  VolumeXIcon,
  MessageSquareIcon,
  UsersIcon,
  WifiIcon,
  WifiOffIcon,
  RefreshCwIcon as SyncIcon,
  SendIcon,
  MaximizeIcon,
  SkipBackIcon,
  SkipForwardIcon
} from 'lucide-react'
import { toast } from 'sonner'
import { useSocket } from '@/hooks/useSocket'

interface RealTimeTestProps {
  roomId?: string
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
  type: 'text' | 'system'
}

interface RoomMember {
  id: string
  name: string
  image?: string
  isActive: boolean
  canControl: boolean
}

interface RoomState {
  isPlaying: boolean
  position: number
  media?: {
    id: string
    title: string
    type: string
  }
  members: RoomMember[]
}

export function RealTimeTest({ roomId = 'test-room-123' }: RealTimeTestProps) {
  const { data: session } = useSession()
  
  // Socket connection
  const { 
    connected, 
    error, 
    socket,
    joinRoom,
    emitPlay,
    emitPause,
    emitSeek,
    emitChatMessage,
    requestSync
  } = useSocket({ roomId, autoConnect: true })

  // State management
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [roomState, setRoomState] = useState<RoomState>({
    isPlaying: false,
    position: 0,
    members: []
  })
  
  // Video simulation state
  const [currentTime, setCurrentTime] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [duration] = useState(300) // 5 minutes for testing
  
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  // Socket event listeners
  useEffect(() => {
    if (!socket) return

    // Room state events
    socket.on('room-state', (data) => {
      console.log('📊 Received room state:', data)
      setRoomState(data)
      setCurrentTime(data.position)
      setIsPlaying(data.isPlaying)
      toast.info('Room state synchronized')
    })

    // User events
    socket.on('user-joined', (data) => {
      console.log('👋 User joined:', data.user.name)
      toast.success(`${data.user.name} joined the room`)
    })

    socket.on('user-left', (data) => {
      console.log('👋 User left:', data.userId)
      toast.info('A user left the room')
    })

    // Media control events
    socket.on('play', (data) => {
      console.log('▶️ Received play event:', data)
      setCurrentTime(data.position)
      setIsPlaying(true)
      toast.info('Playback started by another user')
    })

    socket.on('pause', (data) => {
      console.log('⏸️ Received pause event:', data)
      setCurrentTime(data.position)
      setIsPlaying(false)
      toast.info('Playback paused by another user')
    })

    socket.on('seek', (data) => {
      console.log('⏭️ Received seek event:', data)
      setCurrentTime(data.position)
      toast.info(`Seek to ${formatTime(data.position)} by another user`)
    })

    // Chat events
    socket.on('new-chat-message', (data) => {
      console.log('💬 Received chat message:', data)
      setChatMessages(prev => [...prev, {
        ...data,
        type: data.type as 'text' | 'system'
      }])
      
      // Auto-scroll chat
      setTimeout(() => {
        const chatContainer = document.getElementById('chat-messages')
        if (chatContainer) {
          chatContainer.scrollTop = chatContainer.scrollHeight
        }
      }, 100)
    })

    // Sync response
    socket.on('sync-response', (data) => {
      console.log('🔄 Received sync response:', data)
      setCurrentTime(data.position)
      setIsPlaying(data.isPlaying)
      toast.success('Synchronized with server')
    })

    // Cleanup
    return () => {
      socket.off('room-state')
      socket.off('user-joined')
      socket.off('user-left')
      socket.off('play')
      socket.off('pause')
      socket.off('seek')
      socket.off('new-chat-message')
      socket.off('sync-response')
    }
  }, [socket])

  // Simulate video playback
  useEffect(() => {
    if (isPlaying) {
      intervalRef.current = setInterval(() => {
        setCurrentTime(prev => Math.min(prev + 1, duration))
      }, 1000)
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [isPlaying, duration])

  // Media control handlers
  const handlePlay = useCallback(() => {
    setIsPlaying(true)
    emitPlay(currentTime)
    toast.success('▶️ Play command sent')
  }, [currentTime, emitPlay])

  const handlePause = useCallback(() => {
    setIsPlaying(false)
    emitPause(currentTime)
    toast.success('⏸️ Pause command sent')
  }, [currentTime, emitPause])

  const handleSeek = useCallback((newTime: number) => {
    setCurrentTime(newTime)
    emitSeek(newTime)
    toast.success(`⏭️ Seek to ${formatTime(newTime)}`)
  }, [emitSeek])

  const handleSkipBack = () => {
    const newTime = Math.max(0, currentTime - 10)
    handleSeek(newTime)
  }

  const handleSkipForward = () => {
    const newTime = Math.min(duration, currentTime + 10)
    handleSeek(newTime)
  }

  // Chat handlers
  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!chatInput.trim()) return
    
    emitChatMessage(chatInput)
    setChatInput('')
    toast.success('💬 Message sent')
  }

  // Utility functions
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${String(secs).padStart(2, '0')}`
  }

  const getProgressPercentage = () => {
    return (currentTime / duration) * 100
  }

  return (
    <div className="w-full max-w-6xl mx-auto space-y-6 p-4">
      {/* Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <SyncIcon className="h-5 w-5" />
            Real-time Features Test
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                {connected ? (
                  <WifiIcon className="h-4 w-4 text-green-500" />
                ) : (
                  <WifiOffIcon className="h-4 w-4 text-red-500" />
                )}
                <Badge variant={connected ? 'default' : 'destructive'}>
                  {connected ? 'Connected' : 'Disconnected'}
                </Badge>
              </div>
              
              <Badge variant="outline">
                Room: {roomId}
              </Badge>

              {error && (
                <Badge variant="destructive">
                  Error: {error}
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button
                onClick={requestSync}
                size="sm"
                variant="outline"
                disabled={!connected}
              >
                <SyncIcon className="h-4 w-4 mr-1" />
                Sync
              </Button>

              <Badge variant="secondary">
                <UsersIcon className="h-3 w-3 mr-1" />
                {roomState.members.length} members
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Video Player Simulation */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Video Player Simulation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Fake video area */}
            <div className="aspect-video bg-gradient-to-br from-purple-600 to-blue-600 rounded-lg flex items-center justify-center text-white">
              <div className="text-center space-y-2">
                <div className="text-4xl font-bold">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </div>
                <div className="text-lg">
                  {isPlaying ? '▶️ Playing' : '⏸️ Paused'}
                </div>
                <div className="text-sm opacity-70">
                  Test Media File - Real-time Sync Test
                </div>
              </div>
            </div>

            {/* Progress bar */}
            <div className="space-y-2">
              <div className="w-full bg-gray-300 rounded-full h-2 dark:bg-gray-700">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${getProgressPercentage()}%` }}
                />
              </div>
              <input
                type="range"
                min="0"
                max={duration}
                value={currentTime}
                onChange={(e) => handleSeek(Number(e.target.value))}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
                disabled={!connected}
              />
            </div>

            {/* Controls */}
            <div className="flex items-center justify-center gap-4">
              <Button
                onClick={handleSkipBack}
                size="sm"
                variant="outline"
                disabled={!connected}
              >
                <SkipBackIcon className="h-4 w-4" />
              </Button>

              <Button
                onClick={isPlaying ? handlePause : handlePlay}
                size="lg"
                disabled={!connected}
              >
                {isPlaying ? (
                  <PauseIcon className="h-6 w-6" />
                ) : (
                  <PlayIcon className="h-6 w-6" />
                )}
              </Button>

              <Button
                onClick={handleSkipForward}
                size="sm"
                variant="outline"
                disabled={!connected}
              >
                <SkipForwardIcon className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Room Members */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UsersIcon className="h-4 w-4" />
                Room Members
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {session?.user && (
                  <div className="flex items-center gap-3 p-2 bg-muted rounded-lg">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={session.user.image || ''} />
                      <AvatarFallback>
                        {session.user.name?.slice(0, 2).toUpperCase() || 'YU'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <p className="text-sm font-medium">
                        {session.user.name} (You)
                      </p>
                    </div>
                    <Badge variant="default">Host</Badge>
                  </div>
                )}
                
                {roomState.members.filter(m => m.id !== session?.user?.id).map((member) => (
                  <div key={member.id} className="flex items-center gap-3">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={member.image || ''} />
                      <AvatarFallback>
                        {member.name.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <p className="text-sm font-medium">{member.name}</p>
                    </div>
                    {member.canControl && (
                      <Badge variant="outline" className="text-xs">Control</Badge>
                    )}
                  </div>
                ))}
                
                {roomState.members.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No other members in room
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Chat */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquareIcon className="h-4 w-4" />
                Chat
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div
                id="chat-messages"
                className="h-64 overflow-y-auto border rounded-lg p-3 space-y-2"
              >
                {chatMessages.map((msg) => (
                  <div key={msg.id} className="space-y-1">
                    {msg.type === 'system' ? (
                      <div className="text-xs text-muted-foreground text-center italic">
                        {msg.content}
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Avatar className="h-5 w-5">
                            <AvatarImage src={msg.user.image || ''} />
                            <AvatarFallback className="text-xs">
                              {msg.user.name.slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-xs font-medium text-primary">
                            {msg.user.name}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {new Date(msg.createdAt).toLocaleTimeString()}
                          </span>
                        </div>
                        <p className="text-sm ml-7">{msg.content}</p>
                      </div>
                    )}
                  </div>
                ))}
                
                {chatMessages.length === 0 && (
                  <div className="text-center text-muted-foreground text-xs py-8">
                    No messages yet. Start the conversation!
                  </div>
                )}
              </div>

              <form onSubmit={handleChatSubmit} className="flex gap-2">
                <Input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Type a message..."
                  className="flex-1"
                  maxLength={500}
                  disabled={!connected}
                />
                <Button 
                  type="submit" 
                  size="sm"
                  disabled={!chatInput.trim() || !connected}
                >
                  <SendIcon className="h-4 w-4" />
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}