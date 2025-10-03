'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { useSocket } from '@/hooks/useSocket'
import { toast } from 'sonner'
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
  SettingsIcon,
  MaximizeIcon,
  ClosedCaptionIcon
} from 'lucide-react'

interface SyncedVideoPlayerProps {
  roomId: string
  mediaUrl?: string
  mediaTitle?: string
  plexServerId?: string
  canControl?: boolean
}

interface RoomMember {
  id: string
  userId: string  
  username: string
  canControl: boolean
  isHost: boolean
  lastSeen: number
}

interface ChatMessage {
  id: string
  userId: string
  username: string
  message: string
  timestamp: number
  type: 'message' | 'system'
}

interface SyncState {
  currentTime: number
  isPlaying: boolean
  lastSync: number
  hostId: string
}

export function SyncedVideoPlayer({ 
  roomId, 
  mediaUrl, 
  mediaTitle,
  plexServerId,
  canControl = false 
}: SyncedVideoPlayerProps) {
  const { data: session } = useSession()
  
  // Video player refs and state
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(0.8)
  const [isMuted, setIsMuted] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [subtitlesEnabled, setSubtitlesEnabled] = useState(false)
  
  // Room and sync state
  const [members, setMembers] = useState<RoomMember[]>([])
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [showChat, setShowChat] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  const [syncState, setSyncState] = useState<SyncState | null>(null)
  const [lastSyncTime, setLastSyncTime] = useState(0)
  
  // Sync tolerance and buffering
  const [isBuffering, setIsBuffering] = useState(false)
  const [syncTolerance] = useState(2) // seconds
  const [isSeeking, setIsSeeking] = useState(false)

  // WebSocket/Socket.IO connection (simulated for now)
  useEffect(() => {
    // In real implementation, connect to Socket.IO server
    console.log(`Connecting to room ${roomId}...`)
    setIsConnected(true)
    
    // Simulate joining room
    if (session?.user) {
      const newMember: RoomMember = {
        id: `member_${Date.now()}`,
        userId: session.user.id,
        username: session.user.name || session.user.email || 'User',
        canControl,
        isHost: canControl, // Simplified for demo
        lastSeen: Date.now()
      }
      
      setMembers(prev => [...prev.filter(m => m.userId !== session.user.id), newMember])
      
      // Add system message
      const systemMessage: ChatMessage = {
        id: `msg_${Date.now()}`,
        userId: 'system',
        username: 'System',
        message: `${newMember.username} joined the room`,
        timestamp: Date.now(),
        type: 'system'
      }
      setChatMessages(prev => [...prev, systemMessage])
    }

    return () => {
      console.log(`Disconnecting from room ${roomId}...`)
      setIsConnected(false)
    }
  }, [roomId, session, canControl])

  // Video event handlers
  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration)
    }
  }

  const handleTimeUpdate = () => {
    if (videoRef.current && !isSeeking) {
      setCurrentTime(videoRef.current.currentTime)
    }
  }

  const handleWaiting = () => {
    setIsBuffering(true)
  }

  const handleCanPlay = () => {
    setIsBuffering(false)
  }

  // Playback controls
  const handlePlay = useCallback(() => {
    if (!canControl) {
      toast.error('Only users with control permissions can control playback')
      return
    }

    if (videoRef.current) {
      videoRef.current.play().catch(console.error)
      setIsPlaying(true)
      
      // Broadcast play event to other users
      const syncData = {
        currentTime: videoRef.current.currentTime,
        isPlaying: true,
        lastSync: Date.now(),
        hostId: session?.user?.id || ''
      }
      setSyncState(syncData)
      
      toast.info('▶️ Playback started')
    }
  }, [canControl, session])

  const handlePause = useCallback(() => {
    if (!canControl) {
      toast.error('Only users with control permissions can control playback')
      return
    }

    if (videoRef.current) {
      videoRef.current.pause()
      setIsPlaying(false)
      
      // Broadcast pause event to other users
      const syncData = {
        currentTime: videoRef.current.currentTime,
        isPlaying: false,
        lastSync: Date.now(),
        hostId: session?.user?.id || ''
      }
      setSyncState(syncData)
      
      toast.info('⏸️ Playback paused')
    }
  }, [canControl, session])

  const handleSeek = useCallback((newTime: number) => {
    if (!canControl) {
      toast.error('Only users with control permissions can seek')
      return
    }

    if (videoRef.current) {
      setIsSeeking(true)
      videoRef.current.currentTime = newTime
      setCurrentTime(newTime)
      
      // Broadcast seek event
      const syncData = {
        currentTime: newTime,
        isPlaying,
        lastSync: Date.now(),
        hostId: session?.user?.id || ''
      }
      setSyncState(syncData)
      
      toast.info(`⏭️ Seeking to ${formatTime(newTime)}`)
      
      setTimeout(() => setIsSeeking(false), 1000)
    }
  }, [canControl, isPlaying, session])

  // Volume controls
  const handleVolumeChange = (newVolume: number) => {
    setVolume(newVolume)
    setIsMuted(newVolume === 0)
    
    if (videoRef.current) {
      videoRef.current.volume = newVolume
      videoRef.current.muted = newVolume === 0
    }
  }

  const toggleMute = () => {
    if (videoRef.current) {
      const newMuted = !isMuted
      videoRef.current.muted = newMuted
      setIsMuted(newMuted)
      
      if (newMuted) {
        setVolume(0)
      } else {
        setVolume(0.8)
        videoRef.current.volume = 0.8
      }
    }
  }

  // Chat functionality
  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!chatInput.trim() || !session?.user) return
    
    const message: ChatMessage = {
      id: `msg_${Date.now()}_${session.user.id}`,
      userId: session.user.id,
      username: session.user.name || session.user.email || 'User',
      message: chatInput.trim(),
      timestamp: Date.now(),
      type: 'message'
    }
    
    setChatMessages(prev => [...prev, message])
    setChatInput('')
    
    // Auto-scroll chat
    setTimeout(() => {
      const chatContainer = document.getElementById('chat-messages')
      if (chatContainer) {
        chatContainer.scrollTop = chatContainer.scrollHeight
      }
    }, 100)
  }

  // Sync with other users (simulated)
  useEffect(() => {
    if (!syncState || !videoRef.current || isSeeking) return

    const timeDiff = Math.abs(syncState.currentTime - currentTime)
    const syncAge = Date.now() - syncState.lastSync

    // Only sync if the sync data is recent and there's a significant difference
    if (syncAge < 5000 && timeDiff > syncTolerance) {
      console.log(`🔄 Syncing video: ${timeDiff.toFixed(1)}s difference`)
      
      videoRef.current.currentTime = syncState.currentTime
      setCurrentTime(syncState.currentTime)
      
      if (syncState.isPlaying !== isPlaying) {
        if (syncState.isPlaying) {
          videoRef.current.play().catch(console.error)
        } else {
          videoRef.current.pause()
        }
        setIsPlaying(syncState.isPlaying)
      }
      
      setLastSyncTime(Date.now())
    }
  }, [syncState, currentTime, isPlaying, syncTolerance, isSeeking])

  // Utility functions
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${String(secs).padStart(2, '0')}`
  }

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      videoRef.current?.requestFullscreen()
    } else {
      document.exitFullscreen()
    }
  }

  const toggleSubtitles = () => {
    setSubtitlesEnabled(prev => {
      const newValue = !prev
      // Toggle the text tracks on the video element
      if (videoRef.current) {
        const tracks = videoRef.current.textTracks
        for (let i = 0; i < tracks.length; i++) {
          tracks[i].mode = newValue ? 'showing' : 'hidden'
        }
      }
      toast.success(`Subtitles ${newValue ? 'enabled' : 'disabled'}`)
      return newValue
    })
  }

  if (!mediaUrl) {
    return (
      <Card className="w-full max-w-4xl mx-auto">
        <CardContent className="flex flex-col items-center justify-center h-64">
          <div className="text-center space-y-4">
            <div className="h-16 w-16 mx-auto bg-muted rounded-lg flex items-center justify-center">
              <PlayIcon className="h-8 w-8 text-muted-foreground" />
            </div>
            <div>
              <h3 className="text-lg font-medium">No Media Selected</h3>
              <p className="text-sm text-muted-foreground">
                Choose a movie or TV show to start watching together
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="w-full max-w-7xl mx-auto space-y-4">
      {/* Status Bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            {isConnected ? (
              <WifiIcon className="h-4 w-4 text-green-500" />
            ) : (
              <WifiOffIcon className="h-4 w-4 text-red-500" />
            )}
            <Badge variant={isConnected ? 'default' : 'destructive'}>
              {isConnected ? 'Connected' : 'Disconnected'}
            </Badge>
          </div>
          
          {lastSyncTime > 0 && (
            <Badge variant="outline" className="text-blue-600">
              <SyncIcon className="h-3 w-3 mr-1" />
              Last sync: {Math.floor((Date.now() - lastSyncTime) / 1000)}s ago
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowChat(!showChat)}
          >
            <MessageSquareIcon className="h-4 w-4 mr-1" />
            Chat ({chatMessages.length})
          </Button>
          
          <Badge variant="outline">
            <UsersIcon className="h-3 w-3 mr-1" />
            {members.length} watching
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Video Player */}
        <Card className="lg:col-span-3">
          <CardContent className="p-0">
            <div className="relative bg-black rounded-lg overflow-hidden aspect-video">
              <video
                ref={videoRef}
                src={mediaUrl}
                className="w-full h-full object-contain"
                onLoadedMetadata={handleLoadedMetadata}
                onTimeUpdate={handleTimeUpdate}
                onWaiting={handleWaiting}
                onCanPlay={handleCanPlay}
                onEnded={() => setIsPlaying(false)}
                crossOrigin="anonymous"
              >
                {/* Subtitle tracks - these would come from Plex in a real implementation */}
                <track
                  kind="subtitles"
                  src="/api/subtitles/english.vtt"
                  srcLang="en"
                  label="English"
                  default={subtitlesEnabled}
                />
                <track
                  kind="subtitles"
                  src="/api/subtitles/spanish.vtt"
                  srcLang="es"
                  label="Spanish"
                />
              </video>
              
              {/* Loading Overlay */}
              {isBuffering && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
                </div>
              )}

              {/* Video Controls */}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-4">
                {/* Media Info */}
                {mediaTitle && (
                  <div className="mb-4">
                    <h3 className="text-white text-lg font-medium mb-1">{mediaTitle}</h3>
                    <div className="flex items-center gap-2 text-white/70 text-sm">
                      <span>{formatTime(currentTime)} / {formatTime(duration)}</span>
                      {!canControl && (
                        <Badge variant="secondary" className="text-xs">View Only</Badge>
                      )}
                    </div>
                  </div>
                )}

                {/* Progress Bar */}
                <div className="mb-4">
                  <input
                    type="range"
                    min={0}
                    max={duration}
                    value={currentTime}
                    onChange={(e) => handleSeek(Number(e.target.value))}
                    disabled={!canControl}
                    className="w-full h-2 bg-white/20 rounded-lg appearance-none cursor-pointer disabled:cursor-not-allowed"
                  />
                </div>

                {/* Control Buttons */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={isPlaying ? handlePause : handlePlay}
                      disabled={!canControl}
                      className="text-white hover:bg-white/20 disabled:text-white/50"
                    >
                      {isPlaying ? (
                        <PauseIcon className="h-5 w-5" />
                      ) : (
                        <PlayIcon className="h-5 w-5" />
                      )}
                    </Button>

                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={toggleMute}
                        className="text-white hover:bg-white/20"
                      >
                        {isMuted ? (
                          <VolumeXIcon className="h-4 w-4" />
                        ) : (
                          <VolumeIcon className="h-4 w-4" />
                        )}
                      </Button>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.1}
                        value={volume}
                        onChange={(e) => handleVolumeChange(Number(e.target.value))}
                        className="w-20 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={toggleSubtitles}
                      className={`text-white hover:bg-white/20 ${subtitlesEnabled ? 'bg-white/20' : ''}`}
                    >
                      <ClosedCaptionIcon className="h-4 w-4" />
                    </Button>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={toggleFullscreen}
                      className="text-white hover:bg-white/20"
                    >
                      <MaximizeIcon className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Room Members */}
          <Card>
            <CardContent className="p-4">
              <h4 className="font-medium mb-3 flex items-center gap-2">
                <UsersIcon className="h-4 w-4" />
                Room Members
              </h4>
              <div className="space-y-2">
                {members.map((member) => (
                  <div key={member.id} className="flex items-center gap-2">
                    <Avatar className="h-6 w-6">
                      <AvatarFallback className="text-xs">
                        {member.username.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="flex-1 text-sm">{member.username}</span>
                    {member.isHost && (
                      <Badge variant="default" className="text-xs">Host</Badge>
                    )}
                    {member.canControl && !member.isHost && (
                      <Badge variant="outline" className="text-xs">Control</Badge>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Chat */}
          {showChat && (
            <Card>
              <CardContent className="p-4">
                <h4 className="font-medium mb-3 flex items-center gap-2">
                  <MessageSquareIcon className="h-4 w-4" />
                  Chat
                </h4>
                
                <div className="h-48 mb-3 overflow-y-auto border rounded p-2">
                  <div id="chat-messages" className="space-y-2">
                    {chatMessages.map((msg) => (
                      <div key={msg.id} className="text-sm">
                        {msg.type === 'system' ? (
                          <div className="text-muted-foreground italic text-center">
                            {msg.message}
                          </div>
                        ) : (
                          <div>
                            <span className="font-medium text-primary">
                              {msg.username}:
                            </span>{' '}
                            <span>{msg.message}</span>
                          </div>
                        )}
                      </div>
                    ))}
                    {chatMessages.length === 0 && (
                      <div className="text-center text-muted-foreground text-xs py-4">
                        No messages yet
                      </div>
                    )}
                  </div>
                </div>
                
                <form onSubmit={handleChatSubmit} className="flex gap-2">
                  <Input
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Type a message..."
                    className="text-sm"
                    maxLength={500}
                  />
                  <Button type="submit" size="sm" disabled={!chatInput.trim()}>
                    Send
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}