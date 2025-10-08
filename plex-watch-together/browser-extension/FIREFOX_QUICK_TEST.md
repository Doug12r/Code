# Quick Firefox Test Setup

## Installation Steps

1. **Open Firefox Developer Tools**
   ```
   - Open Firefox
   - Navigate to about:debugging
   - Click "This Firefox"
   - Click "Load Temporary Add-on..."
   - Select manifest.json from browser-extension folder
   ```

2. **Verify Installation**
   - Extension icon should appear in toolbar
   - No errors in browser console
   - Extension visible in about:addons

## Basic Test

1. **Go to Plex**
   - Navigate to https://app.plex.tv
   - Log in to your account
   - Start playing any video

2. **Test Extension**
   - Click extension icon in toolbar
   - Enter username (e.g., "TestUser")
   - Click "Create Room"
   - Should generate room ID (e.g., "ABC123")

3. **Check Console**
   - Open Firefox Developer Tools (F12)
   - Look for "Plex Watch Together" log messages
   - Should see WebRTC manager initialization

## Expected Console Output

When working correctly, you should see:
```
Plex Watch Together: Content script loaded
Plex Watch Together: Injecting WebRTC manager
Plex Watch Together WebRTC manager is ready!
Created room: ABC123
```

## Common Issues

- **"Extension not loading"**: Check manifest.json syntax
- **"Content script not found"**: Refresh Plex page after installing
- **"WebRTC manager not available"**: Check console for injection errors
- **Storage errors**: Firefox may need explicit permissions

## Test Commands

In browser console on app.plex.tv:
```javascript
// Check if loaded
console.log('Extension loaded:', !!window.plexWatchTogetherContentScript)
console.log('WebRTC available:', !!window.PlexWatchTogetherWebRTC)

// Create test room
if (window.PlexWatchTogetherWebRTC) {
  const manager = new window.PlexWatchTogetherWebRTC('test123', 'TestUser')
  manager.createRoom().then(roomId => console.log('Room:', roomId))
}
```

## Next Steps

Once basic functionality works:
1. Test room joining from another browser/profile
2. Test video synchronization
3. Test with different Plex content types
4. Validate P2P connection establishment