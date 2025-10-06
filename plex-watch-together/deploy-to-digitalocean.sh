#!/bin/bash

# Digital Ocean Droplet Auto-Deployment Script for Plex Watch Together
# Usage: ./deploy-to-digitalocean.sh [domain] [droplet-ip] [ssh-key-path]
#
# Example: ./deploy-to-digitalocean.sh plexwatch.yourdomain.com 164.90.123.45 ~/.ssh/id_rsa

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
SSH_KEY=${3:-"~/.ssh/id_rsa"}
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
    echo "=================================================="
    echo "  Plex Watch Together - Digital Ocean Deployment"
    echo "=================================================="
    echo -e "${NC}"
}

check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check if required commands exist
    command -v rsync >/dev/null 2>&1 || { log_error "rsync is required but not installed."; exit 1; }
    command -v ssh >/dev/null 2>&1 || { log_error "ssh is required but not installed."; exit 1; }
    command -v npm >/dev/null 2>&1 || { log_error "npm is required but not installed."; exit 1; }
    
    # Check if we have the required parameters
    if [ -z "$DOMAIN" ] || [ -z "$DROPLET_IP" ]; then
        log_error "Missing required parameters"
        echo "Usage: $0 [domain] [droplet-ip] [ssh-key-path]"
        echo "Example: $0 plexwatch.yourdomain.com 164.90.123.45 ~/.ssh/id_rsa"
        exit 1
    fi
    
    # Check if SSH key exists
    if [ ! -f "$SSH_KEY" ]; then
        log_error "SSH key not found: $SSH_KEY"
        exit 1
    fi
    
    log_success "Prerequisites check passed"
}

build_application() {
    log_info "Building application locally..."
    
    # Check if we're in the right directory
    if [ ! -f "package.json" ]; then
        log_error "package.json not found. Please run this script from the project root directory."
        exit 1
    fi
    
    # Install dependencies and build
    log_info "Installing dependencies..."
    npm ci
    
    log_info "Building application..."
    npm run build
    
    log_success "Application built successfully"
}

setup_droplet() {
    log_info "Setting up droplet at $DROPLET_IP..."
    
    # SSH options
    SSH_OPTS="-i $SSH_KEY -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null"
    
    log_info "Updating system packages..."
    ssh $SSH_OPTS root@$DROPLET_IP "
        apt update && apt upgrade -y
        apt install -y curl wget git nano htop ufw fail2ban unzip
    "
    
    log_info "Creating application user..."
    ssh $SSH_OPTS root@$DROPLET_IP "
        # Create user if not exists
        if ! id '$APP_USER' &>/dev/null; then
            adduser --disabled-password --gecos '' $APP_USER
            usermod -aG sudo $APP_USER
            echo '$APP_USER ALL=(ALL) NOPASSWD:ALL' >> /etc/sudoers
        fi
        
        # Create app directory
        mkdir -p $APP_DIR
        chown -R $APP_USER:$APP_USER /home/$APP_USER
    "
    
    log_info "Setting up firewall..."
    ssh $SSH_OPTS root@$DROPLET_IP "
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
    
    SSH_OPTS="-i $SSH_KEY -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null"
    
    ssh $SSH_OPTS root@$DROPLET_IP "
        # Install Node.js
        curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
        apt-get install -y nodejs
        
        # Install PM2 globally
        npm install -g pm2
        
        # Install Caddy
        apt install -y debian-keyring debian-archive-keyring apt-transport-https
        curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
        curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
        apt update
        apt install -y caddy
        
        # Verify installations
        node --version
        npm --version
        pm2 --version
        caddy version
    "
    
    log_success "Dependencies installed successfully"
}

deploy_application() {
    log_info "Deploying application files..."
    
    SSH_OPTS="-i $SSH_KEY -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null"
    
    # Create temporary deployment package
    log_info "Creating deployment package..."
    TEMP_DIR=$(mktemp -d)
    
    # Copy necessary files (excluding development files)
    rsync -av \
        --exclude 'node_modules' \
        --exclude '.git' \
        --exclude '.next' \
        --exclude 'logs' \
        --exclude '.env.local' \
        --exclude '.env.development' \
        --exclude 'DIGITAL-OCEAN-DEPLOYMENT.md' \
        --exclude 'deploy-to-digitalocean.sh' \
        ./ $TEMP_DIR/
    
    # Upload files to droplet
    log_info "Uploading files to droplet..."
    rsync -avz -e "ssh $SSH_OPTS" $TEMP_DIR/ $APP_USER@$DROPLET_IP:$APP_DIR/
    
    # Clean up temporary directory
    rm -rf $TEMP_DIR
    
    log_info "Installing production dependencies..."
    ssh $SSH_OPTS $APP_USER@$DROPLET_IP "
        cd $APP_DIR
        npm ci --only=production
        npx prisma generate
        npx prisma migrate deploy
    "
    
    log_success "Application deployed successfully"
}

