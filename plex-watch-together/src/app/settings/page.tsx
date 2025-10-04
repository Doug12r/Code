'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Navigation } from '@/components/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { AccessibilitySettings } from '@/components/ui/accessibility'
import { Badge } from '@/components/ui/badge'
import { 
  UserIcon, 
  ServerIcon, 
  BellIcon, 
  ShieldIcon, 
  EyeIcon,
  TrashIcon,
  LogOutIcon,
  SettingsIcon
} from 'lucide-react'
import { signOut } from 'next-auth/react'
import { toast } from 'sonner'
import { EnhancedPlexSetup } from '@/components/enhanced-plex-setup'

export default function SettingsPage() {
  const { data: session } = useSession()
  const router = useRouter()
  
  const [plexStatus, setPlexStatus] = useState<any>(null)
  const [showPlexSetup, setShowPlexSetup] = useState(false)
  const [loading, setLoading] = useState(true)
  
  // Settings state
  const [notifications, setNotifications] = useState({
    roomInvites: true,
    mediaUpdates: true,
    systemAlerts: true,
    emailDigest: false
  })
  
  const [privacy, setPrivacy] = useState({
    showOnlineStatus: true,
    allowRoomInvites: true,
    shareWatchHistory: false
  })

  useEffect(() => {
    if (session?.user) {
      checkPlexStatus()
      loadUserSettings()
    }
  }, [session])

  const checkPlexStatus = async () => {
    try {
      const response = await fetch('/api/plex/setup')
      const data = await response.json()
      setPlexStatus(data)
    } catch (error) {
      console.error('Failed to check Plex status:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadUserSettings = async () => {
    try {
      const response = await fetch('/api/user/settings')
      if (response.ok) {
        const data = await response.json()
        if (data.notifications) setNotifications(data.notifications)
        if (data.privacy) setPrivacy(data.privacy)
      }
    } catch (error) {
      console.error('Failed to load user settings:', error)
    }
  }

  const saveSettings = async () => {
    try {
      const response = await fetch('/api/user/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notifications,
          privacy
        })
      })
      
      if (response.ok) {
        toast.success('Settings saved successfully!')
      } else {
        toast.error('Failed to save settings')
      }
    } catch (error) {
      console.error('Failed to save settings:', error)
      toast.error('Failed to save settings')
    }
  }

  const handleDeleteAccount = async () => {
    if (!confirm('Are you sure you want to delete your account? This action cannot be undone.')) {
      return
    }
    
    try {
      const response = await fetch('/api/user/delete', {
        method: 'DELETE'
      })
      
      if (response.ok) {
        toast.success('Account deleted successfully')
        signOut({ callbackUrl: '/' })
      } else {
        toast.error('Failed to delete account')
      }
    } catch (error) {
      console.error('Failed to delete account:', error)
      toast.error('Failed to delete account')
    }
  }

  if (!session) {
    return (
      <>
        <Navigation />
        <div className="flex items-center justify-center min-h-screen">
          <Card>
            <CardContent className="p-8 text-center">
              <h2 className="text-2xl font-bold mb-4">Authentication Required</h2>
              <p className="text-muted-foreground mb-4">Please sign in to access settings.</p>
              <Button onClick={() => router.push('/auth/signin')}>
                Sign In
              </Button>
            </CardContent>
          </Card>
        </div>
      </>
    )
  }

  if (loading) {
    return (
      <>
        <Navigation />
        <div className="flex items-center justify-center min-h-screen">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      </>
    )
  }

  return (
    <>
      <Navigation />
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Settings</h1>
          <p className="text-muted-foreground mt-2">
            Manage your account, preferences, and integrations
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Settings Content */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Profile Settings */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <UserIcon className="h-5 w-5" />
                  Profile
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                    <span className="text-xl font-semibold">
                      {session.user?.name?.[0] || session.user?.email?.[0] || 'U'}
                    </span>
                  </div>
                  <div>
                    <h3 className="font-semibold">{session.user?.name || 'User'}</h3>
                    <p className="text-sm text-muted-foreground">{session.user?.email}</p>
                  </div>
                </div>
                
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="displayName">Display Name</Label>
                    <Input
                      id="displayName"
                      defaultValue={session.user?.name || ''}
                      placeholder="Enter your display name"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Notification Settings */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BellIcon className="h-5 w-5" />
                  Notifications
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Room Invitations</Label>
                    <p className="text-sm text-muted-foreground">
                      Get notified when someone invites you to a room
                    </p>
                  </div>
                  <Switch
                    checked={notifications.roomInvites}
                    onCheckedChange={(checked) =>
                      setNotifications(prev => ({ ...prev, roomInvites: checked }))
                    }
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Media Updates</Label>
                    <p className="text-sm text-muted-foreground">
                      Notifications about new media and playback events
                    </p>
                  </div>
                  <Switch
                    checked={notifications.mediaUpdates}
                    onCheckedChange={(checked) =>
                      setNotifications(prev => ({ ...prev, mediaUpdates: checked }))
                    }
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <div>
                    <Label>System Alerts</Label>
                    <p className="text-sm text-muted-foreground">
                      Important system notifications and updates
                    </p>
                  </div>
                  <Switch
                    checked={notifications.systemAlerts}
                    onCheckedChange={(checked) =>
                      setNotifications(prev => ({ ...prev, systemAlerts: checked }))
                    }
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Email Digest</Label>
                    <p className="text-sm text-muted-foreground">
                      Weekly summary of your activity
                    </p>
                  </div>
                  <Switch
                    checked={notifications.emailDigest}
                    onCheckedChange={(checked) =>
                      setNotifications(prev => ({ ...prev, emailDigest: checked }))
                    }
                  />
                </div>
              </CardContent>
            </Card>

            {/* Privacy Settings */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShieldIcon className="h-5 w-5" />
                  Privacy & Security
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Show Online Status</Label>
                    <p className="text-sm text-muted-foreground">
                      Let others see when you're online
                    </p>
                  </div>
                  <Switch
                    checked={privacy.showOnlineStatus}
                    onCheckedChange={(checked) =>
                      setPrivacy(prev => ({ ...prev, showOnlineStatus: checked }))
                    }
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Allow Room Invites</Label>
                    <p className="text-sm text-muted-foreground">
                      Anyone can invite you to watch rooms
                    </p>
                  </div>
                  <Switch
                    checked={privacy.allowRoomInvites}
                    onCheckedChange={(checked) =>
                      setPrivacy(prev => ({ ...prev, allowRoomInvites: checked }))
                    }
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Share Watch History</Label>
                    <p className="text-sm text-muted-foreground">
                      Show your recently watched content to friends
                    </p>
                  </div>
                  <Switch
                    checked={privacy.shareWatchHistory}
                    onCheckedChange={(checked) =>
                      setPrivacy(prev => ({ ...prev, shareWatchHistory: checked }))
                    }
                  />
                </div>
              </CardContent>
            </Card>

            {/* Accessibility Settings */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <EyeIcon className="h-5 w-5" />
                  Accessibility
                </CardTitle>
              </CardHeader>
              <CardContent>
                <AccessibilitySettings />
              </CardContent>
            </Card>

            {/* Save Settings */}
            <div className="flex gap-2">
              <Button onClick={saveSettings} className="flex-1">
                Save Changes
              </Button>
              <Button variant="outline" onClick={() => {
                // Reset to original state
                loadUserSettings()
              }}>
                Reset
              </Button>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            
            {/* Plex Connection Status */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ServerIcon className="h-5 w-5" />
                  Plex Server
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Status:</span>
                  <Badge variant={plexStatus?.connected ? "default" : "secondary"}>
                    {plexStatus?.connected ? "Connected" : "Not Connected"}
                  </Badge>
                </div>
                
                {plexStatus?.connected && plexStatus.server && (
                  <div className="text-xs text-muted-foreground space-y-1">
                    <p>User: {plexStatus.server.username}</p>
                    <p>Server: {plexStatus.server.url}</p>
                    <p>Libraries: {plexStatus.server.libraries}</p>
                  </div>
                )}
                
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full"
                  onClick={() => setShowPlexSetup(true)}
                >
                  <SettingsIcon className="h-4 w-4 mr-2" />
                  {plexStatus?.connected ? "Manage" : "Setup"} Plex
                </Button>
              </CardContent>
            </Card>

            {/* Account Actions */}
            <Card>
              <CardHeader>
                <CardTitle>Account Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-start"
                  onClick={() => signOut()}
                >
                  <LogOutIcon className="h-4 w-4 mr-2" />
                  Sign Out
                </Button>
                
                <Separator />
                
                <Button
                  variant="destructive"
                  size="sm"
                  className="w-full justify-start"
                  onClick={handleDeleteAccount}
                >
                  <TrashIcon className="h-4 w-4 mr-2" />
                  Delete Account
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Plex Setup Modal */}
      {showPlexSetup && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold">Plex Connection Manager</h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowPlexSetup(false)}
              >
                ✕
              </Button>
            </div>
            <EnhancedPlexSetup />
          </div>
        </div>
      )}
    </>
  )
}