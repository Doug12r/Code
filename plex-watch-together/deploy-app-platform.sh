#!/bin/bash

# Digital Ocean App Platform One-Click Deployment Script
# Usage: ./deploy-app-platform.sh [app-name] [github-repo]
#
# Example: ./deploy-app-platform.sh plex-watch-together yourusername/plex-watch-together

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
APP_NAME=${1:-"plex-watch-together"}
GITHUB_REPO=${2:-""}
SPEC_FILE=".do/app.yaml"

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
    echo "=============================================================="
    echo "  Plex Watch Together - Digital Ocean App Platform Deploy"
    echo "=============================================================="
    echo -e "${NC}"
}

check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check if we're in a git repository
    if ! git rev-parse --git-dir > /dev/null 2>&1; then
        log_error "This must be run from within a git repository"
        exit 1
    fi
    
    # Check for GitHub remote
    if ! git remote get-url origin > /dev/null 2>&1; then
        log_error "No GitHub remote 'origin' found. Please add your GitHub repository:"
        echo "git remote add origin https://github.com/yourusername/plex-watch-together.git"
        exit 1
    fi
    
    # Extract GitHub repo if not provided
    if [ -z "$GITHUB_REPO" ]; then
        GITHUB_REPO=$(git remote get-url origin | sed 's/.*github\.com[:/]\([^.]*\)\.git$/\1/' | sed 's/.*github\.com[:/]\([^.]*\)$/\1/')
        log_info "Auto-detected GitHub repository: $GITHUB_REPO"
    fi
    
    log_success "Prerequisites check passed"
}

install_doctl() {
    if command -v doctl &> /dev/null; then
        log_success "doctl is already installed"
        return 0
    fi
    
    log_info "Installing Digital Ocean CLI (doctl)..."
    
    # Detect OS and architecture
    OS=$(uname -s | tr '[:upper:]' '[:lower:]')
    ARCH=$(uname -m)
    
    case $ARCH in
        x86_64) ARCH="amd64" ;;
        arm64|aarch64) ARCH="arm64" ;;
        *) log_error "Unsupported architecture: $ARCH"; exit 1 ;;
    esac
    
    # Download and install doctl
    DOCTL_VERSION="1.100.0"
    DOWNLOAD_URL="https://github.com/digitalocean/doctl/releases/download/v${DOCTL_VERSION}/doctl-${DOCTL_VERSION}-${OS}-${ARCH}.tar.gz"
    
    curl -sL $DOWNLOAD_URL | tar -xzv
    
    # Move to system path
    if [ -w "/usr/local/bin" ]; then
        mv doctl /usr/local/bin/
    else
        sudo mv doctl /usr/local/bin/
    fi
    
    log_success "doctl installed successfully"
}

authenticate_doctl() {
    if doctl account get &> /dev/null; then
        log_success "Already authenticated with Digital Ocean"
        return 0
    fi
    
    log_info "Authenticating with Digital Ocean..."
    echo -e "${YELLOW}Please follow the authentication prompts:${NC}"
    
    doctl auth init
    
    if doctl account get &> /dev/null; then
        log_success "Authentication successful"
    else
        log_error "Authentication failed"
        exit 1
    fi
}

create_app_spec() {
    log_info "Creating App Platform specification..."
    
    mkdir -p .do
    
    # Generate a secure random secret
    NEXTAUTH_SECRET=$(openssl rand -base64 32)
    
    cat > $SPEC_FILE << EOL
name: $APP_NAME
services:
  - name: web
    source_dir: /
    github:
      repo: $GITHUB_REPO
      branch: main
      deploy_on_push: true
    build_command: |
      npm ci --only=production
      npx prisma generate
      npm run build
    run_command: node server.js
    environment_slug: node-js
    instance_count: 1
    instance_size_slug: basic-xxs
    http_port: 3001
    routes:
      - path: /
    health_check:
      http_path: /api/health
      initial_delay_seconds: 60
      period_seconds: 30
      timeout_seconds: 10
      failure_threshold: 3
      success_threshold: 2
    envs:
      - key: NODE_ENV
        value: production
      - key: PORT
        value: "3001"
      - key: NEXTAUTH_URL
        value: \${APP_URL}
      - key: NEXTAUTH_SECRET
        value: $NEXTAUTH_SECRET
      - key: DATABASE_URL
        value: \${db.DATABASE_URL}

databases:
  - name: db
    engine: PG
    version: "15"
    size_slug: db-s-dev-database
    num_nodes: 1

static_sites: []
workers: []
jobs: []
EOL
    
    log_success "App specification created at $SPEC_FILE"
}

push_changes() {
    log_info "Ensuring latest changes are pushed to GitHub..."
    
    # Add app spec to git if it's new
    if [ ! -f .gitignore ] || ! grep -q ".do/" .gitignore; then
        git add $SPEC_FILE
    fi
    
    # Check if there are changes to commit
    if ! git diff-index --quiet HEAD --; then
        log_warning "There are uncommitted changes. Committing them now..."
        git add -A
        git commit -m "Add App Platform deployment configuration"
        git push origin main
        log_success "Changes pushed to GitHub"
    else
        log_success "Repository is up to date"
    fi
}

deploy_app() {
    log_info "Deploying to Digital Ocean App Platform..."
    
    # Check if app already exists
    if doctl apps list -o json | jq -r '.[].spec.name' | grep -q "^$APP_NAME$"; then
        log_warning "App '$APP_NAME' already exists. Updating..."
        APP_ID=$(doctl apps list -o json | jq -r ".[] | select(.spec.name==\"$APP_NAME\") | .id")
        doctl apps update $APP_ID --spec $SPEC_FILE
    else
        log_info "Creating new app..."
        doctl apps create --spec $SPEC_FILE
    fi
    
    log_success "Deployment initiated successfully!"
}

monitor_deployment() {
    log_info "Monitoring deployment progress..."
    
    # Get app ID
    sleep 5  # Wait a moment for the app to be created
    APP_ID=$(doctl apps list -o json | jq -r ".[] | select(.spec.name==\"$APP_NAME\") | .id")
    
    if [ -z "$APP_ID" ]; then
        log_warning "Could not get app ID. Check deployment status manually."
        return 0
    fi
    
    echo -e "${BLUE}App ID: $APP_ID${NC}"
    
    # Monitor deployment for up to 10 minutes
    for i in {1..60}; do
        STATUS=$(doctl apps get $APP_ID -o json | jq -r '.last_deployment_active_at // empty')
        
        if [ ! -z "$STATUS" ]; then
            PHASE=$(doctl apps get $APP_ID -o json | jq -r '.in_progress_deployment.phase // "unknown"')
            echo -e "${YELLOW}Deployment status: $PHASE${NC}"
            
            if [ "$PHASE" = "ACTIVE" ]; then
                log_success "Deployment completed successfully!"
                break
            elif [ "$PHASE" = "ERROR" ]; then
                log_error "Deployment failed. Check the App Platform dashboard for details."
                break
            fi
        fi
        
        sleep 10
    done
}

print_completion_info() {
    log_success "App Platform deployment completed!"
    
    # Get app URL
    APP_ID=$(doctl apps list -o json | jq -r ".[] | select(.spec.name==\"$APP_NAME\") | .id")
    
    if [ ! -z "$APP_ID" ]; then
        APP_URL=$(doctl apps get $APP_ID -o json | jq -r '.default_ingress // "https://\(.spec.name).ondigitalocean.app"')
        
        echo -e "\n${GREEN}=== Deployment Summary ===${NC}"
        echo -e "${BLUE}App Name:${NC} $APP_NAME"
        echo -e "${BLUE}GitHub Repository:${NC} $GITHUB_REPO"
        echo -e "${BLUE}App URL:${NC} $APP_URL"
        echo -e "${BLUE}Dashboard:${NC} https://cloud.digitalocean.com/apps/$APP_ID"
    fi
    
    echo -e "\n${YELLOW}=== Next Steps ===${NC}"
    echo "1. Visit your app URL to verify it's working"
    echo "2. Complete Plex setup in the web interface"  
    echo "3. Add custom domain (optional) in the App Platform dashboard"
    echo "4. Monitor logs and metrics in the dashboard"
    echo "5. Future deployments will happen automatically on git push!"
    
    echo -e "\n${GREEN}🎉 Your app is now live on Digital Ocean App Platform!${NC}"
}

print_troubleshooting() {
    echo -e "\n${YELLOW}=== Troubleshooting ===${NC}"
    echo "If deployment fails, check:"
    echo "1. GitHub repository is public or properly connected"
    echo "2. package.json has correct build and start scripts"
    echo "3. Environment variables are properly set"
    echo "4. Database migrations run successfully"
    
    echo -e "\n${BLUE}Useful commands:${NC}"
    echo "• View app logs: doctl apps logs $APP_ID --type=build"
    echo "• Get app info: doctl apps get $APP_ID"
    echo "• List all apps: doctl apps list"
    echo "• Delete app: doctl apps delete $APP_ID"
}

# Main execution
main() {
    print_header
    check_prerequisites
    install_doctl
    authenticate_doctl
    create_app_spec
    push_changes
    deploy_app
    monitor_deployment
    print_completion_info
    print_troubleshooting
}

# Run main function
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi