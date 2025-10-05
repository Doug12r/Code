#!/bin/bash
# Quick Home Server Setup Script
# Automatically sets up Plex Watch Together with Caddy on your home machine

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Configuration
DOMAIN="${1:-localhost}"
APP_PORT="${2:-3001}"
PROXY_PORT="${3:-8080}"
USE_HTTPS="${4:-false}"

log_info "🏠 Plex Watch Together Home Server Setup"
log_info "Domain: $DOMAIN"
log_info "App Port: $APP_PORT"
log_info "Proxy Port: $PROXY_PORT"
log_info "HTTPS: $USE_HTTPS"
echo ""

# Check if running as root for system-wide Caddy install
if [[ "$USE_HTTPS" == "true" ]] && [[ $EUID -eq 0 ]]; then
    log_error "Don't run this script as root. It will use sudo when needed."
    exit 1
fi

# Check dependencies
log_info "Checking dependencies..."

# Check Node.js
if ! command -v node >/dev/null 2>&1; then
    log_error "Node.js is not installed. Please install Node.js 18+ first."
    exit 1
fi

NODE_VERSION=$(node -v | sed 's/v//')
log_success "Node.js $NODE_VERSION found"

# Check npm
if ! command -v npm >/dev/null 2>&1; then
    log_error "npm is not installed"
    exit 1
fi

log_success "npm found"

# Install Caddy if not present and HTTPS is requested
if [[ "$USE_HTTPS" == "true" ]]; then
    if ! command -v caddy >/dev/null 2>&1; then
        log_info "Installing Caddy..."
        
        # Detect OS
        if [[ "$OSTYPE" == "linux-gnu"* ]]; then
            # Ubuntu/Debian
            if command -v apt >/dev/null 2>&1; then
                sudo apt update
                sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
                curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
                curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
                sudo apt update
                sudo apt install caddy
            # CentOS/RHEL/Fedora
            elif command -v dnf >/dev/null 2>&1; then
                sudo dnf install 'dnf-command(copr)'
                sudo dnf copr enable @caddy/caddy
                sudo dnf install caddy
            elif command -v yum >/dev/null 2>&1; then
                sudo yum install yum-plugin-copr
                sudo yum copr enable @caddy/caddy
                sudo yum install caddy
            else
                log_error "Unsupported Linux distribution. Please install Caddy manually."
                exit 1
            fi
        elif [[ "$OSTYPE" == "darwin"* ]]; then
            # macOS
            if command -v brew >/dev/null 2>&1; then
                brew install caddy
            else
                log_error "Homebrew not found. Please install Caddy manually: https://caddyserver.com/download"
                exit 1
            fi
        else
            log_error "Unsupported OS. Please install Caddy manually: https://caddyserver.com/download"
            exit 1
        fi
        
        log_success "Caddy installed successfully"
    else
        log_success "Caddy already installed"
    fi
else
    log_info "Skipping Caddy installation (HTTP mode)"
fi

# Setup environment file if it doesn't exist
if [[ ! -f ".env.production" ]]; then
    log_info "Creating .env.production file..."
    
    cat > .env.production << EOF
# Database (using SQLite for simplicity)
DATABASE_URL="file:./prisma/prod.db"

# Authentication
NEXTAUTH_URL="$(if [[ "$USE_HTTPS" == "true" ]]; then echo "https://$DOMAIN"; else echo "http://$DOMAIN:$PROXY_PORT"; fi)"
NEXTAUTH_SECRET="$(openssl rand -base64 32)"

# Plex
PLEX_CLIENT_IDENTIFIER="plex-watch-together-home"

# Security
ENCRYPTION_KEY="$(openssl rand -hex 32)"

# Optional: Redis (leave commented for file-based cache)
# REDIS_URL="redis://localhost:6379"

# Environment
NODE_ENV=production
PORT=$APP_PORT
EOF

    log_success ".env.production created"
else
    log_info ".env.production already exists"
fi

# Install dependencies
log_info "Installing dependencies..."
npm install
log_success "Dependencies installed"

# Setup database
log_info "Setting up database..."
npx prisma generate
npx prisma db push --accept-data-loss
log_success "Database setup complete"

# Build the application
log_info "Building application..."
npm run build
log_success "Application built"

