/**
 * Enhanced Media Transcoding Service
 * Provides optimized transcoding with adaptive quality levels and hardware acceleration
 */

import { spawn, ChildProcess } from 'child_process'
import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'

export interface TranscodeProfile {
  id: string
  name: string
  width: number
  height: number
  videoBitrate: number // kbps
  audioBitrate: number // kbps
  fps: number
  videoCodec: 'h264' | 'h265' | 'vp9' | 'av1'
  audioCodec: 'aac' | 'opus' | 'mp3'
  preset: 'ultrafast' | 'superfast' | 'veryfast' | 'faster' | 'fast' | 'medium' | 'slow' | 'slower' | 'veryslow'
  crf?: number // Constant Rate Factor for quality-based encoding
}

export interface TranscodeOptions {
  inputPath: string
  outputPath: string
  profile: TranscodeProfile
  startTime?: number // seconds
  duration?: number // seconds
  hwAccel?: 'auto' | 'nvenc' | 'vaapi' | 'videotoolbox' | 'none'
  segmentDuration?: number // for HLS/DASH
  createSegments?: boolean
  onProgress?: (progress: TranscodeProgress) => void
  onComplete?: (result: TranscodeResult) => void
  onError?: (error: Error) => void
}

export interface TranscodeProgress {
  frame: number
  fps: number
  bitrate: string
  totalSize: string
  outTimeUs: number
  outTimeMs: number
  outTime: string
  dupFrames: number
  dropFrames: number
  speed: number
  progress: number // 0-100
}

export interface TranscodeResult {
  success: boolean
  outputPath: string
  fileSize: number
  duration: number
  error?: string
  stats?: {
    encodingTime: number
    averageFps: number
    finalBitrate: number
  }
}

export class EnhancedTranscodingService {
  private activeJobs = new Map<string, ChildProcess>()
  private jobProgress = new Map<string, TranscodeProgress>()
  
  // Optimized profiles for different quality levels
  private readonly TRANSCODE_PROFILES: Record<string, TranscodeProfile> = {
    '240p': {
      id: '240p',
      name: '240p Mobile',
      width: 426,
      height: 240,
      videoBitrate: 400,
      audioBitrate: 64,
      fps: 30,
      videoCodec: 'h264',
      audioCodec: 'aac',
      preset: 'fast',
      crf: 28
    },
    '360p': {
      id: '360p',
      name: '360p SD',
      width: 640,
      height: 360,
      videoBitrate: 800,
      audioBitrate: 96,
      fps: 30,
      videoCodec: 'h264',
      audioCodec: 'aac',
      preset: 'fast',
      crf: 26
    },
    '480p': {
      id: '480p',
      name: '480p SD',
      width: 854,
      height: 480,
      videoBitrate: 1200,
      audioBitrate: 128,
      fps: 30,
      videoCodec: 'h264',
      audioCodec: 'aac',
      preset: 'fast',
      crf: 24
    },
    '720p': {
      id: '720p',
      name: '720p HD',
      width: 1280,
      height: 720,
      videoBitrate: 2500,
      audioBitrate: 128,
      fps: 30,
      videoCodec: 'h264',
      audioCodec: 'aac',
      preset: 'fast',
      crf: 22
    },
    '1080p': {
      id: '1080p',
      name: '1080p Full HD',
      width: 1920,
      height: 1080,
      videoBitrate: 5000,
      audioBitrate: 192,
      fps: 30,
      videoCodec: 'h264',
      audioCodec: 'aac',
      preset: 'medium',
      crf: 20
    },
    '1440p': {
      id: '1440p',
      name: '1440p QHD',
      width: 2560,
      height: 1440,
      videoBitrate: 8000,
      audioBitrate: 192,
      fps: 30,
      videoCodec: 'h264',
      audioCodec: 'aac',
      preset: 'medium',
      crf: 18
    },
    '2160p': {
      id: '2160p',
      name: '4K UHD',
      width: 3840,
      height: 2160,
      videoBitrate: 15000,
      audioBitrate: 256,
      fps: 30,
      videoCodec: 'h265',
      audioCodec: 'aac',
      preset: 'slow',
      crf: 16
    }
  }

  constructor() {
    // Detect available hardware acceleration
    this.detectHardwareAcceleration()
  }

  /**
   * Transcode media file to specified profile
   */
  async transcode(options: TranscodeOptions): Promise<TranscodeResult> {
    const jobId = this.generateJobId()
    const startTime = Date.now()

    return new Promise((resolve, reject) => {
      try {
        const ffmpegArgs = this.buildFFmpegArgs(options)
        
        console.log(`🎬 Starting transcode job ${jobId}:`, {
          input: options.inputPath,
          output: options.outputPath,
          profile: options.profile.name
        })

        const ffmpeg = spawn('ffmpeg', ffmpegArgs)
        this.activeJobs.set(jobId, ffmpeg)

        let stderr = ''
        
        ffmpeg.stderr.on('data', (data) => {
          stderr += data.toString()
          const progress = this.parseFFmpegProgress(data.toString())
          
          if (progress) {
            this.jobProgress.set(jobId, progress)
            options.onProgress?.(progress)
          }
        })

        ffmpeg.on('close', async (code) => {
          this.activeJobs.delete(jobId)
          this.jobProgress.delete(jobId)
          
          const encodingTime = Date.now() - startTime

          if (code === 0) {
            try {
              const stats = await fs.stat(options.outputPath)
              const result: TranscodeResult = {
                success: true,
                outputPath: options.outputPath,
                fileSize: stats.size,
                duration: await this.getMediaDuration(options.outputPath),
                stats: {
                  encodingTime,
                  averageFps: 0, // Would need to parse from stderr
                  finalBitrate: options.profile.videoBitrate
                }
              }
              
              options.onComplete?.(result)
              resolve(result)
            } catch (error) {
              const errorResult: TranscodeResult = {
                success: false,
                outputPath: options.outputPath,
                fileSize: 0,
                duration: 0,
                error: `Failed to read output file: ${error}`
              }
              options.onError?.(new Error(errorResult.error))
              resolve(errorResult)
            }
          } else {
            const errorResult: TranscodeResult = {
              success: false,
              outputPath: options.outputPath,
              fileSize: 0,
              duration: 0,
              error: `FFmpeg exited with code ${code}. Error: ${stderr}`
            }
            options.onError?.(new Error(errorResult.error))
            resolve(errorResult)
          }
        })

        ffmpeg.on('error', (error) => {
          this.activeJobs.delete(jobId)
          this.jobProgress.delete(jobId)
          
          const errorResult: TranscodeResult = {
            success: false,
            outputPath: options.outputPath,
            fileSize: 0,
            duration: 0,
            error: `FFmpeg process error: ${error.message}`
          }
          options.onError?.(error)
          resolve(errorResult)
        })

      } catch (error) {
        const errorResult: TranscodeResult = {
          success: false,
          outputPath: options.outputPath,
          fileSize: 0,
          duration: 0,
          error: `Setup error: ${error}`
        }
        reject(errorResult)
      }
    })
  }

  /**
   * Create multiple quality versions of a media file
   */
  async transcodeMultipleQualities(
    inputPath: string,
    outputDir: string,
    qualities: string[] = ['480p', '720p', '1080p'],
    options: Partial<TranscodeOptions> = {}
  ): Promise<TranscodeResult[]> {
    const results: TranscodeResult[] = []
    
    // Ensure output directory exists
    await fs.mkdir(outputDir, { recursive: true })

    // Transcode each quality
    for (const qualityId of qualities) {
      const profile = this.TRANSCODE_PROFILES[qualityId]
      if (!profile) {
        console.warn(`Unknown quality profile: ${qualityId}`)
        continue
      }

      const outputPath = path.join(outputDir, `${qualityId}.mp4`)
      
      try {
        const result = await this.transcode({
          inputPath,
          outputPath,
          profile,
          ...options
        })
        
        results.push(result)
      } catch (error) {
        console.error(`Failed to transcode ${qualityId}:`, error)
        results.push({
          success: false,
          outputPath,
          fileSize: 0,
          duration: 0,
          error: `Failed to transcode ${qualityId}: ${error}`
        })
      }
    }

    return results
  }

  /**
   * Generate HLS segments for adaptive streaming
   */
  async generateHLS(
    inputPath: string,
    outputDir: string,
    qualities: string[] = ['480p', '720p', '1080p'],
    segmentDuration: number = 6
  ): Promise<{ success: boolean; masterPlaylist: string; error?: string }> {
    try {
      await fs.mkdir(outputDir, { recursive: true })
      
      const masterPlaylistLines: string[] = [
        '#EXTM3U',
        '#EXT-X-VERSION:3'
      ]

      // Generate segments for each quality
      for (const qualityId of qualities) {
        const profile = this.TRANSCODE_PROFILES[qualityId]
        if (!profile) continue

        const qualityDir = path.join(outputDir, qualityId)
        await fs.mkdir(qualityDir, { recursive: true })

        const playlistPath = path.join(qualityDir, 'playlist.m3u8')
        
        const result = await this.transcode({
          inputPath,
          outputPath: playlistPath,
          profile,
          createSegments: true,
          segmentDuration
        })

        if (result.success) {
          masterPlaylistLines.push(
            `#EXT-X-STREAM-INF:BANDWIDTH=${profile.videoBitrate * 1000},RESOLUTION=${profile.width}x${profile.height}`,
            `${qualityId}/playlist.m3u8`
          )
        }
      }

      const masterPlaylistPath = path.join(outputDir, 'master.m3u8')
      await fs.writeFile(masterPlaylistPath, masterPlaylistLines.join('\n'))

      return {
        success: true,
        masterPlaylist: masterPlaylistPath
      }
    } catch (error) {
      return {
        success: false,
        masterPlaylist: '',
        error: `HLS generation failed: ${error}`
      }
    }
  }

  /**
   * Cancel active transcode job
   */
  cancelJob(jobId: string): boolean {
    const job = this.activeJobs.get(jobId)
    if (job) {
      job.kill('SIGTERM')
      this.activeJobs.delete(jobId)
      this.jobProgress.delete(jobId)
      return true
    }
    return false
  }

  /**
   * Get progress for active job
   */
  getJobProgress(jobId: string): TranscodeProgress | null {
    return this.jobProgress.get(jobId) || null
  }

  /**
   * Get all active jobs
   */
  getActiveJobs(): string[] {
    return Array.from(this.activeJobs.keys())
  }

  private buildFFmpegArgs(options: TranscodeOptions): string[] {
    const { profile, inputPath, outputPath, startTime, duration, hwAccel, createSegments, segmentDuration } = options
    
    const args: string[] = []
    
    // Hardware acceleration
    if (hwAccel && hwAccel !== 'none') {
      if (hwAccel === 'auto') {
        args.push('-hwaccel', 'auto')
      } else {
        args.push('-hwaccel', hwAccel)
      }
    }

    // Input
    args.push('-i', inputPath)

    // Start time and duration
    if (startTime !== undefined) {
      args.push('-ss', startTime.toString())
    }
    if (duration !== undefined) {
      args.push('-t', duration.toString())
    }

    // Video settings
    args.push(
      '-c:v', this.getVideoEncoder(profile.videoCodec, hwAccel),
      '-s', `${profile.width}x${profile.height}`,
      '-r', profile.fps.toString(),
      '-preset', profile.preset
    )

    // Bitrate settings
    if (profile.crf) {
      args.push('-crf', profile.crf.toString())
    } else {
      args.push('-b:v', `${profile.videoBitrate}k`)
    }

    // Audio settings
    args.push(
      '-c:a', profile.audioCodec,
      '-b:a', `${profile.audioBitrate}k`,
      '-ac', '2'
    )

    // HLS/Segmented output
    if (createSegments) {
      args.push(
        '-f', 'hls',
        '-hls_time', (segmentDuration || 6).toString(),
        '-hls_list_size', '0',
        '-hls_segment_filename', path.join(path.dirname(outputPath), 'segment_%03d.ts')
      )
    }

    // General settings
    args.push(
      '-movflags', '+faststart', // For web streaming
      '-pix_fmt', 'yuv420p', // Compatibility
      '-y' // Overwrite output files
    )

    args.push(outputPath)

    return args
  }

  private getVideoEncoder(codec: string, hwAccel?: string): string {
    switch (codec) {
      case 'h264':
        if (hwAccel === 'nvenc') return 'h264_nvenc'
        if (hwAccel === 'vaapi') return 'h264_vaapi'
        if (hwAccel === 'videotoolbox') return 'h264_videotoolbox'
        return 'libx264'
      
      case 'h265':
        if (hwAccel === 'nvenc') return 'hevc_nvenc'
        if (hwAccel === 'vaapi') return 'hevc_vaapi'
        if (hwAccel === 'videotoolbox') return 'hevc_videotoolbox'
        return 'libx265'
      
      case 'vp9':
        return 'libvpx-vp9'
      
      case 'av1':
        return 'libaom-av1'
      
      default:
        return 'libx264'
    }
  }

  private parseFFmpegProgress(data: string): TranscodeProgress | null {
    // Parse FFmpeg progress from stderr
    const timeMatch = data.match(/time=(\d{2}):(\d{2}):(\d{2}\.\d{2})/)
    const fpsMatch = data.match(/fps=\s*(\d+(?:\.\d+)?)/)
    const bitrateMatch = data.match(/bitrate=\s*(\d+(?:\.\d+)?kbits\/s)/)
    const sizeMatch = data.match(/size=\s*(\d+kB)/)
    
    if (timeMatch) {
      const [, hours, minutes, seconds] = timeMatch
      const totalSeconds = parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseFloat(seconds)
      
      return {
        frame: 0,
        fps: fpsMatch ? parseFloat(fpsMatch[1]) : 0,
        bitrate: bitrateMatch ? bitrateMatch[1] : '0kbits/s',
        totalSize: sizeMatch ? sizeMatch[1] : '0kB',
        outTimeUs: totalSeconds * 1000000,
        outTimeMs: totalSeconds * 1000,
        outTime: timeMatch[0].replace('time=', ''),
        dupFrames: 0,
        dropFrames: 0,
        speed: 0,
        progress: 0 // Would need input duration to calculate
      }
    }
    
    return null
  }

  private async getMediaDuration(filePath: string): Promise<number> {
    return new Promise((resolve) => {
      const ffprobe = spawn('ffprobe', [
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_format',
        filePath
      ])

      let stdout = ''
      ffprobe.stdout.on('data', (data) => {
        stdout += data.toString()
      })

      ffprobe.on('close', () => {
        try {
          const info = JSON.parse(stdout)
          const duration = parseFloat(info.format?.duration || '0')
          resolve(duration)
        } catch {
          resolve(0)
        }
      })
    })
  }

  private async detectHardwareAcceleration(): Promise<string[]> {
    const available: string[] = []
    
    // This would detect available hardware acceleration
    // For now, return common ones based on platform
    switch (os.platform()) {
      case 'linux':
        available.push('vaapi')
        break
      case 'darwin':
        available.push('videotoolbox')
        break
      case 'win32':
        available.push('nvenc')
        break
    }
    
    return available
  }

  private generateJobId(): string {
    return `transcode_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }
}

// Singleton instance
export const transcodingService = new EnhancedTranscodingService()