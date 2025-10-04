import React, { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { useNotificationHelpers } from './notifications'

export type ActivityType = 
  | 'media_play' | 'media_pause' | 'media_seek' | 'media_load'
  | 'user_join' | 'user_leave' | 'user_sync'
  | 'room_create' | 'room_join' | 'room_leave'
  | 'chat_message' | 'system_event'
  | 'error' | 'warning' | 'info'

export interface Activity {
  id: string
  type: ActivityType
  title: string
  description?: string
  timestamp: Date
  userId?: string
  userName?: string
  metadata?: Record<string, any>
  read?: boolean
  important?: boolean
}

interface ActivityContextType {
  activities: Activity[]
  unreadCount: number
  addActivity: (activity: Omit<Activity, 'id' | 'timestamp'>) => void
  markAsRead: (id: string) => void
  markAllAsRead: () => void
  clearActivities: () => void
  getActivitiesByType: (type: ActivityType) => Activity[]
}

const ActivityContext = createContext<ActivityContextType | undefined>(undefined)

export function useActivity() {
  const context = useContext(ActivityContext)
  if (!context) {
    throw new Error('useActivity must be used within an ActivityProvider')
  }
  return context
}

interface ActivityProviderProps {
  children: React.ReactNode
  maxActivities?: number
  persistToStorage?: boolean
}

export function ActivityProvider({
  children,
  maxActivities = 100,
  persistToStorage = true
}: ActivityProviderProps) {
  const [activities, setActivities] = useState<Activity[]>([])
  const { showInfo, showWarning, showError } = useNotificationHelpers()

  // Load activities from storage on mount
  useEffect(() => {
    if (persistToStorage && typeof window !== 'undefined') {
      const stored = localStorage.getItem('plex-activities')
      if (stored) {
        try {
          const parsed = JSON.parse(stored)
          setActivities(parsed.map((a: any) => ({
            ...a,
            timestamp: new Date(a.timestamp)
          })))
        } catch (error) {
          console.error('Failed to load activities from storage:', error)
        }
      }
    }
  }, [persistToStorage])

  // Save activities to storage when they change
  useEffect(() => {
    if (persistToStorage && typeof window !== 'undefined' && activities.length > 0) {
      localStorage.setItem('plex-activities', JSON.stringify(activities))
    }
  }, [activities, persistToStorage])

  const addActivity = useCallback((activity: Omit<Activity, 'id' | 'timestamp'>) => {
    const id = Math.random().toString(36).substr(2, 9)
    const newActivity: Activity = {
      ...activity,
      id,
      timestamp: new Date(),
      read: false
    }

    setActivities(prev => {
      const updated = [newActivity, ...prev]
      return updated.slice(0, maxActivities)
    })

    // Show notification for important activities
    if (newActivity.important) {
      switch (newActivity.type) {
        case 'error':
          showError(newActivity.title, newActivity.description)
          break
        case 'warning':
          showWarning(newActivity.title, newActivity.description)
          break
        case 'user_join':
        case 'room_create':
        case 'system_event':
          showInfo(newActivity.title, newActivity.description)
          break
      }
    }
  }, [maxActivities, showError, showWarning, showInfo])

  const markAsRead = useCallback((id: string) => {
    setActivities(prev =>
      prev.map(activity =>
        activity.id === id ? { ...activity, read: true } : activity
      )
    )
  }, [])

  const markAllAsRead = useCallback(() => {
    setActivities(prev =>
      prev.map(activity => ({ ...activity, read: true }))
    )
  }, [])

  const clearActivities = useCallback(() => {
    setActivities([])
    if (persistToStorage && typeof window !== 'undefined') {
      localStorage.removeItem('plex-activities')
    }
  }, [persistToStorage])

  const getActivitiesByType = useCallback((type: ActivityType) => {
    return activities.filter(activity => activity.type === type)
  }, [activities])

  const unreadCount = activities.filter(activity => !activity.read).length

  const value = {
    activities,
    unreadCount,
    addActivity,
    markAsRead,
    markAllAsRead,
    clearActivities,
    getActivitiesByType
  }

  return (
    <ActivityContext.Provider value={value}>
      {children}
    </ActivityContext.Provider>
  )
}

interface ActivityFeedProps {
  className?: string
  maxItems?: number
  types?: ActivityType[]
  showUnreadOnly?: boolean
}

export function ActivityFeed({ 
  className = '', 
  maxItems = 20,
  types,
  showUnreadOnly = false
}: ActivityFeedProps) {
  const { activities, markAsRead } = useActivity()

  const filteredActivities = activities
    .filter(activity => {
      if (types && !types.includes(activity.type)) return false
      if (showUnreadOnly && activity.read) return false
      return true
    })
    .slice(0, maxItems)

  const getIcon = (type: ActivityType) => {
    switch (type) {
      case 'media_play':
        return '▶️'
      case 'media_pause':
        return '⏸️'
      case 'media_seek':
        return '⏭️'
      case 'media_load':
        return '📁'
      case 'user_join':
        return '👋'
      case 'user_leave':
        return '👋'
      case 'user_sync':
        return '🔄'
      case 'room_create':
        return '🏠'
      case 'room_join':
        return '🚪'
      case 'room_leave':
        return '🚪'
      case 'chat_message':
        return '💬'
      case 'system_event':
        return '⚙️'
      case 'error':
        return '❌'
      case 'warning':
        return '⚠️'
      case 'info':
        return 'ℹ️'
      default:
        return '📌'
    }
  }

  const formatTimestamp = (timestamp: Date) => {
    const now = new Date()
    const diff = now.getTime() - timestamp.getTime()
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)

    if (days > 0) return `${days}d ago`
    if (hours > 0) return `${hours}h ago`
    if (minutes > 0) return `${minutes}m ago`
    return 'Just now'
  }

  return (
    <div className={cn('activity-feed space-y-2', className)}>
      {filteredActivities.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <p>No activities yet</p>
        </div>
      ) : (
        filteredActivities.map(activity => (
          <div
            key={activity.id}
            className={cn(
              'activity-item flex items-start gap-3 p-3 rounded-lg transition-colors cursor-pointer',
              {
                'bg-blue-50 hover:bg-blue-100': !activity.read,
                'bg-gray-50 hover:bg-gray-100': activity.read
              }
            )}
            onClick={() => markAsRead(activity.id)}
          >
            <div className="flex-shrink-0 text-lg">
              {getIcon(activity.type)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <p className={cn(
                  'text-sm truncate',
                  activity.read ? 'text-gray-600' : 'text-gray-900 font-medium'
                )}>
                  {activity.title}
                </p>
                <span className="text-xs text-gray-500 flex-shrink-0 ml-2">
                  {formatTimestamp(activity.timestamp)}
                </span>
              </div>
              {activity.description && (
                <p className="text-sm text-gray-600 mt-1">
                  {activity.description}
                </p>
              )}
              {activity.userName && (
                <p className="text-xs text-gray-500 mt-1">
                  by {activity.userName}
                </p>
              )}
            </div>
            {!activity.read && (
              <div className="flex-shrink-0 w-2 h-2 bg-blue-500 rounded-full"></div>
            )}
          </div>
        ))
      )}
    </div>
  )
}

interface ActivityBadgeProps {
  type?: ActivityType[]
  showCount?: boolean
  className?: string
}

export function ActivityBadge({ 
  type,
  showCount = true,
  className = '' 
}: ActivityBadgeProps) {
  const { activities, unreadCount } = useActivity()

  const count = type 
    ? activities.filter(a => !a.read && type.includes(a.type)).length
    : unreadCount

  if (count === 0) return null

  return (
    <div className={cn(
      'activity-badge bg-red-500 text-white text-xs font-bold rounded-full min-w-[1.25rem] h-5 flex items-center justify-center',
      className
    )}>
      {showCount ? (count > 99 ? '99+' : count) : ''}
    </div>
  )
}

interface StatusIndicatorProps {
  status: 'online' | 'offline' | 'away' | 'busy'
  size?: 'sm' | 'md' | 'lg'
  showLabel?: boolean
  className?: string
}

export function StatusIndicator({ 
  status, 
  size = 'md',
  showLabel = false,
  className = '' 
}: StatusIndicatorProps) {
  const sizeClasses = {
    sm: 'w-2 h-2',
    md: 'w-3 h-3',
    lg: 'w-4 h-4'
  }

  const getColor = () => {
    switch (status) {
      case 'online':
        return 'bg-green-500'
      case 'away':
        return 'bg-yellow-500'
      case 'busy':
        return 'bg-red-500'
      case 'offline':
        return 'bg-gray-400'
      default:
        return 'bg-gray-400'
    }
  }

  return (
    <div className={cn('status-indicator flex items-center gap-2', className)}>
      <div className={cn(
        'rounded-full flex-shrink-0',
        sizeClasses[size],
        getColor()
      )} />
      {showLabel && (
        <span className="text-sm text-gray-600 capitalize">
          {status}
        </span>
      )}
    </div>
  )
}

// Utility hooks for common activities
export function useActivityHelpers() {
  const { addActivity } = useActivity()

  const logMediaEvent = useCallback((type: 'play' | 'pause' | 'seek' | 'load', title: string, details?: string) => {
    addActivity({
      type: `media_${type}` as ActivityType,
      title: `${type.charAt(0).toUpperCase() + type.slice(1)}: ${title}`,
      description: details,
      important: false
    })
  }, [addActivity])

  const logUserEvent = useCallback((type: 'join' | 'leave' | 'sync', userName: string, roomName?: string) => {
    addActivity({
      type: `user_${type}` as ActivityType,
      title: `${userName} ${type === 'join' ? 'joined' : type === 'leave' ? 'left' : 'synchronized'}${roomName ? ` ${roomName}` : ''}`,
      userName,
      important: type === 'join' || type === 'leave'
    })
  }, [addActivity])

  const logRoomEvent = useCallback((type: 'create' | 'join' | 'leave', roomName: string, userName?: string) => {
    addActivity({
      type: `room_${type}` as ActivityType,
      title: `Room ${roomName} ${type === 'create' ? 'created' : type === 'join' ? 'joined' : 'left'}`,
      description: userName ? `by ${userName}` : undefined,
      userName,
      important: type === 'create'
    })
  }, [addActivity])

  const logError = useCallback((title: string, description?: string) => {
    addActivity({
      type: 'error',
      title,
      description,
      important: true
    })
  }, [addActivity])

  return {
    logMediaEvent,
    logUserEvent,
    logRoomEvent,
    logError
  }
}