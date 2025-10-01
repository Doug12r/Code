import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { PlexAPI } from '@/lib/plex-api'
import { z } from 'zod'

const setupPlexSchema = z.object({
  serverUrl: z.string().url('Invalid server URL'),
  claimToken: z.string().optional(),
  manualToken: z.string().optional(),
}).refine(data => data.claimToken || data.manualToken, {
  message: "Either claim token or manual token is required"
})

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { serverUrl, claimToken, manualToken } = setupPlexSchema.parse(body)

      // Clean up the server URL
      const cleanServerUrl = serverUrl.replace(/\/$/, '')

      let plexToken: string
      let plexUser: any

      try {
        if (manualToken) {
          // Use manual token directly
          plexToken = manualToken
          plexUser = { username: 'Manual Setup', title: 'Manual Setup' }
          console.log('Using manual Plex token')
        } else if (claimToken) {
          // Authenticate with Plex.tv using the claim token
          const authResult = await PlexAPI.authenticateWithClaim(claimToken)
          plexToken = authResult.token
          plexUser = authResult.user
          console.log('Authenticated with claim token')
        } else {
          throw new Error('No authentication method provided')
        }
        
        // Test connection to the server - comprehensive Plex server URL variations
        const hostname = cleanServerUrl.replace(/^https?:\/\//, '').replace(/:\d+$/, '')
        const serverUrlsToTry = [
          // Standard Plex configurations
          `https://${hostname}:32400`,
          `http://${hostname}:32400`, 
          cleanServerUrl, // User's original URL
          `https://${hostname}:443`,
          `http://${hostname}:80`,
          `https://${hostname}`,
          `http://${hostname}`,
          // DuckDNS specific fallbacks
          ...(hostname.includes('duckdns.org') ? [
            `https://${hostname}:8920`, // Alternative Plex port
            `http://${hostname}:8920`,
            `https://${hostname}:9090`, // Another common port
            `http://${hostname}:9090`
          ] : [])
        ].filter((url, index, arr) => arr.indexOf(url) === index) // Remove duplicates
        
        let workingApi: PlexAPI | null = null
        let workingUrl = ''
        let connectionError = ''
        let partialConnection = false
        let testResults: Array<{url: string, success: boolean, error?: string}> = []

        console.log(`Testing ${serverUrlsToTry.length} different URL configurations...`)

        for (const testUrl of serverUrlsToTry) {
          try {
            console.log(`Testing Plex connection to: ${testUrl}`)
            const testApi = new PlexAPI(testUrl, plexToken)
            
            // Try a quick connection test with shorter timeout for faster iteration
            const basicConnection = await testApi.testConnection(true)
            if (!basicConnection) {
              console.log(`Basic connection failed for ${testUrl}`)
              testResults.push({url: testUrl, success: false, error: 'Basic connection failed'})
              continue
            }

            console.log(`Basic connection successful for ${testUrl}, testing API access...`)
            
            // Try to get libraries - this is what we actually need
            try {
              const libraries = await testApi.getLibraries()
              workingApi = testApi
              workingUrl = testUrl
              console.log(`Full API access successful for: ${testUrl} (${libraries.length} libraries found)`)
              testResults.push({url: testUrl, success: true})
              break
            } catch (libraryError) {
              console.log(`Library access failed for ${testUrl}, but basic connection works`)
              testResults.push({url: testUrl, success: false, error: 'Library access failed'})
              // Store this as a partial connection in case we can't find a better one
              if (!partialConnection) {
                workingApi = testApi
                workingUrl = testUrl
                partialConnection = true
              }
              continue
            }
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown connection error'
            console.log(`Failed to connect to ${testUrl}:`, errorMsg)
            testResults.push({url: testUrl, success: false, error: errorMsg})
            connectionError = errorMsg
            continue
          }
        }
        
        console.log('Connection test summary:')
        testResults.forEach(result => {
          console.log(`  ${result.url}: ${result.success ? 'SUCCESS' : 'FAILED'} ${result.error ? `(${result.error})` : ''}`)
        })
        
        if (!workingApi) {
          const failureAnalysis = testResults.filter(r => !r.success)
          const timeoutErrors = failureAnalysis.filter(r => r.error?.includes('timeout')).length
          const connectionRefused = failureAnalysis.filter(r => r.error?.includes('ECONNREFUSED')).length
          const dnsErrors = failureAnalysis.filter(r => r.error?.includes('EAI_AGAIN')).length
          
          let helpfulError = 'Could not connect to Plex server from webapp. '
          
          if (dnsErrors > 0) {
            helpfulError += 'DNS resolution issues detected. Try: 1) Check DuckDNS status, 2) Use direct IP address instead of hostname, 3) Verify DNS settings.'
          } else if (connectionRefused > 0) {
            helpfulError += 'Connection refused errors suggest: 1) Plex server may not be on expected port (try :32400), 2) Firewall blocking connections, 3) Network routing issues.'
          } else if (timeoutErrors > 0) {
            helpfulError += 'Connection timeouts suggest: 1) Server overloaded, 2) Network path issues, 3) Port forwarding problems.'
          } else {
            helpfulError += `Last error: ${connectionError}. Since you can use Plex normally, this suggests network/routing differences between your direct access and the webapp server.`
          }
          
          return NextResponse.json(
            { 
              error: helpfulError,
              testResults: testResults,
              suggestions: [
                'Try using your Plex server\'s local IP address instead of DuckDNS',
                'Check if port 32400 is properly forwarded',
                'Verify webapp server can reach your network',
                'Consider using Plex\'s remote access features'
              ]
            },
            { status: 400 }
          )
        }      // Try to get libraries and server info, but allow partial success
      let libraries: any[] = []
      let serverInfo = {
        name: 'Plex Server',
        version: 'Unknown',
        machineIdentifier: 'unknown'
      }

      // Get server identity first (usually more reliable)
      try {
        const identity = await workingApi.getServerIdentity()
        if (identity) {
          serverInfo = identity
        }
      } catch (error) {
        console.log('Could not get server identity:', error)
      }

      // Try to get libraries with extended timeout for initial setup
      try {
        libraries = await workingApi.getLibraries()
        console.log(`Found ${libraries.length} libraries`)
      } catch (error) {
        console.log('Could not get libraries during setup:', error)
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        if (errorMessage.includes('DNS resolution')) {
          console.log('DNS resolution issues detected, but connection was established')
        }
        // This is ok - we can still store the connection for later use
      }

      // Encrypt the Plex token before storing (in production, use proper encryption)
      const encryptedToken = Buffer.from(plexToken).toString('base64')

      // Update user with Plex credentials
      await prisma.user.update({
        where: { id: session.user.id },
        data: {
          plexUsername: plexUser.username || plexUser.title,
          plexToken: encryptedToken,
          plexServerId: serverInfo.machineIdentifier,
          plexUrl: workingUrl, // Store the working URL
        }
      })

      return NextResponse.json({
        message: 'Plex server connected successfully',
        server: {
          name: serverInfo.name,
          version: serverInfo.version,
          url: workingUrl,
          libraries: libraries.length,
          libraryTypes: libraries.map(lib => lib.type),
        },
        user: {
          username: plexUser.username || plexUser.title,
          email: plexUser.email,
        }
      })

    } catch (plexError) {
      console.error('Plex connection error:', plexError)
      
      const errorMessage = plexError instanceof Error ? plexError.message : 'Unknown error'
      
      if (errorMessage.includes('claim') || errorMessage.includes('token')) {
        return NextResponse.json(
          { error: 'Invalid or expired claim token. Please get a new one from plex.tv/claim' },
          { status: 400 }
        )
      }
      
      return NextResponse.json(
        { error: 'Failed to connect to Plex server. Check your server URL and network connection.' },
        { status: 400 }
      )
    }

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.issues },
        { status: 400 }
      )
    }

    console.error('Plex setup error:', error)
    return NextResponse.json(
      { error: 'Failed to setup Plex integration' },
      { status: 500 }
    )
  }
}

// Get current Plex status
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        plexUsername: true,
        plexToken: true,
        plexServerId: true,
        plexUrl: true,
      }
    })

    if (!user?.plexToken) {
      return NextResponse.json({ 
        connected: false,
        message: 'No Plex server connected'
      })
    }

    // Decrypt the token
    const plexToken = Buffer.from(user.plexToken, 'base64').toString()

    // Test connection
    try {
      // Use stored URL first, then fallback to trying different URLs
      const serverUrls = user.plexUrl ? [user.plexUrl] : [
        'https://douglinux.duckdns.org:443',
        'http://douglinux.duckdns.org:80'
      ]
      
      let workingUrl = null
      let plexApi = null
      
      for (const url of serverUrls) {
        try {
          plexApi = new PlexAPI(url, plexToken)
          await plexApi.getLibraries()
          workingUrl = url
          break
        } catch (e) {
          console.error(`Failed to connect to ${url}:`, e)
          continue
        }
      }

      if (!workingUrl || !plexApi) {
        return NextResponse.json({
          connected: false,
          error: 'Cannot connect to Plex server'
        })
      }

      const libraries = await plexApi.getLibraries()

      return NextResponse.json({
        connected: true,
        server: {
          url: workingUrl,
          token: plexToken,
          username: user.plexUsername,
          libraries: libraries.length,
          libraryTypes: libraries.map(lib => lib.type),
        }
      })

    } catch (error) {
      return NextResponse.json({
        connected: false,
        error: 'Plex server not accessible'
      })
    }

  } catch (error) {
    console.error('Plex status error:', error)
    return NextResponse.json(
      { error: 'Failed to check Plex status' },
      { status: 500 }
    )
  }
}