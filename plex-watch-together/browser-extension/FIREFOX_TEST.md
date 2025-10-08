# Firefox Extension Testing Guide

## Prerequisites
- Firefox Browser
- Access to Firefox Developer Tools

## Installation Steps

### Method 1: Temporary Installation (Recommended for Testing)

1. Open Firefox and navigate to `about:debugging`
2. Click "This Firefox" in the left sidebar
3. Click "Load Temporary Add-on..."
4. Navigate to the `browser-extension` folder
5. Select the `manifest.json` file
6. The extension should now be loaded temporarily

### Method 2: Manual Installation

1. Create a zip file of the entire `browser-extension` folder
2. In Firefox, go to `about:addons`
3. Click the gear icon and select "Install Add-on From File..."
4. Select your zip file

## Testing Steps

1. **Install the Extension**
   - Follow installation steps above
   - Check that the extension icon appears in the toolbar

2. **Navigate to Plex**
   - Go to https://app.plex.tv
   - Log in to your Plex account
   - Navigate to any video content

3. **Test Extension Functionality**
   - Click the extension icon to open the popup
   - Enter a username if prompted
   - Try creating a room (click "Create Room")
   - Check browser console for any errors

4. **Debug Issues**
   - Open Firefox Developer Tools (F12)
   - Check Console tab for errors
   - Check Network tab for failed requests
   - Use `about:debugging` to inspect the extension directly

## Expected Behavior

- Extension popup should open when clicking the toolbar icon
- No console errors should appear when loading on Plex
- Room creation should generate a room ID
- Basic UI elements should be functional

## Common Issues

1. **Extension not loading**: Check manifest.json syntax
2. **Console errors about APIs**: Check browserAPI compatibility layer
3. **Content script not injecting**: Verify Plex page permissions
4. **Storage issues**: Check Firefox storage API differences

## Development Testing

For development and testing, you can:

1. Make changes to extension files
2. Go to `about:debugging`
3. Click "Reload" next to your extension
4. Refresh any Plex tabs to reload content scripts

## Console Commands for Testing

Open browser console on app.plex.tv and try:

```javascript
// Check if extension content script loaded
console.log('Plex Watch Together loaded:', !!window.plexWatchTogetherContentScript)

// Check if injected script loaded
console.log('WebRTC Manager available:', !!window.PlexWatchTogetherWebRTC)

// Test basic functionality
if (window.PlexWatchTogetherWebRTC) {
  const manager = new window.PlexWatchTogetherWebRTC('test-user', 'Test User')
  console.log('Manager created:', manager)
}
```