# Create Caddyfile if using HTTPS
if [[ "$USE_HTTPS" == "true" ]]; then
    log_info "Creating Caddyfile..."
    
    cat > Caddyfile << EOF
# Main application
$DOMAIN {
    reverse_proxy localhost:$APP_PORT
    
    encode gzip zstd
    
    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
        X-Content-Type-Options "nosniff"
        X-Frame-Options "SAMEORIGIN"
        X-XSS-Protection "1; mode=block"
        Referrer-Policy "strict-origin-when-cross-origin"
        -Server
        -X-Powered-By
    }
    
    log {
        output file ./logs/caddy-access.log
        format json
    }
}

# HTTP redirect
$DOMAIN:80 {
    redir https://{host}{uri} permanent
}
EOF

    # Create logs directory
    mkdir -p logs
    
    log_success "Caddyfile created"
else
    log_info "Creating simple Caddyfile for HTTP..."
    
    cat > Caddyfile << EOF
# Local HTTP proxy
:$PROXY_PORT {
    reverse_proxy localhost:$APP_PORT
    
    encode gzip zstd
    
    header {
        X-Content-Type-Options "nosniff"
        X-Frame-Options "SAMEORIGIN"
        X-XSS-Protection "1; mode=block"
        -Server
        -X-Powered-By
    }
    
    log {
        output file ./logs/caddy-access.log
        format console
    }
}
EOF

    mkdir -p logs
    log_success "HTTP Caddyfile created"
fi

# Create startup script
log_info "Creating startup script..."

cat > start-server.sh << 'EOF'
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
echo -e "  Direct: http://localhost:APP_PORT_PLACEHOLDER"

if [[ -f "Caddyfile" ]]; then
    if grep -q ":PROXY_PORT_PLACEHOLDER" Caddyfile; then
        echo -e "  Proxy:  http://localhost:PROXY_PORT_PLACEHOLDER"
    else
        echo -e "  Domain: https://DOMAIN_PLACEHOLDER"
    fi
fi

echo ""
echo -e "${GREEN}🎉 Server is running! Press Ctrl+C to stop.${NC}"

# Wait for interrupt
trap 'echo -e "\n${BLUE}Shutting down...${NC}"; kill $APP_PID; caddy stop 2>/dev/null; exit 0' INT
wait $APP_PID
EOF

# Replace placeholders in startup script
sed -i "s/APP_PORT_PLACEHOLDER/$APP_PORT/g" start-server.sh
sed -i "s/PROXY_PORT_PLACEHOLDER/$PROXY_PORT/g" start-server.sh
sed -i "s/DOMAIN_PLACEHOLDER/$DOMAIN/g" start-server.sh

chmod +x start-server.sh

log_success "Startup script created"

# Create systemd service for production (optional)
if [[ "$USE_HTTPS" == "true" ]] && command -v systemctl >/dev/null 2>&1; then
    log_info "Creating systemd service (optional)..."
    
    cat > plex-watch-together.service << EOF
[Unit]
Description=Plex Watch Together
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$(pwd)
ExecStart=$(pwd)/start-server.sh
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

    echo ""
    log_info "To install as system service:"
    echo "  sudo cp plex-watch-together.service /etc/systemd/system/"
    echo "  sudo systemctl enable plex-watch-together"
    echo "  sudo systemctl start plex-watch-together"
fi

# Final instructions
echo ""
log_success "🎉 Setup complete!"
echo ""
log_info "To start your server:"
echo "  ./start-server.sh"
echo ""
log_info "Access URLs:"
if [[ "$USE_HTTPS" == "true" ]]; then
    echo "  https://$DOMAIN"
    echo "  (Make sure DNS points to this machine)"
else
    echo "  http://localhost:$PROXY_PORT (through Caddy)"
    echo "  http://localhost:$APP_PORT (direct)"
fi
echo ""
log_info "Configuration files:"
echo "  .env.production - Environment variables"
echo "  Caddyfile - Reverse proxy config"
echo "  start-server.sh - Startup script"
echo ""

if [[ "$DOMAIN" != "localhost" ]] && [[ "$USE_HTTPS" == "true" ]]; then
    log_warning "For external access:"
    echo "  1. Forward ports 80 and 443 on your router"
    echo "  2. Make sure $DOMAIN points to your public IP"
    echo "  3. Check your firewall allows connections"
fi

log_success "Ready to launch! 🚀"