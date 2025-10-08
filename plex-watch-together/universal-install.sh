#!/bin/bash

# Plex Watch Together - Universal Linux Server Installer
# Compatible with: Ubuntu, Debian, CentOS, RHEL, Fedora
# Supports: Custom domains, SSL with Caddy, Multiple database types
# Usage: ./universal-install.sh

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Global variables
DOMAIN=""
APP_USER="plexwatch"
APP_DIR="/home/$APP_USER/app"
NODE_VERSION="20"
DATABASE_TYPE=""
DATABASE_URL=""
SSL_EMAIL=""
INSTALL_TYPE=""

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

log_step() {
    echo -e "${PURPLE}[STEP]${NC} $1"
}

print_header() {
    clear
    echo -e "${CYAN}"
    cat << "EOF"
 ____  _            __        __    _       _     
|  _ \| | _____  __ \ \      / /_ _| |_ ___| |__  
| |_) | |/ _ \ \/ /  \ \ /\ / / _` | __/ __| '_ \ 
|  __/| |  __/>  <    \ V  V / (_| | || (__| | | |
|_|   |_|\___/_/\_\    \_/\_/ \__,_|\__\___|_| |_|
                                                  
 _____                 _   _               
|_   _|__   __ _  ___ | |_| |__   ___ _ __ 
  | |/ _ \ / _` |/ _ \| __| '_ \ / _ \ '__|
  | | (_) | (_| |  __/| |_| | | |  __/ |   
  |_|\___/ \__, |\___| \__|_| |_|\___|_|   
           |___/                           

Universal Linux Server Installer
EOF
    echo -e "${NC}"
    echo -e "${GREEN}Supports: Ubuntu, Debian, CentOS, RHEL, Fedora, AWS, DigitalOcean, Linode, Vultr${NC}"
    echo -e "${BLUE}Features: Auto SSL with Caddy, Multiple databases, Domain configuration${NC}"
    echo "============================================================================"
    echo
}

detect_os() {
    log_step "Detecting operating system..."
    
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        OS=$ID
        VERSION=$VERSION_ID
    elif type lsb_release >/dev/null 2>&1; then
        OS=$(lsb_release -si | tr '[:upper:]' '[:lower:]')
        VERSION=$(lsb_release -sr)
    elif [ -f /etc/redhat-release ]; then
        OS="centos"
    else
        log_error "Cannot detect OS. This script supports Ubuntu, Debian, CentOS, RHEL, Fedora"
        exit 1
    fi
    
    log_success "Detected: $OS $VERSION"
}

check_root() {
    if [ "$EUID" -eq 0 ]; then
        log_error "Please do not run this script as root. Run as a regular user with sudo access."
        exit 1
    fi
    
    if ! sudo -n true 2>/dev/null; then
        log_error "This script requires sudo access. Please ensure your user can run sudo commands."
        exit 1
    fi
}

collect_configuration() {
    log_step "Collecting configuration..."
    
    echo -e "${CYAN}Installation Configuration${NC}"
    echo "=========================="
    
    # Installation type
    echo
    echo -e "${YELLOW}Choose installation type:${NC}"
    echo "1) Full installation (Recommended - includes Node.js, database, Caddy)"
    echo "2) App only (Node.js and database already installed)"
    echo "3) Custom (Choose components)"
    read -p "Enter choice [1]: " install_choice
    install_choice=${install_choice:-1}
    
    case $install_choice in
        1) INSTALL_TYPE="full" ;;
        2) INSTALL_TYPE="app_only" ;;
        3) INSTALL_TYPE="custom" ;;
        *) INSTALL_TYPE="full" ;;
    esac
    
    # Domain configuration
    echo
    echo -e "${YELLOW}Domain Configuration:${NC}"
    read -p "Enter your domain (e.g., plexwatch.yourdomain.com): " DOMAIN
    
    if [ -z "$DOMAIN" ]; then
        log_error "Domain is required for SSL configuration"
        exit 1
    fi
    
    # SSL Email
    read -p "Enter email for SSL certificates: " SSL_EMAIL
    if [ -z "$SSL_EMAIL" ]; then
        SSL_EMAIL="admin@$DOMAIN"
    fi
    
    # Database configuration
    echo
    echo -e "${YELLOW}Database Configuration:${NC}"
    echo "1) SQLite (Local file - easiest)"
    echo "2) PostgreSQL (Local installation)"
    echo "3) MySQL/MariaDB (Local installation)"
    echo "4) External database (provide connection string)"
    read -p "Choose database type [1]: " db_choice
    db_choice=${db_choice:-1}
    
    case $db_choice in
        1) 
            DATABASE_TYPE="sqlite"
            DATABASE_URL="file:./prisma/prod.db"
            ;;
        2)
            DATABASE_TYPE="postgresql"
            read -p "PostgreSQL database name [plexwatch]: " pg_db
            pg_db=${pg_db:-plexwatch}
            read -p "PostgreSQL username [plexwatch]: " pg_user
            pg_user=${pg_user:-plexwatch}
            read -s -p "PostgreSQL password: " pg_pass
            echo
            DATABASE_URL="postgresql://$pg_user:$pg_pass@localhost:5432/$pg_db"
            ;;
        3)
            DATABASE_TYPE="mysql"
            read -p "MySQL database name [plexwatch]: " mysql_db
            mysql_db=${mysql_db:-plexwatch}
            read -p "MySQL username [plexwatch]: " mysql_user
            mysql_user=${mysql_user:-plexwatch}
            read -s -p "MySQL password: " mysql_pass
            echo
            DATABASE_URL="mysql://$mysql_user:$mysql_pass@localhost:3306/$mysql_db"
            ;;
        4)
            DATABASE_TYPE="external"
            read -p "Enter full database connection string: " DATABASE_URL
            ;;
        *)
            DATABASE_TYPE="sqlite"
            DATABASE_URL="file:./prisma/prod.db"
            ;;
    esac
    
    # Confirmation
    echo
    echo -e "${GREEN}Configuration Summary:${NC}"
    echo "======================="
    echo -e "${BLUE}Domain:${NC} $DOMAIN"
    echo -e "${BLUE}SSL Email:${NC} $SSL_EMAIL"
    echo -e "${BLUE}Database:${NC} $DATABASE_TYPE"
    echo -e "${BLUE}Install Type:${NC} $INSTALL_TYPE"
    echo
    read -p "Continue with installation? [y/N]: " confirm
    if [[ ! $confirm =~ ^[Yy]$ ]]; then
        log_info "Installation cancelled"
        exit 0
    fi
}

install_dependencies() {
    log_step "Installing system dependencies..."
    
    case $OS in
        ubuntu|debian)
            sudo apt update
            sudo apt install -y curl wget git nano htop ufw fail2ban unzip build-essential
            
            if [[ "$INSTALL_TYPE" == "full" || "$INSTALL_TYPE" == "custom" ]]; then
                # Install Node.js
                curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | sudo -E bash -
                sudo apt-get install -y nodejs
                
                # Install Caddy
                sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
                curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
                curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
                sudo apt update
                sudo apt install -y caddy
                
                # Install databases
                if [ "$DATABASE_TYPE" = "postgresql" ]; then
                    sudo apt install -y postgresql postgresql-contrib
                elif [ "$DATABASE_TYPE" = "mysql" ]; then
                    sudo apt install -y mysql-server
                fi
            fi
            ;;
            
        centos|rhel|fedora)
            if command -v dnf &> /dev/null; then
                PKG_MGR="dnf"
            else
                PKG_MGR="yum"
            fi
            
            sudo $PKG_MGR update -y
            sudo $PKG_MGR install -y curl wget git nano htop firewalld fail2ban unzip gcc-c++ make
            
            if [[ "$INSTALL_TYPE" == "full" || "$INSTALL_TYPE" == "custom" ]]; then
                # Install Node.js
                curl -fsSL https://rpm.nodesource.com/setup_${NODE_VERSION}.x | sudo bash -
                sudo $PKG_MGR install -y nodejs
                
                # Install Caddy
                sudo $PKG_MGR install -y 'dnf-command(copr)' || true
                sudo dnf copr enable @caddy/caddy -y || sudo yum-config-manager --add-repo https://copr.fedorainfracloud.org/coprs/g/caddy/caddy/repo/epel-7/group_caddy-caddy-epel-7.repo
                sudo $PKG_MGR install -y caddy
                
                # Install databases
                if [ "$DATABASE_TYPE" = "postgresql" ]; then
                    sudo $PKG_MGR install -y postgresql postgresql-server postgresql-contrib
                elif [ "$DATABASE_TYPE" = "mysql" ]; then
                    sudo $PKG_MGR install -y mysql-server
                fi
            fi
            ;;
            
        *)
            log_error "Unsupported OS: $OS"
            exit 1
            ;;
    esac
    
    # Install PM2 globally
    sudo npm install -g pm2
    
    log_success "Dependencies installed successfully"
}

setup_firewall() {
    log_step "Configuring firewall..."
    
    case $OS in
        ubuntu|debian)
            sudo ufw --force reset
            sudo ufw allow ssh
            sudo ufw allow 80
            sudo ufw allow 443
            sudo ufw --force enable
            ;;
        centos|rhel|fedora)
            sudo systemctl enable firewalld
            sudo systemctl start firewalld
            sudo firewall-cmd --permanent --add-service=ssh
            sudo firewall-cmd --permanent --add-service=http
            sudo firewall-cmd --permanent --add-service=https
            sudo firewall-cmd --reload
            ;;
    esac
    
    log_success "Firewall configured"
}

setup_database() {
    if [ "$DATABASE_TYPE" = "sqlite" ] || [ "$DATABASE_TYPE" = "external" ]; then
        return 0
    fi
    
    log_step "Setting up $DATABASE_TYPE database..."
    
    if [ "$DATABASE_TYPE" = "postgresql" ]; then
        # Initialize PostgreSQL
        if [ "$OS" = "centos" ] || [ "$OS" = "rhel" ] || [ "$OS" = "fedora" ]; then
            sudo postgresql-setup --initdb || sudo postgresql-setup initdb
        fi
        
        sudo systemctl enable postgresql
        sudo systemctl start postgresql
        
        # Create database and user
        sudo -u postgres createuser --createdb $pg_user || true
        sudo -u postgres createdb $pg_db -O $pg_user || true
        sudo -u postgres psql -c "ALTER USER $pg_user PASSWORD '$pg_pass';" || true
        
    elif [ "$DATABASE_TYPE" = "mysql" ]; then
        sudo systemctl enable mysql
        sudo systemctl start mysql
        
        # Secure installation and create database
        mysql -u root -e "CREATE DATABASE IF NOT EXISTS $mysql_db;"
        mysql -u root -e "CREATE USER IF NOT EXISTS '$mysql_user'@'localhost' IDENTIFIED BY '$mysql_pass';"
        mysql -u root -e "GRANT ALL PRIVILEGES ON $mysql_db.* TO '$mysql_user'@'localhost';"
        mysql -u root -e "FLUSH PRIVILEGES;"
    fi
    
    log_success "Database setup completed"
}

create_user() {
    log_step "Creating application user..."
    
    if ! id "$APP_USER" &>/dev/null; then
        sudo adduser --disabled-password --gecos '' $APP_USER
        sudo usermod -aG sudo $APP_USER
        echo "$APP_USER ALL=(ALL) NOPASSWD:ALL" | sudo tee -a /etc/sudoers
    fi
    
    sudo mkdir -p $APP_DIR
    sudo chown -R $APP_USER:$APP_USER /home/$APP_USER
    
    log_success "Application user created"
}

deploy_application() {
    log_step "Deploying Plex Watch Together application..."
    
    # Clone or copy application files
    if [ -d "/tmp/plex-watch-together" ]; then
        sudo cp -r /tmp/plex-watch-together/* $APP_DIR/
    else
        # If running from within the project directory
        sudo cp -r . $APP_DIR/
    fi
    
    sudo chown -R $APP_USER:$APP_USER $APP_DIR
    
    # Switch to app user and install dependencies
    sudo -u $APP_USER bash << EOF
cd $APP_DIR
npm ci --only=production
npx prisma generate
npm run build
EOF
    
    log_success "Application deployed"
}

configure_environment() {
    log_step "Configuring environment variables..."
    
    NEXTAUTH_SECRET=$(openssl rand -base64 32)
    
    sudo -u $APP_USER bash << EOF
cat > $APP_DIR/.env.production << 'EOL'
DATABASE_URL="$DATABASE_URL"
NEXTAUTH_URL="https://$DOMAIN"
NEXTAUTH_SECRET="$NEXTAUTH_SECRET"
NODE_ENV=production
PORT=3001
EOL
chmod 600 $APP_DIR/.env.production
EOF
    
    log_success "Environment configured"
}

setup_caddy() {
    log_step "Configuring Caddy reverse proxy..."
    
    sudo tee /etc/caddy/Caddyfile > /dev/null << EOL
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
        Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
        X-Content-Type-Options "nosniff"
        X-Frame-Options "SAMEORIGIN"
        X-XSS-Protection "1; mode=block"
        Referrer-Policy "strict-origin-when-cross-origin"
        -Server
        -X-Powered-By
    }
    
    log {
        output file /var/log/caddy/access.log
        format json
    }
}

# Redirect www to non-www
www.$DOMAIN {
    redir https://$DOMAIN{uri} permanent
}
EOL
    
    sudo mkdir -p /var/log/caddy
    sudo chown caddy:caddy /var/log/caddy
    sudo caddy validate --config /etc/caddy/Caddyfile
    sudo systemctl enable caddy
    sudo systemctl restart caddy
    
    log_success "Caddy configured and started"
}

setup_pm2() {
    log_step "Setting up PM2 process manager..."
    
    sudo -u $APP_USER bash << EOF
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

# Initialize database
npx prisma migrate deploy

# Start application
pm2 delete plex-watch-together 2>/dev/null || true
pm2 start ecosystem.config.js --env production
pm2 save
EOF
    
    # Setup PM2 startup script
    sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u $APP_USER --hp /home/$APP_USER
    
    log_success "PM2 configured and application started"
}

create_management_scripts() {
    log_step "Creating management scripts..."
    
    # Create start script
    sudo tee /usr/local/bin/plexwatch-start > /dev/null << 'EOF'
#!/bin/bash
sudo -u plexwatch pm2 start /home/plexwatch/app/ecosystem.config.js --env production
sudo systemctl start caddy
EOF
    
    # Create stop script
    sudo tee /usr/local/bin/plexwatch-stop > /dev/null << 'EOF'
#!/bin/bash
sudo -u plexwatch pm2 stop plex-watch-together
sudo systemctl stop caddy
EOF
    
    # Create status script
    sudo tee /usr/local/bin/plexwatch-status > /dev/null << 'EOF'
#!/bin/bash
echo "=== Plex Watch Together Status ==="
echo "App Status:"
sudo -u plexwatch pm2 status
echo
echo "Caddy Status:"
sudo systemctl status caddy --no-pager -l
echo
echo "Application Logs (last 20 lines):"
sudo -u plexwatch pm2 logs plex-watch-together --lines 20
EOF
    
    # Create update script
    sudo tee /usr/local/bin/plexwatch-update > /dev/null << 'EOF'
#!/bin/bash
cd /home/plexwatch/app
sudo -u plexwatch git pull
sudo -u plexwatch npm ci --only=production
sudo -u plexwatch npx prisma migrate deploy
sudo -u plexwatch npm run build
sudo -u plexwatch pm2 restart plex-watch-together
EOF
    
    sudo chmod +x /usr/local/bin/plexwatch-*
    
    log_success "Management scripts created"
}

verify_installation() {
    log_step "Verifying installation..."
    
    sleep 5
    
    # Check PM2 status
    if sudo -u $APP_USER pm2 list | grep -q "plex-watch-together"; then
        log_success "✓ Application is running"
    else
        log_error "✗ Application failed to start"
        return 1
    fi
    
    # Check Caddy status
    if systemctl is-active --quiet caddy; then
        log_success "✓ Caddy is running"
    else
        log_error "✗ Caddy failed to start"
        return 1
    fi
    
    # Check local application
    if curl -s http://localhost:3001 > /dev/null; then
        log_success "✓ Application responds locally"
    else
        log_warning "⚠ Application may not be responding locally"
    fi
    
    log_success "Installation verification completed"
}

print_completion_info() {
    log_success "🎉 Plex Watch Together installation completed successfully!"
    
    echo
    echo -e "${GREEN}=== Installation Summary ===${NC}"
    echo -e "${BLUE}Application URL:${NC} https://$DOMAIN"
    echo -e "${BLUE}Database Type:${NC} $DATABASE_TYPE"
    echo -e "${BLUE}Application User:${NC} $APP_USER"
    echo -e "${BLUE}Application Directory:${NC} $APP_DIR"
    
    echo
    echo -e "${YELLOW}=== Management Commands ===${NC}"
    echo -e "${BLUE}Start:${NC} plexwatch-start"
    echo -e "${BLUE}Stop:${NC} plexwatch-stop"
    echo -e "${BLUE}Status:${NC} plexwatch-status"
    echo -e "${BLUE}Update:${NC} plexwatch-update"
    
    echo
    echo -e "${YELLOW}=== Next Steps ===${NC}"
    echo "1. Point your domain DNS to this server's IP address"
    echo "2. Wait for DNS propagation (5-30 minutes)"
    echo "3. Visit https://$DOMAIN to access your application"
    echo "4. Complete Plex setup in the web interface"
    echo "5. Create rooms and start watching together!"
    
    echo
    echo -e "${YELLOW}=== Important Files ===${NC}"
    echo -e "${BLUE}Configuration:${NC} $APP_DIR/.env.production"
    echo -e "${BLUE}Logs:${NC} /home/$APP_USER/logs/"
    echo -e "${BLUE}Caddy Config:${NC} /etc/caddy/Caddyfile"
    
    echo
    echo -e "${GREEN}🚀 Your Plex Watch Together server is ready!${NC}"
}

# Main installation process
main() {
    print_header
    check_root
    detect_os
    collect_configuration
    install_dependencies
    setup_firewall
    create_user
    setup_database
    deploy_application
    configure_environment
    setup_caddy
    setup_pm2
    create_management_scripts
    verify_installation
    print_completion_info
}

# Handle interruptions
trap 'log_error "Installation interrupted"; exit 1' INT TERM

# Run main installation
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi