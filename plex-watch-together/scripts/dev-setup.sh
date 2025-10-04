#!/bin/bash
# Development Environment Setup Script
# Sets up complete development environment with all dependencies

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
NODE_VERSION="20"
PNPM_VERSION="8"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Logging functions
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Check system requirements
check_system_requirements() {
    log_info "Checking system requirements..."
    
    # Check OS
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        OS="linux"
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        OS="macos"
    elif [[ "$OSTYPE" == "cygwin" ]] || [[ "$OSTYPE" == "msys" ]]; then
        OS="windows"
    else
        log_error "Unsupported operating system: $OSTYPE"
        exit 1
    fi
    
    log_success "Operating system detected: $OS"
    
    # Check available memory
    if command -v free >/dev/null 2>&1; then
        local available_mem=$(free -m | awk 'NR==2{printf "%.0f", $7}')
        if [ "$available_mem" -lt 2048 ]; then
            log_warning "Available memory is less than 2GB. Development may be slow."
        fi
    fi
    
    # Check disk space
    local available_space=$(df . | awk 'NR==2 {print $4}')
    if [ "$available_space" -lt 5242880 ]; then  # 5GB in KB
        log_warning "Available disk space is less than 5GB."
    fi
}

# Install Node.js and pnpm
install_nodejs() {
    log_info "Setting up Node.js and pnpm..."
    
    # Check if Node.js is already installed with correct version
    if command -v node >/dev/null 2>&1; then
        local current_version=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
        if [ "$current_version" -ge "$NODE_VERSION" ]; then
            log_success "Node.js $current_version is already installed"
        else
            log_warning "Node.js version $current_version is outdated. Minimum required: $NODE_VERSION"
        fi
    else
        log_info "Installing Node.js $NODE_VERSION..."
        
        if [ "$OS" = "linux" ]; then
            # Install using NodeSource repository
            curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | sudo -E bash -
            sudo apt-get install -y nodejs
        elif [ "$OS" = "macos" ]; then
            # Install using Homebrew
            if command -v brew >/dev/null 2>&1; then
                brew install node@${NODE_VERSION}
            else
                log_error "Homebrew not found. Please install Homebrew first."
                exit 1
            fi
        fi
        
        log_success "Node.js installed successfully"
    fi
    
    # Install pnpm
    if ! command -v pnpm >/dev/null 2>&1; then
        log_info "Installing pnpm..."
        npm install -g pnpm@${PNPM_VERSION}
        log_success "pnpm installed successfully"
    else
        log_success "pnpm is already installed"
    fi
}

# Install Docker and Docker Compose
install_docker() {
    log_info "Setting up Docker..."
    
    if command -v docker >/dev/null 2>&1; then
        log_success "Docker is already installed"
        
        # Check if Docker daemon is running
        if ! docker info >/dev/null 2>&1; then
            log_warning "Docker daemon is not running. Please start Docker."
            
            # Try to start Docker service on Linux
            if [ "$OS" = "linux" ]; then
                sudo systemctl start docker || log_warning "Failed to start Docker service"
            fi
        fi
    else
        log_info "Installing Docker..."
        
        if [ "$OS" = "linux" ]; then
            # Install Docker on Linux
            curl -fsSL https://get.docker.com -o get-docker.sh
            sh get-docker.sh
            sudo usermod -aG docker $USER
            rm get-docker.sh
            
            # Install Docker Compose
            sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" \
                -o /usr/local/bin/docker-compose
            sudo chmod +x /usr/local/bin/docker-compose
            
            log_success "Docker and Docker Compose installed successfully"
            log_warning "Please log out and log back in to use Docker without sudo"
        elif [ "$OS" = "macos" ]; then
            log_info "Please install Docker Desktop for macOS from: https://www.docker.com/products/docker-desktop"
            log_warning "Docker Desktop includes Docker Compose"
        fi
    fi
    
    # Verify Docker Compose
    if command -v docker-compose >/dev/null 2>&1 || docker compose version >/dev/null 2>&1; then
        log_success "Docker Compose is available"
    else
        log_error "Docker Compose not found"
        exit 1
    fi
}

# Install development tools
install_dev_tools() {
    log_info "Installing development tools..."
    
    # Install Git if not present
    if ! command -v git >/dev/null 2>&1; then
        log_info "Installing Git..."
        
        if [ "$OS" = "linux" ]; then
            sudo apt-get update
            sudo apt-get install -y git
        elif [ "$OS" = "macos" ]; then
            xcode-select --install
        fi
        
        log_success "Git installed successfully"
    else
        log_success "Git is already installed"
    fi
    
    # Install curl if not present
    if ! command -v curl >/dev/null 2>&1; then
        log_info "Installing curl..."
        
        if [ "$OS" = "linux" ]; then
            sudo apt-get install -y curl
        fi
        
        log_success "curl installed successfully"
    else
        log_success "curl is already installed"
    fi
    
    # Install additional development tools for Linux
    if [ "$OS" = "linux" ]; then
        log_info "Installing additional development tools..."
        sudo apt-get install -y \
            build-essential \
            python3-pip \
            jq \
            htop \
            tree \
            unzip
        log_success "Additional development tools installed"
    fi
}

# Setup project environment
setup_project_environment() {
    log_info "Setting up project environment..."
    
    cd "$PROJECT_DIR"
    
    # Create environment files if they don't exist
    local env_files=(".env.local" ".env.development" ".env.test")
    
    for env_file in "${env_files[@]}"; do
        if [ ! -f "$env_file" ]; then
            log_info "Creating $env_file..."
            
            cat > "$env_file" << EOF
# Database
DATABASE_URL="postgresql://postgres:password@localhost:5432/plex_dev"
DATABASE_POOL_SIZE=10

# Redis
REDIS_URL="redis://localhost:6379"

# Auth
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="$(openssl rand -base64 32)"

# Plex
PLEX_SERVER_URL="http://localhost:32400"
PLEX_TOKEN=""

# Security
JWT_SECRET="$(openssl rand -base64 32)"
ENCRYPTION_KEY="$(openssl rand -base64 32)"

# Features
ENABLE_OFFLINE_MODE=true
ENABLE_ADVANCED_SYNC=true
ENABLE_PERFORMANCE_MONITORING=true

# Development
NODE_ENV="development"
LOG_LEVEL="debug"
ENABLE_DEBUG_LOGS=true

# Socket.io
SOCKET_IO_ADAPTER="memory"

# Cache
CACHE_TTL=300
ENABLE_REDIS_CACHE=true

# Monitoring
ENABLE_METRICS=true
METRICS_PORT=9090
EOF
            
            log_success "$env_file created with default values"
        else
            log_success "$env_file already exists"
        fi
    done
    
    # Make sure environment files are not tracked by git
    if ! grep -q "\.env\." .gitignore 2>/dev/null; then
        echo -e "\n# Environment files\n.env.*\n!.env.example" >> .gitignore
        log_info "Added environment files to .gitignore"
    fi
}

# Install project dependencies
install_dependencies() {
    log_info "Installing project dependencies..."
    
    cd "$PROJECT_DIR"
    
    # Install Node.js dependencies
    if [ -f "package.json" ]; then
        log_info "Installing Node.js dependencies with pnpm..."
        pnpm install
        log_success "Node.js dependencies installed"
    else
        log_error "package.json not found"
        exit 1
    fi
    
    # Setup Prisma database
    log_info "Setting up Prisma database..."
    
    # Generate Prisma client
    pnpm prisma generate
    
    # Create database if it doesn't exist (PostgreSQL)
    if command -v psql >/dev/null 2>&1; then
        createdb plex_dev 2>/dev/null || log_info "Database plex_dev already exists or could not be created"
    fi
    
    log_success "Prisma setup completed"
}

# Setup development database
setup_database() {
    log_info "Setting up development database..."
    
    cd "$PROJECT_DIR"
    
    # Start database with Docker Compose
    docker-compose up -d postgres redis
    
    # Wait for database to be ready
    log_info "Waiting for database to be ready..."
    sleep 10
    
    # Run migrations
    log_info "Running database migrations..."
    pnpm prisma migrate dev --name init
    
    # Seed database if seed script exists
    if [ -f "prisma/seed.ts" ] || [ -f "prisma/seed.js" ]; then
        log_info "Seeding database..."
        pnpm prisma db seed
    fi
    
    log_success "Development database setup completed"
}

# Setup Git hooks
setup_git_hooks() {
    log_info "Setting up Git hooks..."
    
    cd "$PROJECT_DIR"
    
    # Create pre-commit hook
    mkdir -p .git/hooks
    
    cat > .git/hooks/pre-commit << 'EOF'
#!/bin/bash
# Pre-commit hook for code quality checks

echo "Running pre-commit checks..."

# Run linting
npm run lint:check
if [ $? -ne 0 ]; then
    echo "❌ Linting failed. Please fix the issues before committing."
    exit 1
fi

# Run type checking
npm run type-check
if [ $? -ne 0 ]; then
    echo "❌ Type checking failed. Please fix the issues before committing."
    exit 1
fi

# Run tests
npm run test:unit
if [ $? -ne 0 ]; then
    echo "❌ Tests failed. Please fix the issues before committing."
    exit 1
fi

echo "✅ Pre-commit checks passed!"
EOF
    
    chmod +x .git/hooks/pre-commit
    log_success "Git hooks setup completed"
}

# Setup VS Code configuration
setup_vscode() {
    log_info "Setting up VS Code configuration..."
    
    cd "$PROJECT_DIR"
    
    mkdir -p .vscode
    
    # Create settings.json
    cat > .vscode/settings.json << 'EOF'
{
  "typescript.preferences.importModuleSpecifier": "relative",
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true,
    "source.organizeImports": true
  },
  "files.associations": {
    "*.css": "tailwindcss"
  },
  "tailwindCSS.includeLanguages": {
    "typescript": "typescript",
    "typescriptreact": "typescriptreact"
  },
  "eslint.workingDirectories": ["./src"],
  "search.exclude": {
    "**/node_modules": true,
    "**/dist": true,
    "**/.next": true,
    "**/coverage": true
  },
  "files.watcherExclude": {
    "**/node_modules/**": true,
    "**/.next/**": true,
    "**/dist/**": true
  }
}
EOF
    
    # Create extensions.json
    cat > .vscode/extensions.json << 'EOF'
{
  "recommendations": [
    "bradlc.vscode-tailwindcss",
    "esbenp.prettier-vscode",
    "dbaeumer.vscode-eslint",
    "ms-vscode.vscode-typescript-next",
    "prisma.prisma",
    "ms-vscode.vscode-json",
    "redhat.vscode-yaml",
    "ms-vscode.vscode-docker",
    "github.copilot",
    "github.copilot-chat"
  ]
}
EOF
    
    # Create launch.json for debugging
    cat > .vscode/launch.json << 'EOF'
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Next.js: debug server-side",
      "type": "node-terminal",
      "request": "launch",
      "command": "pnpm dev"
    },
    {
      "name": "Next.js: debug client-side",
      "type": "chrome",
      "request": "launch",
      "url": "http://localhost:3000"
    },
    {
      "name": "Next.js: debug full stack",
      "type": "node-terminal",
      "request": "launch",
      "command": "pnpm dev",
      "serverReadyAction": {
        "pattern": "started server on .+, url: (https?://.+)",
        "uriFormat": "%s",
        "action": "debugWithChrome"
      }
    }
  ]
}
EOF
    
    log_success "VS Code configuration setup completed"
}

# Create helpful scripts
create_helper_scripts() {
    log_info "Creating helper scripts..."
    
    mkdir -p "$PROJECT_DIR/scripts"
    
    # Create development start script
    cat > "$PROJECT_DIR/scripts/dev-start.sh" << 'EOF'
#!/bin/bash
# Development startup script

echo "🚀 Starting Plex Watch Together development environment..."

# Start infrastructure services
echo "📦 Starting database and Redis..."
docker-compose up -d postgres redis

# Wait for services to be ready
echo "⏳ Waiting for services to be ready..."
sleep 5

# Start the application
echo "🎬 Starting Next.js development server..."
pnpm dev
EOF
    
    chmod +x "$PROJECT_DIR/scripts/dev-start.sh"
    
    # Create test script
    cat > "$PROJECT_DIR/scripts/test.sh" << 'EOF'
#!/bin/bash
# Comprehensive test script

echo "🧪 Running comprehensive tests..."

# Unit tests
echo "🔍 Running unit tests..."
pnpm test:unit

# Integration tests
echo "🔗 Running integration tests..."
pnpm test:integration

# E2E tests
echo "🌐 Running E2E tests..."
pnpm test:e2e

# Type checking
echo "📝 Running type checks..."
pnpm type-check

# Linting
echo "🔍 Running linting..."
pnpm lint

echo "✅ All tests completed!"
EOF
    
    chmod +x "$PROJECT_DIR/scripts/test.sh"
    
    # Create cleanup script
    cat > "$PROJECT_DIR/scripts/cleanup.sh" << 'EOF'
#!/bin/bash
# Cleanup development environment

echo "🧹 Cleaning up development environment..."

# Stop all containers
docker-compose down

# Remove node_modules and reinstall
rm -rf node_modules
pnpm install

# Clear Next.js cache
rm -rf .next

# Clear test coverage
rm -rf coverage

# Reset database
pnpm prisma migrate reset --force

echo "✅ Cleanup completed!"
EOF
    
    chmod +x "$PROJECT_DIR/scripts/cleanup.sh"
    
    log_success "Helper scripts created"
}

# Verify installation
verify_installation() {
    log_info "Verifying installation..."
    
    cd "$PROJECT_DIR"
    
    local failed=0
    
    # Check Node.js
    if command -v node >/dev/null 2>&1; then
        log_success "✅ Node.js: $(node --version)"
    else
        log_error "❌ Node.js not found"
        failed=1
    fi
    
    # Check pnpm
    if command -v pnpm >/dev/null 2>&1; then
        log_success "✅ pnpm: $(pnpm --version)"
    else
        log_error "❌ pnpm not found"
        failed=1
    fi
    
    # Check Docker
    if docker --version >/dev/null 2>&1; then
        log_success "✅ Docker: $(docker --version)"
    else
        log_error "❌ Docker not found"
        failed=1
    fi
    
    # Check Docker Compose
    if docker-compose --version >/dev/null 2>&1 || docker compose version >/dev/null 2>&1; then
        log_success "✅ Docker Compose available"
    else
        log_error "❌ Docker Compose not found"
        failed=1
    fi
    
    # Check project dependencies
    if [ -d "node_modules" ]; then
        log_success "✅ Project dependencies installed"
    else
        log_error "❌ Project dependencies not found"
        failed=1
    fi
    
    # Check database connection
    if docker-compose ps | grep -q postgres; then
        log_success "✅ Database is running"
    else
        log_warning "⚠️  Database is not running"
    fi
    
    if [ $failed -eq 0 ]; then
        log_success "🎉 Development environment setup completed successfully!"
        echo ""
        echo "Next steps:"
        echo "1. Configure your Plex server settings in .env.local"
        echo "2. Run: ./scripts/dev-start.sh"
        echo "3. Open http://localhost:3000 in your browser"
        echo ""
        echo "Useful commands:"
        echo "- pnpm dev          # Start development server"
        echo "- pnpm test         # Run tests"
        echo "- pnpm lint         # Run linting"
        echo "- pnpm build        # Build for production"
        echo ""
    else
        log_error "❌ Development environment setup failed. Please check the errors above."
        exit 1
    fi
}

# Usage information
usage() {
    echo "Development Environment Setup Script"
    echo ""
    echo "Usage: $0 [options]"
    echo ""
    echo "Options:"
    echo "  --skip-docker       Skip Docker installation"
    echo "  --skip-deps         Skip dependency installation"
    echo "  --skip-db          Skip database setup"
    echo "  --help, -h         Show this help message"
    echo ""
}

# Main execution
main() {
    local skip_docker=false
    local skip_deps=false
    local skip_db=false
    
    # Parse command line arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --skip-docker)
                skip_docker=true
                shift
                ;;
            --skip-deps)
                skip_deps=true
                shift
                ;;
            --skip-db)
                skip_db=true
                shift
                ;;
            --help|-h)
                usage
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                usage
                exit 1
                ;;
        esac
    done
    
    log_info "🚀 Plex Watch Together Development Environment Setup"
    log_info "=================================================="
    echo ""
    
    # Run setup steps
    check_system_requirements
    install_dev_tools
    install_nodejs
    
    if [ "$skip_docker" = false ]; then
        install_docker
    fi
    
    setup_project_environment
    
    if [ "$skip_deps" = false ]; then
        install_dependencies
    fi
    
    if [ "$skip_db" = false ]; then
        setup_database
    fi
    
    setup_git_hooks
    setup_vscode
    create_helper_scripts
    verify_installation
}

# Run main function
main "$@"