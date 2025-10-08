# Testing Guide for Plex Watch Together Browser Extension

## Quick Test Setup

### Step 1: Load the Extension

1. **Open Chrome** and navigate to `chrome://extensions/`
2. **Enable Developer Mode** (toggle in top-right corner)
3. **Click "Load unpacked"** and select the `browser-extension` folder
4. **Verify installation**: You should see "Plex Watch Together" in your extensions list

### Step 2: Test on Plex

1. **Open Plex**: Go to `https://app.plex.tv` and sign in
2. **Start playing any video** (movie, TV show, etc.)
3. **Click the extension icon** in your browser toolbar
4. **Check popup**: Should show "Connected to room" status and video detection

### Step 3: Test Room Creation

1. **Enter your name** in the popup
2. **Click "Create Watch Party"**
3. **Verify room creation**: Should see room ID and QR code placeholder
4. **Check browser console** (F12) for "Room created" logs

### Step 4: Test Room Joining (Two Browser Windows)

1. **Open second Chrome window/profile**
2. **Load same extension** and go to same Plex video
3. **Switch to "Join" tab** in popup
4. **Enter room ID** from first window
5. **Click "Join Watch Party"**
6. **Verify connection**: Both windows should show connected status

## Expected Results

### ✅ Working Features
- [x] Extension loads without errors
- [x] Detects Plex video player
- [x] Shows connection status
- [x] Creates and displays room ID
- [x] Basic UI functionality

### 🔄 In Progress Features
- [ ] Actual P2P WebRTC connections
- [ ] Real-time video synchronization
- [ ] QR code generation
- [ ] Chat functionality

### ⚠️ Known Limitations
- QR codes show placeholder pattern
- WebRTC signaling may need refinement
- Sync tolerance needs calibration
- Limited to Chrome browser currently

## Debugging

### Browser Console Logs

Check for these log messages:

```
// Content Script
Plex Watch Together: Initializing...
Plex Watch Together: Video player found
Plex Watch Together: Video listeners attached

// Background Script
Background: Room created ROOM123
Background: User joined room

// WebRTC Manager
Created room: ROOM123
Data channel opened with UserName
```

### Common Issues & Solutions

1. **"No response from content script"**
   - Refresh the Plex page
   - Ensure you're on app.plex.tv (not local server)
   - Check if content script is loaded

2. **"Failed to create room"**
   - Verify you're playing a video
   - Check browser console for errors
   - Try refreshing extension

3. **WebRTC connection fails**
   - Check network connectivity
   - Verify both users are on compatible pages
   - Look for ICE connection state changes

### Manual Testing Checklist

- [ ] Extension installs without warnings
- [ ] Popup opens and shows correct status
- [ ] Can detect Plex video player
- [ ] Room creation generates ID
- [ ] Room joining accepts valid ID
- [ ] Connection status updates correctly
- [ ] Browser console shows no critical errors

## Production Testing

### Multi-User Testing

1. **Different networks**: Test with users on different internet connections
2. **Various content**: Try different types of Plex media
3. **Connection recovery**: Test what happens when one user disconnects

### Performance Testing

1. **Sync accuracy**: Measure time difference between actions
2. **Resource usage**: Monitor CPU and memory consumption
3. **Network efficiency**: Check WebRTC data channel usage

## Next Steps

1. **Fix any critical bugs** found during testing
2. **Implement proper QR code generation**
3. **Refine WebRTC signaling reliability**
4. **Add comprehensive error handling**
5. **Create Firefox-compatible version**

## Test Commands

```bash
# Load extension in Chrome (from project root)
chrome --load-extension=./browser-extension

# Check for JavaScript errors
# Open F12 Developer Tools -> Console

# Test on Plex
# Go to: https://app.plex.tv/desktop/#!/server/.../details?key=%2Flibrary%2Fmetadata%2F...
```

Remember: This is a serverless P2P solution, so both users need to be online simultaneously for synchronization to work!