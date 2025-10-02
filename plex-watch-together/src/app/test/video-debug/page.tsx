'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import VideoPlayer from '@/components/video-player'

export default function VideoDebugPage() {
  const [plexData, setPlexData] = useState<any>(null)
  const [testVideo, setTestVideo] = useState<any>(null)
  const [showPlayer, setShowPlayer] = useState(false)

  useEffect(() => {
    // Get Plex setup data
    fetch('/api/plex/setup')
      .then(r => r.json())
      .then(data => {
        console.log('Plex setup data:', data)
        setPlexData(data)
      })
      .catch(err => console.error('Failed to get Plex setup:', err))

    // Get a test video from library
    fetch('/api/plex/libraries/1/media')
      .then(r => r.json())
      .then(data => {
        console.log('Library data:', data)
        if (data.success && data.media?.length > 0) {
          setTestVideo(data.media[0])
        }
      })
      .catch(err => console.error('Failed to get library:', err))
  }, [])

  const testVideoProxy = async () => {
    if (!testVideo) return
    
    const key = testVideo.key || `/library/metadata/${testVideo.ratingKey}`
    const proxyUrl = `/api/video/proxy?key=${encodeURIComponent(key)}`
    
    console.log('Testing video proxy with:', { key, proxyUrl, testVideo })
    
    try {
      const response = await fetch(proxyUrl)
      console.log('Video proxy response:', {
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        contentType: response.headers.get('content-type')
      })
      
      if (!response.ok) {
        const text = await response.text()
        console.error('Video proxy error:', text)
      }
    } catch (err) {
      console.error('Video proxy fetch error:', err)
    }
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <h1 className="text-3xl font-bold">Video Debug Page</h1>
      
      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Plex Setup Data</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="bg-gray-100 p-4 rounded text-sm overflow-auto">
              {JSON.stringify(plexData, null, 2)}
            </pre>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Test Video Data</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="bg-gray-100 p-4 rounded text-sm overflow-auto">
              {JSON.stringify(testVideo, null, 2)}
            </pre>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Video Proxy Test</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button onClick={testVideoProxy} disabled={!testVideo}>
              Test Video Proxy Endpoint
            </Button>
            
            <Button 
              onClick={() => setShowPlayer(!showPlayer)} 
              disabled={!plexData || !testVideo}
            >
              {showPlayer ? 'Hide' : 'Show'} Video Player
            </Button>
          </CardContent>
        </Card>

        {showPlayer && plexData && testVideo && (
          <Card>
            <CardHeader>
              <CardTitle>Video Player Test</CardTitle>
            </CardHeader>
            <CardContent>
              <VideoPlayer
                media={testVideo}
                plexUrl={plexData.plexUrl}
                plexToken={plexData.plexToken}
                onClose={() => setShowPlayer(false)}
              />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}