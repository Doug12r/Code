import { spawn, ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';

const access = promisify(fs.access);

export interface TranscodeOptions {
  inputPath: string;
  outputFormat: 'mp4' | 'webm';
  quality?: 'low' | 'medium' | 'high';
  maxWidth?: number;
  maxHeight?: number;
}

export interface TranscodeProgress {
  percent: number;
  fps: number;
  speed: number;
  time: string;
}

export class VideoTranscoder {
  private static activeTranscodes = new Map<string, ChildProcess>();
  private static sessionInfo = new Map<string, {
    startTime: number;
    inputPath: string;
    outputFormat: string;
    lastActivity: number;
  }>();

  /**
   * Get active transcoding sessions info
   */
  static getActiveTranscodes(): Array<{
    sessionId: string;
    inputPath: string;
    outputFormat: string;
    duration: number;
    lastActivity: number;
  }> {
    const sessions: Array<any> = [];
    for (const [sessionId, info] of VideoTranscoder.sessionInfo.entries()) {
      sessions.push({
        sessionId,
        inputPath: info.inputPath,
        outputFormat: info.outputFormat,
        duration: Date.now() - info.startTime,
        lastActivity: info.lastActivity
      });
    }
    return sessions;
  }

  /**
   * Update session activity timestamp
   */
  static updateSessionActivity(sessionId: string): void {
    const info = VideoTranscoder.sessionInfo.get(sessionId);
    if (info) {
      info.lastActivity = Date.now();
    }
  }

  /**
   * Check if FFmpeg is available
   */
  static async isFFmpegAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      const ffmpeg = spawn('ffmpeg', ['-version']);
      ffmpeg.on('error', () => resolve(false));
      ffmpeg.on('close', (code) => resolve(code === 0));
    });
  }

  /**
   * Get video file information using FFprobe
   */
  static async getVideoInfo(filePath: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const ffprobe = spawn('ffprobe', [
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_format',
        '-show_streams',
        filePath
      ]);

      let output = '';
      ffprobe.stdout.on('data', (data) => {
        output += data.toString();
      });

      ffprobe.on('close', (code) => {
        if (code === 0) {
          try {
            const info = JSON.parse(output);
            resolve(info);
          } catch (error) {
            reject(new Error(`Failed to parse ffprobe output: ${error}`));
          }
        } else {
          reject(new Error(`FFprobe failed with code ${code}`));
        }
      });

      ffprobe.on('error', reject);
    });
  }

  /**
   * Check if video format is web-compatible
   */
  static async isWebCompatible(filePath: string): Promise<boolean> {
    try {
      const info = await VideoTranscoder.getVideoInfo(filePath);
      const videoStream = info.streams.find((stream: any) => stream.codec_type === 'video');
      const audioStream = info.streams.find((stream: any) => stream.codec_type === 'audio');

      if (!videoStream) return false;

      // Check if codecs are web-compatible
      const webCompatibleVideo = ['h264', 'vp8', 'vp9', 'av01'].includes(videoStream.codec_name);
      const webCompatibleAudio = !audioStream || ['aac', 'mp3', 'opus', 'vorbis'].includes(audioStream.codec_name);
      
      // Check container format
      const format = info.format?.format_name?.toLowerCase() || '';
      const webCompatibleContainer = format.includes('mp4') || format.includes('webm') || format.includes('ogg');

      return webCompatibleVideo && webCompatibleAudio && webCompatibleContainer;
    } catch (error) {
      console.error('Error checking video compatibility:', error);
      return false;
    }
  }

  /**
   * Create streaming transcode process
   */
  static createStreamingTranscode(options: TranscodeOptions, sessionId?: string): ChildProcess {
    const { inputPath, outputFormat, quality = 'medium', maxWidth = 1920, maxHeight = 1080 } = options;
    const actualSessionId = sessionId || `transcode-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;

    // Build FFmpeg arguments for streaming
    const args = [
      '-i', inputPath,
      '-f', outputFormat === 'mp4' ? 'mp4' : 'webm',
    ];

    // Video codec and quality settings
    if (outputFormat === 'mp4') {
      args.push(
        '-c:v', 'libx264',
        '-preset', quality === 'high' ? 'slow' : quality === 'medium' ? 'medium' : 'fast',
        '-crf', quality === 'high' ? '18' : quality === 'medium' ? '23' : '28'
      );
    } else {
      args.push(
        '-c:v', 'libvpx-vp9',
        '-crf', quality === 'high' ? '30' : quality === 'medium' ? '32' : '36',
        '-b:v', '0'
      );
    }

    // Audio codec
    args.push(
      '-c:a', outputFormat === 'mp4' ? 'aac' : 'opus',
      '-b:a', '128k'
    );

    // Scale video if needed
    args.push('-vf', `scale='min(${maxWidth},iw)':'min(${maxHeight},ih)':force_original_aspect_ratio=decrease`);

    // Streaming optimizations
    args.push(
      '-movflags', outputFormat === 'mp4' ? 'frag_keyframe+empty_moov+faststart' : 'frag_keyframe+empty_moov',
      '-g', '30', // GOP size for seeking
      '-keyint_min', '30',
      '-sc_threshold', '0',
      '-threads', '0', // Use all available cores
      'pipe:1' // Output to stdout
    );

    console.log(`🎬 Starting FFmpeg transcoding with args: ${args.join(' ')} (session: ${actualSessionId})`);

    const ffmpeg = spawn('ffmpeg', args, {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    // Track this session
    VideoTranscoder.activeTranscodes.set(actualSessionId, ffmpeg);
    VideoTranscoder.sessionInfo.set(actualSessionId, {
      startTime: Date.now(),
      inputPath,
      outputFormat,
      lastActivity: Date.now()
    });

    // Log transcoding progress
    ffmpeg.stderr.on('data', (data) => {
      const progress = data.toString();
      if (progress.includes('frame=')) {
        console.log(`🎞️ Transcoding progress [${actualSessionId}]: ${progress.trim()}`);
        VideoTranscoder.updateSessionActivity(actualSessionId);
      }
    });

    ffmpeg.on('error', (error) => {
      console.error(`🚨 FFmpeg error [${actualSessionId}]:`, error);
      VideoTranscoder.activeTranscodes.delete(actualSessionId);
      VideoTranscoder.sessionInfo.delete(actualSessionId);
    });

    ffmpeg.on('close', (code) => {
      console.log(`🎬 FFmpeg process closed with code ${code} (session: ${actualSessionId})`);
      VideoTranscoder.activeTranscodes.delete(actualSessionId);
      VideoTranscoder.sessionInfo.delete(actualSessionId);
    });

    return ffmpeg;
  }

  /**
   * Stop active transcode process
   */
  static stopTranscode(key: string): void {
    const process = VideoTranscoder.activeTranscodes.get(key);
    if (process && !process.killed) {
      console.log(`🛑 Manually stopping transcoding session: ${key}`);
      process.kill('SIGTERM');
      VideoTranscoder.activeTranscodes.delete(key);
      VideoTranscoder.sessionInfo.delete(key);
    }
  }

  /**
   * Clean up all active transcodes
   */
  static cleanupAll(): void {
    console.log(`🧹 Cleaning up ${VideoTranscoder.activeTranscodes.size} active transcoding sessions`);
    for (const [key, process] of VideoTranscoder.activeTranscodes.entries()) {
      if (!process.killed) {
        process.kill('SIGTERM');
      }
    }
    VideoTranscoder.activeTranscodes.clear();
    VideoTranscoder.sessionInfo.clear();
  }

  /**
   * Get the best output format for the client
   */
  static getBestOutputFormat(userAgent?: string): 'mp4' | 'webm' {
    if (!userAgent) return 'mp4';
    
    const ua = userAgent.toLowerCase();
    
    // Chrome and Firefox support both, but WebM might be more efficient
    if (ua.includes('chrome') && !ua.includes('edge')) {
      return 'webm';
    }
    
    // Safari and Edge prefer MP4
    if (ua.includes('safari') || ua.includes('edge')) {
      return 'mp4';
    }
    
    // Default to MP4 for maximum compatibility
    return 'mp4';
  }
}

// Clean up on process exit
process.on('exit', () => {
  VideoTranscoder.cleanupAll();
});

process.on('SIGINT', () => {
  VideoTranscoder.cleanupAll();
  process.exit(0);
});

process.on('SIGTERM', () => {
  VideoTranscoder.cleanupAll();
  process.exit(0);
});