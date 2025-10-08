# Plex Watch Together Browser Extension

A browser extension that enables synchronized watching of Plex media with friends using peer-to-peer WebRTC connections. No server setup or port forwarding required!

## Features

- 🎯 **Direct P2P Connection**: No central server needed
- 🔒 **No Port Exposure**: Works through browser WebRTC
- 🦊 **Firefox Compatible**: Built with Firefox WebExtensions API
- 🎬 **Real-time Sync**: Play, pause, and seek synchronization
- 🎮 **Host Controls**: Room creator controls playback for all participants
- 📱 **QR Code Sharing**: Easy room joining via QR codes (coming soon)
- 💬 **Chat Support**: Built-in messaging (coming soon)
- 🌐 **Cross-browser**: Chrome and Firefox support

## Installation

### Firefox Installation (Current Focus)

1. Clone this repository
2. Open Firefox and navigate to `about:debugging`
3. Click "This Firefox" in the left sidebar
4. Click "Load Temporary Add-on..."
5. Navigate to the `browser-extension` folder and select `manifest.json`
6. The extension will appear in your toolbar

### Chrome Installation (Future Support)

Chrome support is planned but currently uses manifest v2 for Firefox compatibility.

### Using the Extension

1. **Open Plex**: Navigate to `app.plex.tv` and start playing any video
2. **Click Extension Icon**: Click the Plex Watch Together icon in your toolbar
3. **Create or Join Room**:
   - **Host**: Click "Create Watch Party" to generate a room code and QR code
   - **Guest**: Enter the room ID or scan the QR code to join

## How It Works

### WebRTC Peer-to-Peer Connection

The extension uses WebRTC data channels for direct browser-to-browser communication:

- **Host** creates a room and generates WebRTC offer
- **Guests** connect directly to host using the offer
- All media control events (play/pause/seek) are synchronized in real-time
- No external servers required after initial signaling

### Plex Integration

The content script injects into Plex's web interface:

- Monitors the HTML5 video element for state changes
- Detects play, pause, and seek events
- Applies sync corrections to maintain synchronization
- Works with Plex's dynamic content loading

### Signaling Process

Initial connection establishment uses:

1. **QR Code Method**: Host generates QR with WebRTC offer, guests scan to connect
2. **Room ID Method**: Manual entry of room codes with browser storage signaling
3. **BroadcastChannel**: Fallback for same-origin signaling

## File Structure

```
browser-extension/
├── manifest.json           # Extension configuration
├── popup/
│   ├── popup.html          # Extension popup UI
│   └── popup.js            # Popup functionality
├── src/
│   ├── content.js          # Plex page integration
│   ├── background.js       # Service worker
│   ├── webrtc-manager.js   # P2P connection handling
│   └── types.ts            # TypeScript interfaces (reference)
├── assets/                 # Extension icons
└── README.md              # This file
```

## Development

### Prerequisites

- Chrome or Firefox browser
- Access to `app.plex.tv` with media content

### Local Testing

1. Load the extension in developer mode
2. Open Plex in a tab and start playing media
3. Click the extension icon to open the popup
4. Test room creation and joining functionality

### Key Components

- **Content Script** (`content.js`): Injects into Plex pages, monitors video player
- **WebRTC Manager** (`webrtc-manager.js`): Handles P2P connections and signaling
- **Background Script** (`background.js`): Manages extension lifecycle and storage
- **Popup UI** (`popup.html/js`): User interface for creating/joining rooms

## Technical Details

### WebRTC Configuration

```javascript
const iceServers = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' }
]
```

### Sync Tolerance

- Default sync tolerance: 1 second
- Automatic drift correction every 5 seconds
- Network delay compensation for real-time events

### Browser Permissions

- `activeTab`: Access to current Plex tab
- `storage`: Save user preferences and room data
- Host permissions for `https://app.plex.tv/*`

## Troubleshooting

### Common Issues

1. **Extension not working on Plex**
   - Ensure you're on `app.plex.tv` (not local Plex server)
   - Refresh the page and try again
   - Check browser console for errors

2. **Can't connect to room**
   - Verify both users are on compatible Plex pages
   - Check network connectivity (WebRTC requires internet)
   - Try recreating the room

3. **Sync issues**
   - Ensure both users have stable internet connections
   - Check if video is loading properly on both ends
   - Adjust sync tolerance in settings (coming soon)

### Debug Mode

Open browser developer tools and check console logs:
- Content script logs start with "Plex Watch Together:"
- Background script logs show room management
- WebRTC connection logs show P2P status

## Limitations

- Requires modern browser with WebRTC support
- Both users must be on Plex web interface (not mobile apps)
- Maximum recommended room size: 4-5 participants
- Some corporate firewalls may block WebRTC

## Future Enhancements

- [ ] QR code scanning with camera
- [ ] Text chat functionality
- [ ] Advanced sync settings
- [ ] Host migration support
- [ ] Firefox extension store publication
- [ ] Mobile browser compatibility

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly with multiple browsers
5. Submit a pull request

## License

This project is licensed under the MIT License - see the main project LICENSE file for details.

## Acknowledgments

- Built upon the existing Plex Watch Together server application
- Uses Google's free STUN servers for WebRTC NAT traversal
- Inspired by the need for simpler, serverless watch party solutions
