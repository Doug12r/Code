#!/bin/bash

# Digital Ocean Droplet Auto-Deployment Script (Password Authentication Version)
# Usage: ./deploy-to-digitalocean-password.sh [domain] [droplet-ip]
#
# Example: ./deploy-to-digitalocean-password.sh plexwatch.yourdomain.com 164.90.123.45

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
DOMAIN=${1:-""}
DROPLET_IP=${2:-""}
APP_USER="plexwatch"
APP_DIR="/home/$APP_USER/app"
NODE_VERSION="20"

# Functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_header() {
    echo -e "${BLUE}"
    echo "======================================================="
    echo "  Plex Watch Together - Digital Ocean Deployment"
    echo "  (Password Authentication Version)"
    echo "======================================================="
    echo -e "${NC}"
}

check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check if required commands exist
    command -v sshpass >/dev/null 2>&1 || {
        log_warning "sshpass not found. Installing..."
        if command -v apt-get >/dev/null 2>&1; then
            sudo apt-get update && sudo apt-get install -y sshpass
        elif command -v brew >/dev/null 2>&1; then
            brew install sshpass
        else
            log_error "Please install sshpass manually"
            exit 1
        fi
    }
    
    command -v rsync >/dev/null 2>&1 || { log_error "rsync is required but not installed."; exit 1; }
    command -v npm >/dev/null 2>&1 || { log_error "npm is required but not installed."; exit 1; }
    
    # Check if we have the required parameters
    if [ -z "$DOMAIN" ] || [ -z "$DROPLET_IP" ]; then
        log_error "Missing required parameters"
        echo "Usage: $0 [domain] [droplet-ip]"
        echo "Example: $0 plexwatch.yourdomain.com 164.90.123.45"
        exit 1
    fi
    
    log_success "Prerequisites check passed"
}

get_password() {
    echo -e "${YELLOW}Please enter your droplet root password:${NC}"
    read -s ROOT_PASSWORD
    export SSHPASS="$ROOT_PASSWORD"
    
    log_info "Testing connection..."
    if ! sshpass -e ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 root@$DROPLET_IP "echo 'Connection successful'"; then
        log_error "Failed to connect. Please check your password and IP address."
        exit 1
    fi
    log_success "Connection test passed"
}

# SSH helper function for password authentication
ssh_cmd() {
    sshpass -e ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null root@$DROPLET_IP "$1"
}

ssh_user_cmd() {
    sshpass -e ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null $APP_USER@$DROPLET_IP "$1"
}

build_application() {
    log_info "Building application locally..."
    
    if [ ! -f "package.json" ]; then
        log_error "package.json not found. Please run this script from the project root directory."
        exit 1
    fi
    
    npm ci
    npm run build
    
    log_success "Application built successfully"
}

setup_droplet() {
    log_info "Setting up droplet at $DROPLET_IP..."
    
    log_info "Updating system packages..."
    ssh_cmd "apt update && apt upgrade -y && apt install -y curl wget git nano htop ufw fail2ban unzip"
    
    log_info "Creating application user..."
    ssh_cmd "
        if ! id '$APP_USER' &>/dev/null; then
            adduser --disabled-password --gecos '' $APP_USER
            usermod -aG sudo $APP_USER
            echo '$APP_USER ALL=(ALL) NOPASSWD:ALL' >> /etc/sudoers
        fi
        mkdir -p $APP_DIR
        chown -R $APP_USER:$APP_USER /home/$APP_USER
    "
    
    # Set password for app user (same as root for simplicity)
    log_info "Setting password for application user..."
    ssh_cmd "echo '$APP_USER:$ROOT_PASSWORD' | chpasswd"
    
    log_info "Setting up firewall..."
    ssh_cmd "
        ufw --force reset
        ufw allow ssh
        ufw allow 80
        ufw allow 443
        ufw allow 3001
        ufw --force enable
    "
    
    log_success "Droplet setup completed"
}

install_dependencies() {
    log_info "Installing Node.js, PM2, and Caddy..."
    
    ssh_cmd "
        curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
        apt-get install -y nodejs
        npm install -g pm2
        
        apt install -y debian-keyring debian-archive-keyring apt-transport-https
        curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
        curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
        apt update
        apt install -y caddy
        
        node --version && npm --version && pm2 --version && caddy version
    "
    
    log_success "Dependencies installed successfully"
}

deploy_application() {
    log_info "Deploying application files..."
    
    TEMP_DIR=$(mktemp -d)
    
    rsync -av \
        --exclude 'node_modules' \
        --exclude '.git' \
        --exclude '.next' \
        --exclude 'logs' \
        --exclude '.env.local' \
        --exclude '.env.development' \
        ./ $TEMP_DIR/
    
    log_info "Uploading files to droplet..."
    sshpass -e rsync -avz -e "ssh -o StrictHostKeyChecking=no" $TEMP_DIR/ $APP_USER@$DROPLET_IP:$APP_DIR/
    
    rm -rf $TEMP_DIR
    
    log_info "Installing production dependencies..."
    ssh_user_cmd "
        cd $APP_DIR
        npm ci --only=production
        npx prisma generate
        npx prisma migrate deploy
    "
    
    log_success "Application deployed successfully"
}

configure_environment() {
    log_info "Configuring environment variables..."
    
    NEXTAUTH_SECRET=$(openssl rand -base64 32)
    
    ssh_user_cmd "
        cat > $APP_DIR/.env.production << 'EOL'
DATABASE_URL=\"file:./prisma/prod.db\"
NEXTAUTH_URL=\"https://$DOMAIN\"
NEXTAUTH_SECRET=\"$NEXTAUTH_SECRET\"
NODE_ENV=production
PORT=3001
EOL
        chmod 600 $APP_DIR/.env.production
    "
    
    log_success "Environment configured"
}

setup_caddy() {
    log_info "Configuring Caddy reverse proxy..."
    
    ssh_cmd "
        cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.backup
        
        cat > /etc/caddy/Caddyfile << 'EOL'
$DOMAIN {
    reverse_proxy localhost:3001 {
        header_up Connection {\>Connection}
        header_up Upgrade {\>Upgrade}
        header_up Sec-WebSocket-Key {\>Sec-WebSocket-Key}
        header_up Sec-WebSocket-Version {\>Sec-WebSocket-Version}
        header_up Sec-WebSocket-Extensions {\>Sec-WebSocket-Extensions}
        header_up Sec-WebSocket-Protocol {\>Sec-WebSocket-Protocol}
        
        header_up Host {host}
        header_up X-Real-IP {remote_host}
        header_up X-Forwarded-For {remote_host}
        header_up X-Forwarded-Proto {scheme}
        header_up X-Forwarded-Host {host}
    }
    
    encode gzip zstd
    
    header {
        Strict-Transport-Security \"max-age=31536000; includeSubDomains; preload\"
        X-Content-Type-Options \"nosniff\"
        X-Frame-Options \"SAMEORIGIN\"
        X-XSS-Protection \"1; mode=block\"
        Referrer-Policy \"strict-origin-when-cross-origin\"
        -Server
        -X-Powered-By
    }
    
    log {
        output file /var/log/caddy/access.log
        format json
    }
}
EOL
        
        mkdir -p /var/log/caddy
        chown caddy:caddy /var/log/caddy
        caddy validate --config /etc/caddy/Caddyfile
        systemctl enable caddy
        systemctl restart caddy
    "
    
    log_success "Caddy configured and started"
}

setup_pm2() {
    log_info "Setting up PM2 process manager..."
    
    ssh_user_cmd "
        cd $APP_DIR
        mkdir -p /home/$APP_USER/logs
        
        cat > ecosystem.config.js << 'EOL'
module.exports = {
  apps: [{
    name: 'plex-watch-together',
    script: 'server.js',
    cwd: '$APP_DIR',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      PORT: 3001
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3001
    },
    log_file: '/home/$APP_USER/logs/app.log',
    error_file: '/home/$APP_USER/logs/error.log',
    out_file: '/home/$APP_USER/logs/out.log',
    pid_file: '/home/$APP_USER/logs/pid',
    max_memory_restart: '1G',
    restart_delay: 5000,
    watch: false
  }]
}
EOL
        
        pm2 delete plex-watch-together 2>/dev/null || true
        pm2 start ecosystem.config.js --env production
        pm2 save
        pm2 startup | grep 'sudo' | sh
    "
    
    log_success "PM2 configured and application started"
}

verify_deployment() {
    log_info "Verifying deployment..."
    
    ssh_user_cmd "
        echo 'PM2 Status:'
        pm2 status
        
        echo -e '\nApplication Health Check:'
        curl -s http://localhost:3001 > /dev/null && echo 'Local app: OK' || echo 'Local app: FAILED'
    "
    
    ssh_cmd "
        echo -e '\nCaddy Status:'
        systemctl status caddy --no-pager -l
        
        echo -e '\nFirewall Status:'
        ufw status
    "
}

print_completion_info() {
    log_success "Deployment completed successfully!"
    
    echo -e "\n${GREEN}=== Deployment Summary ===${NC}"
    echo -e "${BLUE}Application URL:${NC} https://$DOMAIN"
    echo -e "${BLUE}Droplet IP:${NC} $DROPLET_IP"
    echo -e "${BLUE}SSH Access:${NC} ssh $APP_USER@$DROPLET_IP (password: same as root)"
    
    echo -e "\n${YELLOW}=== Next Steps ===${NC}"
    echo "1. Wait for DNS propagation (can take up to 24 hours)"
    echo "2. Access your application at https://$DOMAIN"
    echo "3. Complete Plex setup in the web interface"
    echo "4. Test creating and joining rooms"
    
    echo -e "\n${GREEN}🎉 Enjoy your Plex Watch Together application!${NC}"
}

# Main execution
main() {
    print_header
    check_prerequisites
    get_password
    build_application
    setup_droplet
    install_dependencies
    deploy_application
    configure_environment
    setup_caddy
    setup_pm2
    verify_deployment
    print_completion_info
}

# Run main function
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi