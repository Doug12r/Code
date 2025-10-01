'use client';

import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  Play, 
  Pause, 
  Volume2, 
  VolumeX, 
  Maximize, 
  SkipBack, 
  SkipForward,
  Clock,
  Users,
  Share2
} from 'lucide-react';
import Image from 'next/image';

interface PlexMedia {
  ratingKey: string;
  key: string;
  title: string;
  summary?: string;
  year?: number;
  duration?: number;
  rating?: number;
  thumb?: string;
  art?: string;
  type: 'movie' | 'show' | 'episode';
  genre?: string[];
  studio?: string;
  addedAt?: number;
}

interface VideoPlayerProps {
  media: PlexMedia | null;
  plexUrl?: string;
  plexToken?: string;
  roomId?: string;
  isHost?: boolean;
  onClose: () => void;
}

export default function VideoPlayer({ 
  media, 
  plexUrl, 
  plexToken, 
  roomId, 
  isHost = false, 
  onClose 
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [streamUrl, setStreamUrl] = useState<string | null>(null);

  // Generate Plex streaming URL
  const getStreamUrl = (media: PlexMedia) => {
    if (!plexUrl || !plexToken) return null;
    
    // For Plex streaming, we use the transcode endpoint
    // This ensures compatibility across different formats and devices
    const baseUrl = plexUrl.replace(/\/$/, '');
    const params = new URLSearchParams({
      'X-Plex-Token': plexToken,
      'path': media.key,
      'mediaIndex': '0',
      'partIndex': '0',
      'protocol': 'http',
      'videoCodec': 'h264',
      'audioCodec': 'aac',
      'maxVideoBitrate': '4000',
      'videoResolution': '1920x1080',
      'directPlay': '0',
      'directStream': '1'
    });
    
    return `${baseUrl}/video/:/transcode/universal/start.m3u8?${params.toString()}`;
  };

  // Format duration for display
  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  // Format file size/quality info
  const getMediaInfo = () => {
    if (!media) return '';
    const info = [];
    if (media.year) info.push(media.year.toString());
    if (media.duration) {
      const minutes = Math.round((media.duration || 0) / 60000);
      const hours = Math.floor(minutes / 60);
      const remainingMinutes = minutes % 60;
      if (hours > 0) {
        info.push(`${hours}h ${remainingMinutes}m`);
      } else {
        info.push(`${minutes}m`);
      }
    }
    return info.join(' • ');
  };

  // Initialize video player when media changes
  useEffect(() => {
    if (media && plexUrl && plexToken) {
      setLoading(true);
      setError(null);
      
      const url = getStreamUrl(media);
      if (url) {
        setStreamUrl(url);
      } else {
        setError('Unable to generate streaming URL');
        setLoading(false);
      }
    }
  }, [media, plexUrl, plexToken]);

  // Video event handlers
  const handleLoadedData = () => {
    setLoading(false);
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handlePlay = () => {
    setIsPlaying(true);
  };

  const handlePause = () => {
    setIsPlaying(false);
  };

  const handleError = () => {
    setError('Failed to load video. Please check your Plex server connection.');
    setLoading(false);
  };

  // Control functions
  const togglePlayPause = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
    }
  };

  const handleSeek = (newTime: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
  };

  const toggleMute = () => {
    if (videoRef.current) {
      const newMuted = !isMuted;
      videoRef.current.muted = newMuted;
      setIsMuted(newMuted);
    }
  };

  const handleVolumeChange = (newVolume: number) => {
    if (videoRef.current) {
      videoRef.current.volume = newVolume;
      setVolume(newVolume);
      setIsMuted(newVolume === 0);
    }
  };

  const skipBack = () => {
    if (videoRef.current) {
      videoRef.current.currentTime = Math.max(0, currentTime - 10);
    }
  };

  const skipForward = () => {
    if (videoRef.current) {
      videoRef.current.currentTime = Math.min(duration, currentTime + 10);
    }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      videoRef.current?.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  const shareToRoom = async () => {
    if (!roomId || !media) return;
    
    try {
      const response = await fetch('/api/rooms/share-media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId,
          media: {
            ratingKey: media.ratingKey,
            title: media.title,
            type: media.type,
            thumb: media.thumb,
            currentTime: currentTime
          }
        })
      });
      
      if (response.ok) {
        // Handle success (could show toast notification)
        console.log('Media shared to room successfully');
      }
    } catch (error) {
      console.error('Failed to share media to room:', error);
    }
  };

  if (!media) {
    return (
      <Card className="w-full max-w-4xl mx-auto">
        <CardContent className="flex items-center justify-center py-12">
          <div className="text-center text-muted-foreground">
            <Play className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Select a media item to start watching</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="w-full max-w-6xl mx-auto space-y-4">
      {/* Video Player Container */}
      <Card className="relative overflow-hidden">
        <div className="relative aspect-video bg-black">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center text-white">
              <div className="text-center">
                <div className="animate-spin h-8 w-8 border-2 border-white border-t-transparent rounded-full mx-auto mb-2"></div>
                <p>Loading video...</p>
              </div>
            </div>
          )}
          
          {error && (
            <div className="absolute inset-0 flex items-center justify-center text-white">
              <div className="text-center">
                <p className="text-red-400 mb-4">{error}</p>
                <Button onClick={onClose} variant="outline">
                  Close Player
                </Button>
              </div>
            </div>
          )}
          
          {streamUrl && !error && (
            <video
              ref={videoRef}
              src={streamUrl}
              className="w-full h-full object-contain"
              onLoadedData={handleLoadedData}
              onTimeUpdate={handleTimeUpdate}
              onPlay={handlePlay}
              onPause={handlePause}
              onError={handleError}
              crossOrigin="anonymous"
            />
          )}
          
          {/* Video Controls Overlay */}
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
            {/* Progress Bar */}
            <div className="mb-4">
              <div className="flex items-center gap-2 text-white text-sm mb-2">
                <span>{formatTime(currentTime)}</span>
                <div className="flex-1 bg-white/20 rounded-full h-1 cursor-pointer"
                     onClick={(e) => {
                       const rect = e.currentTarget.getBoundingClientRect();
                       const progress = (e.clientX - rect.left) / rect.width;
                       handleSeek(progress * duration);
                     }}>
                  <div 
                    className="bg-white h-1 rounded-full transition-all"
                    style={{ width: `${(currentTime / duration) * 100}%` }}
                  />
                </div>
                <span>{formatTime(duration)}</span>
              </div>
            </div>
            
            {/* Control Buttons */}
            <div className="flex items-center justify-between text-white">
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={skipBack}
                  className="text-white hover:bg-white/20"
                >
                  <SkipBack className="h-4 w-4" />
                </Button>
                
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={togglePlayPause}
                  className="text-white hover:bg-white/20"
                >
                  {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
                </Button>
                
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={skipForward}
                  className="text-white hover:bg-white/20"
                >
                  <SkipForward className="h-4 w-4" />
                </Button>
                
                <div className="flex items-center gap-2 ml-4">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={toggleMute}
                    className="text-white hover:bg-white/20"
                  >
                    {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                  </Button>
                  
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={isMuted ? 0 : volume}
                    onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                    className="w-20 accent-white"
                  />
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                {roomId && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={shareToRoom}
                    className="text-white hover:bg-white/20 gap-1"
                    title="Share with room"
                  >
                    <Share2 className="h-4 w-4" />
                    <Users className="h-4 w-4" />
                  </Button>
                )}
                
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={toggleFullscreen}
                  className="text-white hover:bg-white/20"
                >
                  <Maximize className="h-4 w-4" />
                </Button>
                
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={onClose}
                  className="text-white hover:bg-white/20"
                >
                  ✕
                </Button>
              </div>
            </div>
          </div>
        </div>
      </Card>
      
      {/* Media Information */}
      <Card>
        <CardHeader>
          <div className="flex items-start gap-4">
            {media.thumb && plexUrl && plexToken && (
              <div className="relative w-24 h-36 flex-shrink-0">
                <Image
                  src={`${plexUrl}${media.thumb}?X-Plex-Token=${plexToken}`}
                  alt={media.title}
                  fill
                  className="object-cover rounded"
                  unoptimized={true}
                />
              </div>
            )}
            
            <div className="flex-1">
              <CardTitle className="flex items-center gap-2 mb-2">
                {media.title}
                {media.type === 'movie' && <Badge variant="secondary">Movie</Badge>}
                {media.type === 'show' && <Badge variant="secondary">TV Show</Badge>}
                {media.type === 'episode' && <Badge variant="secondary">Episode</Badge>}
              </CardTitle>
              
              {getMediaInfo() && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                  <Clock className="h-4 w-4" />
                  {getMediaInfo()}
                </div>
              )}
              
              {media.genre && media.genre.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-2">
                  {media.genre.slice(0, 3).map((genre, index) => (
                    <Badge key={index} variant="outline" className="text-xs">
                      {genre}
                    </Badge>
                  ))}
                </div>
              )}
              
              {media.summary && (
                <p className="text-sm text-muted-foreground line-clamp-3">
                  {media.summary}
                </p>
              )}
              
              {roomId && isHost && (
                <div className="flex items-center gap-2 mt-3">
                  <Badge variant="default" className="gap-1">
                    <Users className="h-3 w-3" />
                    Room Host
                  </Badge>
                  <p className="text-xs text-muted-foreground">
                    Your playback controls will sync with room members
                  </p>
                </div>
              )}
              
              {roomId && !isHost && (
                <div className="flex items-center gap-2 mt-3">
                  <Badge variant="secondary" className="gap-1">
                    <Users className="h-3 w-3" />
                    Watching Together
                  </Badge>
                  <p className="text-xs text-muted-foreground">
                    Synced with room host
                  </p>
                </div>
              )}
            </div>
          </div>
        </CardHeader>
      </Card>
    </div>
  );
}