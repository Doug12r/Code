'use client';

import { useEffect, useRef } from 'react';
import videojs from 'video.js';
import 'video.js/dist/video-js.css';

interface EnhancedVideoPlayerProps {
  src: string;
  onReady?: (player: any) => void;
  onError?: (error: any) => void;
  className?: string;
}

export default function EnhancedVideoPlayer({ 
  src, 
  onReady, 
  onError, 
  className = '' 
}: EnhancedVideoPlayerProps) {
  const videoRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);

  useEffect(() => {
    // Make sure Video.js player is only initialized once
    if (!playerRef.current) {
      const videoElement = document.createElement('video-js');
      videoElement.classList.add('vjs-default-skin');
      videoElement.setAttribute('controls', 'true');
      videoElement.setAttribute('preload', 'auto');
      videoElement.setAttribute('width', '100%');
      videoElement.setAttribute('height', '100%');
      videoElement.setAttribute('data-setup', '{}');
      
      if (videoRef.current) {
        videoRef.current.appendChild(videoElement);
        
        // Initialize Video.js player with enhanced options
        const player = playerRef.current = videojs(videoElement, {
          controls: true,
          responsive: true,
          fluid: true,
          playbackRates: [0.5, 1, 1.25, 1.5, 2],
          preload: 'auto',
          html5: {
            vhs: {
              enableLowInitialPlaylist: false,
              smoothQualityChange: false,
              overrideNative: true
            },
            nativeVideoTracks: false,
            nativeAudioTracks: false,
            nativeTextTracks: false
          },
          // Enhanced format support
          techOrder: ['html5'],
          sources: [{
            src: src,
            type: 'video/mp4' // This helps Video.js handle the stream better
          }]
        });

        player.ready(() => {
          console.log('✅ Video.js player ready');
          onReady?.(player);
        });

        player.on('error', (error: any) => {
          console.error('❌ Video.js error:', error);
          onError?.(error);
        });

        // Enhanced error handling for different scenarios
        player.on('loadstart', () => {
          console.log('📺 Video load started');
        });

        player.on('loadedmetadata', () => {
          console.log('✅ Video metadata loaded successfully');
        });

        player.on('canplay', () => {
          console.log('✅ Video can start playing');
        });

        player.on('waiting', () => {
          console.log('⏳ Video buffering...');
        });

        player.on('playing', () => {
          console.log('▶️ Video playing');
        });
      }
    }

    // Cleanup function
    return () => {
      const player = playerRef.current;
      if (player && !player.isDisposed()) {
        player.dispose();
        playerRef.current = null;
      }
    };
  }, []);

  // Update source when src changes
  useEffect(() => {
    const player = playerRef.current;
    if (player && !player.isDisposed()) {
      player.src({
        src: src,
        type: 'video/mp4'
      });
      console.log('📺 Updated video source:', src);
    }
  }, [src]);

  return (
    <div className={`enhanced-video-player ${className}`}>
      <div ref={videoRef} className="w-full h-full" />
    </div>
  );
}