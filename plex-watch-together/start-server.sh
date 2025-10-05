#!/bin/bash
# Plex Watch Together Startup Script

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🎬 Starting Plex Watch Together...${NC}"

# Load environment
export NODE_ENV=production

# Start the application
echo -e "${GREEN}Starting application server...${NC}"
npm start &
APP_PID=$!

# Wait for app to start
sleep 5

# Check if app is running
if kill -0 $APP_PID 2>/dev/null; then
    echo -e "${GREEN}✅ Application server started (PID: $APP_PID)${NC}"
else
    echo -e "${RED}❌ Application server failed to start${NC}"
    exit 1
fi

# Start Caddy if Caddyfile exists
if [[ -f "Caddyfile" ]]; then
    echo -e "${GREEN}Starting Caddy reverse proxy...${NC}"
    
    # Try to use system Caddy first, then local
    if command -v caddy >/dev/null 2>&1; then
        caddy start --config Caddyfile --adapter caddyfile
    else
        echo -e "${YELLOW}Warning: Caddy not found in PATH. Install Caddy for reverse proxy.${NC}"
    fi
fi

# Show access URLs
echo ""
echo -e "${BLUE}🌐 Access URLs:${NC}"
echo -e "  Direct: http://localhost:3001"

if [[ -f "Caddyfile" ]]; then
    if grep -q ":443" Caddyfile; then
        echo -e "  Proxy:  http://localhost:443"
    else
        echo -e "  Domain: https://plexwatch.duckdns.org"
    fi
fi

echo ""
echo -e "${GREEN}🎉 Server is running! Press Ctrl+C to stop.${NC}"

# Wait for interrupt
trap 'echo -e "\n${BLUE}Shutting down...${NC}"; kill $APP_PID; caddy stop 2>/dev/null; exit 0' INT
wait $APP_PID