configure_environment() {
    log_info "Configuring environment variables..."
    
    SSH_OPTS="-i $SSH_KEY -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null"
    
    # Generate secure secrets
    NEXTAUTH_SECRET=$(openssl rand -base64 32)
    
    ssh $SSH_OPTS $APP_USER@$DROPLET_IP "
        cat > $APP_DIR/.env.production << 'EOL'
# Database
DATABASE_URL=\"file:./prisma/prod.db\"

# NextAuth Configuration
NEXTAUTH_URL=\"https://$DOMAIN\"
NEXTAUTH_SECRET=\"$NEXTAUTH_SECRET\"

# Application
NODE_ENV=production
PORT=3001

# Optional: Redis (uncomment if you install Redis)
# REDIS_URL=\"redis://localhost:6379\"
EOL
        chmod 600 $APP_DIR/.env.production
    "
    
    log_success "Environment configured"
}

setup_caddy() {
    log_info "Configuring Caddy reverse proxy..."
    
    SSH_OPTS="-i $SSH_KEY -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null"
    
    ssh $SSH_OPTS root@$DROPLET_IP "
        # Backup original Caddy config
        cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.backup
        
        # Create new Caddy configuration
        cat > /etc/caddy/Caddyfile << 'EOL'
# Plex Watch Together
$DOMAIN {
    # Reverse proxy to Node.js application
    reverse_proxy localhost:3001 {
        # WebSocket support for Socket.IO
        header_up Connection {\>Connection}
        header_up Upgrade {\>Upgrade}
        header_up Sec-WebSocket-Key {\>Sec-WebSocket-Key}
        header_up Sec-WebSocket-Version {\>Sec-WebSocket-Version}
        header_up Sec-WebSocket-Extensions {\>Sec-WebSocket-Extensions}
        header_up Sec-WebSocket-Protocol {\>Sec-WebSocket-Protocol}
        
        # Standard headers
        header_up Host {host}
        header_up X-Real-IP {remote_host}
        header_up X-Forwarded-For {remote_host}
        header_up X-Forwarded-Proto {scheme}
        header_up X-Forwarded-Host {host}
    }
    
    # Enable compression
    encode gzip zstd
    
    # Security headers
    header {
        Strict-Transport-Security \"max-age=31536000; includeSubDomains; preload\"
        X-Content-Type-Options \"nosniff\"
        X-Frame-Options \"SAMEORIGIN\"
        X-XSS-Protection \"1; mode=block\"
        Referrer-Policy \"strict-origin-when-cross-origin\"
        -Server
        -X-Powered-By
    }
    
    # Logging
    log {
        output file /var/log/caddy/access.log
        format json
    }
}
EOL
        
        # Create log directory
        mkdir -p /var/log/caddy
        chown caddy:caddy /var/log/caddy
        
        # Test and start Caddy
        caddy validate --config /etc/caddy/Caddyfile
        systemctl enable caddy
        systemctl restart caddy
    "
    
    log_success "Caddy configured and started"
}

setup_pm2() {
    log_info "Setting up PM2 process manager..."
    
    SSH_OPTS="-i $SSH_KEY -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null"
    
    ssh $SSH_OPTS $APP_USER@$DROPLET_IP "
        cd $APP_DIR
        
        # Create logs directory
        mkdir -p /home/$APP_USER/logs
        
        # Create PM2 ecosystem file
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
    watch: false,
    ignore_watch: ['node_modules', 'logs', '.git']
  }]
}
EOL
        
        # Start application with PM2
        pm2 delete plex-watch-together 2>/dev/null || true
        pm2 start ecosystem.config.js --env production
        
        # Save PM2 configuration
        pm2 save
        
        # Setup PM2 to start on boot
        pm2 startup | grep 'sudo' | sh
    "
    
    log_success "PM2 configured and application started"
}

setup_monitoring() {
    log_info "Setting up monitoring and backups..."
    
    SSH_OPTS="-i $SSH_KEY -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null"
    
    ssh $SSH_OPTS $APP_USER@$DROPLET_IP "
        # Create backup script
        cat > /home/$APP_USER/backup.sh << 'EOL'
#!/bin/bash

BACKUP_DIR=\"/home/$APP_USER/backups\"
APP_DIR=\"$APP_DIR\"
DATE=\$(date +%Y%m%d_%H%M%S)

# Create backup directory
mkdir -p \$BACKUP_DIR

# Backup database
cp \$APP_DIR/prisma/prod.db \$BACKUP_DIR/database_\$DATE.db 2>/dev/null || true

# Backup application files (excluding node_modules)
tar -czf \$BACKUP_DIR/app_\$DATE.tar.gz -C /home/$APP_USER --exclude=app/node_modules app/ 2>/dev/null || true

# Keep only last 7 days of backups
find \$BACKUP_DIR -name \"*.db\" -mtime +7 -delete 2>/dev/null || true
find \$BACKUP_DIR -name \"*.tar.gz\" -mtime +7 -delete 2>/dev/null || true

echo \"Backup completed: \$DATE\"
EOL
        
        chmod +x /home/$APP_USER/backup.sh
        
        # Setup cron job for backups
        (crontab -l 2>/dev/null; echo '0 2 * * * /home/$APP_USER/backup.sh >> /home/$APP_USER/logs/backup.log 2>&1') | crontab -
        (crontab -l 2>/dev/null; echo '@reboot pm2 resurrect') | crontab -
        
        # Setup logrotate
        sudo tee /etc/logrotate.d/plex-watch-together << 'EOL'
/home/$APP_USER/logs/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 644 $APP_USER $APP_USER
    postrotate
        su $APP_USER -c 'pm2 reload plex-watch-together'
    endscript
}
EOL
    "
    
    log_success "Monitoring and backups configured"
}

verify_deployment() {
    log_info "Verifying deployment..."
    
    SSH_OPTS="-i $SSH_KEY -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null"
    
    # Check if services are running
    ssh $SSH_OPTS $APP_USER@$DROPLET_IP "
        echo 'PM2 Status:'
        pm2 status
        
        echo -e '\nCaddy Status:'
        sudo systemctl status caddy --no-pager -l
        
        echo -e '\nApplication Health Check:'
        curl -s http://localhost:3001 > /dev/null && echo 'Local app: OK' || echo 'Local app: FAILED'
        
        echo -e '\nFirewall Status:'
        sudo ufw status
    "
    
    log_info "Testing external connectivity..."
    sleep 5  # Wait for DNS propagation
    
    # Test external access (might fail initially due to DNS propagation)
    if curl -s -o /dev/null -w "%{http_code}" https://$DOMAIN | grep -q "200\|301\|302"; then
        log_success "External access test: OK"
    else
        log_warning "External access test failed - this is normal if DNS hasn't propagated yet"
        log_warning "Try accessing https://$DOMAIN in a few minutes"
    fi
}

print_completion_info() {
    log_success "Deployment completed successfully!"
    
    echo -e "\n${GREEN}=== Deployment Summary ===${NC}"
    echo -e "${BLUE}Application URL:${NC} https://$DOMAIN"
    echo -e "${BLUE}Droplet IP:${NC} $DROPLET_IP"
    echo -e "${BLUE}SSH Access:${NC} ssh -i $SSH_KEY $APP_USER@$DROPLET_IP"
    
    echo -e "\n${YELLOW}=== Next Steps ===${NC}"
    echo "1. Wait for DNS propagation (can take up to 24 hours)"
    echo "2. Access your application at https://$DOMAIN"
    echo "3. Complete Plex setup in the web interface"
    echo "4. Test creating and joining rooms"
    
    echo -e "\n${YELLOW}=== Useful Commands ===${NC}"
    echo "# Check application status:"
    echo "ssh -i $SSH_KEY $APP_USER@$DROPLET_IP 'pm2 status'"
    echo ""
    echo "# View application logs:"
    echo "ssh -i $SSH_KEY $APP_USER@$DROPLET_IP 'pm2 logs plex-watch-together'"
    echo ""
    echo "# Restart application:"
    echo "ssh -i $SSH_KEY $APP_USER@$DROPLET_IP 'pm2 restart plex-watch-together'"
    echo ""
    echo "# Check Caddy status:"
    echo "ssh -i $SSH_KEY root@$DROPLET_IP 'systemctl status caddy'"
    
    echo -e "\n${YELLOW}=== Troubleshooting ===${NC}"
    echo "If you encounter issues:"
    echo "1. Check the logs: pm2 logs plex-watch-together"
    echo "2. Verify DNS resolution: nslookup $DOMAIN"
    echo "3. Test local connectivity: curl http://localhost:3001"
    echo "4. Check Caddy logs: sudo journalctl -u caddy -f"
    
    echo -e "\n${GREEN}🎉 Enjoy your Plex Watch Together application!${NC}"
}

# Main execution
main() {
    print_header
    
    check_prerequisites
    build_application
    setup_droplet
    install_dependencies
    deploy_application
    configure_environment
    setup_caddy
    setup_pm2
    setup_monitoring
    verify_deployment
    print_completion_info
}

# Run main function if script is executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi