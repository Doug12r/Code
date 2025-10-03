#!/bin/bash

# Plex Watch Together - One-Click Installation Script
# This script automates the complete setup of Plex Watch Together

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_NAME="plex-watch-together"
NODE_MIN_VERSION="18"
DEFAULT_PORT="3000"

# Logging functions
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

# Check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check system requirements
check_requirements() {
    log_info "Checking system requirements..."
    
    # Check Node.js
    if command_exists node; then
        NODE_VERSION=$(node --version | cut -d 'v' -f 2 | cut -d '.' -f 1)
        if [ "$NODE_VERSION" -ge "$NODE_MIN_VERSION" ]; then
            log_success "Node.js $(node --version) is installed"
        else
            log_error "Node.js version $NODE_MIN_VERSION or higher is required. Current: $(node --version)"
            exit 1
        fi
    else
        log_error "Node.js is not installed. Please install Node.js $NODE_MIN_VERSION or higher."
        log_info "Visit: https://nodejs.org/"
        exit 1
    fi
    
    # Check npm
    if command_exists npm; then
        log_success "npm $(npm --version) is installed"
    else
        log_error "npm is not installed"
        exit 1
    fi
    
    # Check Git
    if command_exists git; then
        log_success "Git $(git --version | cut -d ' ' -f 3) is installed"
    else
        log_error "Git is not installed. Please install Git."
        exit 1
    fi
    
    # Check for optional dependencies
    if command_exists docker; then
        log_success "Docker $(docker --version | cut -d ' ' -f 3 | sed 's/,//') is available"
        DOCKER_AVAILABLE=true
    else
        log_warning "Docker is not installed (optional for container deployment)"
        DOCKER_AVAILABLE=false
    fi
    
    if command_exists ffmpeg; then
        log_success "FFmpeg $(ffmpeg -version 2>/dev/null | head -n1 | cut -d ' ' -f 3) is available"
    else
        log_warning "FFmpeg is not installed (required for video transcoding)"
        log_info "Install FFmpeg: https://ffmpeg.org/download.html"
    fi
}

# Detect installation method
detect_installation_method() {
    if [ -d ".git" ] && [ -f "package.json" ]; then
        INSTALL_METHOD="existing"
        log_info "Detected existing project directory"
    else
        INSTALL_METHOD="clone"
        log_info "Will clone repository"
    fi
}

# Interactive configuration
interactive_config() {
    log_info "Setting up configuration..."
    
    # Basic configuration
    read -p "Enter application port (default: $DEFAULT_PORT): " APP_PORT
    APP_PORT=${APP_PORT:-$DEFAULT_PORT}
    
    # Plex configuration
    echo ""
    log_info "Plex Server Configuration:"
    read -p "Enter your Plex server URL (e.g., http://localhost:32400): " PLEX_URL
    read -p "Enter your Plex authentication token: " PLEX_TOKEN
    
    # Database configuration
    echo ""
    log_info "Database Configuration:"
    echo "1) SQLite (development/small deployments)"
    echo "2) PostgreSQL (production recommended)"
    read -p "Choose database type (1 or 2, default: 1): " DB_TYPE
    DB_TYPE=${DB_TYPE:-1}
    
    if [ "$DB_TYPE" = "2" ]; then
        read -p "PostgreSQL connection string: " DATABASE_URL
    else
        DATABASE_URL="file:./dev.db"
    fi
    
    # Redis configuration (optional)
    echo ""
    read -p "Do you want to configure Redis for caching? (y/n, default: n): " USE_REDIS
    if [ "$USE_REDIS" = "y" ] || [ "$USE_REDIS" = "Y" ]; then
        read -p "Redis connection string (default: redis://localhost:6379): " REDIS_URL
        REDIS_URL=${REDIS_URL:-redis://localhost:6379}
    fi
    
    # Security configuration
    echo ""
    log_info "Security Configuration:"
    NEXTAUTH_SECRET=$(openssl rand -base64 32 2>/dev/null || python3 -c "import secrets; print(secrets.token_urlsafe(32))" 2>/dev/null || echo "CHANGE_THIS_IN_PRODUCTION_$(date +%s)")
    ENCRYPTION_KEY=$(openssl rand -base64 32 2>/dev/null || python3 -c "import secrets; print(secrets.token_urlsafe(32))" 2>/dev/null || echo "CHANGE_THIS_IN_PRODUCTION_$(date +%s)")
    
    log_success "Generated secure keys automatically"
}

# Create environment file
create_env_file() {
    log_info "Creating environment configuration..."
    
    cat > .env.local << EOF
# Application Configuration
NEXTAUTH_URL=http://localhost:${APP_PORT}
NEXTAUTH_SECRET=${NEXTAUTH_SECRET}
PORT=${APP_PORT}

# Database Configuration
DATABASE_URL=${DATABASE_URL}

# Plex Configuration
PLEX_BASE_URL=${PLEX_URL}
PLEX_TOKEN=${PLEX_TOKEN}

# Security
ENCRYPTION_KEY=${ENCRYPTION_KEY}

# Redis (optional)
EOF

    if [ -n "$REDIS_URL" ]; then
        echo "REDIS_URL=${REDIS_URL}" >> .env.local
    fi
    
    cat >> .env.local << EOF

# Development/Production
NODE_ENV=development

# Rate Limiting Configuration
RATE_LIMIT_ENABLED=true
RATE_LIMIT_GENERAL_POINTS=300
RATE_LIMIT_AUTH_POINTS=50

# Video Transcoding
FFMPEG_PATH=ffmpeg
TRANSCODE_QUALITY=medium
MAX_CONCURRENT_TRANSCODES=3
EOF

    log_success "Environment file created: .env.local"
}

# Install dependencies
install_dependencies() {
    log_info "Installing dependencies..."
    
    if [ ! -f "package.json" ]; then
        log_error "package.json not found. Are you in the correct directory?"
        exit 1
    fi
    
    # Install npm dependencies
    npm ci || npm install
    log_success "Dependencies installed successfully"
    
    # Install additional production dependencies if needed
    if ! npm list bcryptjs >/dev/null 2>&1; then
        npm install bcryptjs
    fi
    
    if ! npm list rate-limiter-flexible >/dev/null 2>&1; then
        npm install rate-limiter-flexible
    fi
}

# Setup database
setup_database() {
    log_info "Setting up database..."
    
    # Generate Prisma client
    if command_exists npx; then
        npx prisma generate
        log_success "Prisma client generated"
        
        # Run database migrations
        if [ "$DB_TYPE" = "1" ]; then
            # SQLite - create database file
            npx prisma db push
            log_success "SQLite database initialized"
        else
            # PostgreSQL - run migrations
            npx prisma migrate deploy
            log_success "PostgreSQL migrations applied"
        fi
    else
        log_error "npx not available. Please run 'npx prisma generate' and 'npx prisma db push' manually"
    fi
}

# Build application
build_application() {
    log_info "Building application..."
    
    npm run build
    log_success "Application built successfully"
}

# Create systemd service (Linux)
create_systemd_service() {
    if [ "$EUID" -eq 0 ] && command_exists systemctl; then
        read -p "Create systemd service for auto-start? (y/n, default: n): " CREATE_SERVICE
        if [ "$CREATE_SERVICE" = "y" ] || [ "$CREATE_SERVICE" = "Y" ]; then
            SERVICE_USER=$(logname 2>/dev/null || whoami)
            CURRENT_DIR=$(pwd)
            
            cat > /etc/systemd/system/plex-watch-together.service << EOF
[Unit]
Description=Plex Watch Together
After=network.target

[Service]
Type=simple
User=${SERVICE_USER}
WorkingDirectory=${CURRENT_DIR}
Environment=NODE_ENV=production
ExecStart=/usr/bin/npm start
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

            systemctl daemon-reload
            systemctl enable plex-watch-together
            log_success "Systemd service created and enabled"
        fi
    fi
}

# Create Docker setup
create_docker_setup() {
    if [ "$DOCKER_AVAILABLE" = true ]; then
        read -p "Create Docker setup? (y/n, default: n): " CREATE_DOCKER
        if [ "$CREATE_DOCKER" = "y" ] || [ "$CREATE_DOCKER" = "Y" ]; then
            log_info "Creating Docker configuration..."
            
            # Create Dockerfile if it doesn't exist
            if [ ! -f "Dockerfile" ]; then
                cat > Dockerfile << EOF
FROM node:18-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy application
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Build application
RUN npm run build

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

# Start application
CMD ["npm", "start"]
EOF
            fi
            
            # Create docker-compose.yml if it doesn't exist
            if [ ! -f "docker-compose.yml" ]; then
                cat > docker-compose.yml << EOF
version: '3.8'

services:
  app:
    build: .
    ports:
      - "${APP_PORT}:3000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://plex:plex@db:5432/plexwatchtogether
      - REDIS_URL=redis://redis:6379
    env_file:
      - .env.local
    depends_on:
      - db
      - redis
    restart: unless-stopped

  db:
    image: postgres:15-alpine
    environment:
      - POSTGRES_USER=plex
      - POSTGRES_PASSWORD=plex
      - POSTGRES_DB=plexwatchtogether
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    volumes:
      - redis_data:/data

volumes:
  postgres_data:
  redis_data:
EOF
            fi
            
            log_success "Docker configuration created"
            log_info "Run with: docker-compose up -d"
        fi
    fi
}

# Test installation
test_installation() {
    log_info "Testing installation..."
    
    # Start the application in test mode
    timeout 30s npm run dev > /tmp/plex-test.log 2>&1 &
    TEST_PID=$!
    
    sleep 10
    
    # Test if application is responding
    if curl -f "http://localhost:${APP_PORT}" >/dev/null 2>&1; then
        log_success "Application is responding on port ${APP_PORT}"
        kill $TEST_PID 2>/dev/null || true
        return 0
    else
        log_error "Application is not responding. Check logs:"
        tail /tmp/plex-test.log
        kill $TEST_PID 2>/dev/null || true
        return 1
    fi
}

# Print final instructions
print_final_instructions() {
    echo ""
    log_success "🎉 Installation completed successfully!"
    echo ""
    log_info "Next steps:"
    echo "1. Start the application:"
    echo "   npm run dev (development)"
    echo "   npm run build && npm start (production)"
    echo ""
    echo "2. Access the application:"
    echo "   http://localhost:${APP_PORT}"
    echo ""
    echo "3. Configure your Plex server:"
    echo "   - Ensure Plex Media Server is running"
    echo "   - Verify network connectivity to: ${PLEX_URL}"
    echo "   - Check that your Plex token is valid"
    echo ""
    
    if [ "$DOCKER_AVAILABLE" = true ] && [ -f "docker-compose.yml" ]; then
        echo "4. Docker deployment:"
        echo "   docker-compose up -d"
        echo ""
    fi
    
    log_info "Configuration files created:"
    echo "   - .env.local (environment variables)"
    [ -f "Dockerfile" ] && echo "   - Dockerfile (container image)"
    [ -f "docker-compose.yml" ] && echo "   - docker-compose.yml (multi-service deployment)"
    echo ""
    
    log_warning "Security reminders:"
    echo "   - Change default passwords in production"
    echo "   - Enable HTTPS in production environments"
    echo "   - Regularly update dependencies"
    echo "   - Monitor application logs"
    echo ""
}

# Main installation function
main() {
    echo ""
    echo "🎬 Plex Watch Together - One-Click Installation"
    echo "=============================================="
    echo ""
    
    # Check if we're in the right directory or need to clone
    detect_installation_method
    
    # Check system requirements
    check_requirements
    
    # Interactive configuration
    interactive_config
    
    # Create environment file
    create_env_file
    
    # Install dependencies
    install_dependencies
    
    # Setup database
    setup_database
    
    # Build application (for production)
    if [ "$NODE_ENV" = "production" ]; then
        build_application
    fi
    
    # Create systemd service (optional)
    create_systemd_service
    
    # Create Docker setup (optional)
    create_docker_setup
    
    # Test installation
    if test_installation; then
        print_final_instructions
    else
        log_error "Installation test failed. Please check the configuration and try again."
        exit 1
    fi
}

# Run main function
main "$@"