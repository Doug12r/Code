#!/bin/bash

# App Platform Environment Update Script
# This script updates environment variables for an existing App Platform app

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

APP_NAME="plex-watch-together"
DOMAIN="plexwatch.duckdns.org"

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
    echo "========================================================="
    echo "  App Platform Environment Variable Update"
    echo "========================================================="
    echo -e "${NC}"
}

generate_nextauth_secret() {
    # Generate a secure 32+ character secret
    openssl rand -base64 32 | tr -d "\n"
}

update_app_spec() {
    log_info "Updating app specification with proper environment variables..."
    
    # Generate a secure NEXTAUTH_SECRET
    NEXTAUTH_SECRET=$(generate_nextauth_secret)
    
    # Update the app.yaml file with proper values
    cat > .do/app.yaml << EOL
name: $APP_NAME
services:
  - name: web
    source_dir: /plex-watch-together
    github:
      repo: doug12r/Code
      branch: main
      deploy_on_push: true
    build_command: ./scripts/app-platform-build.sh
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
        value: https://$DOMAIN
      - key: NEXTAUTH_SECRET
        value: "$NEXTAUTH_SECRET"
      - key: DATABASE_URL
        value: \${db.DATABASE_URL}
      - key: SKIP_ENV_VALIDATION
        value: "true"

databases:
  - name: db
    engine: PG
    version: "15"
    size_slug: db-s-dev-database
    num_nodes: 1

domains:
  - domain: $DOMAIN
    type: PRIMARY

static_sites: []
workers: []
jobs: []
EOL
    
    log_success "App specification updated with:"
    echo "  • Custom domain: https://$DOMAIN"
    echo "  • Generated NEXTAUTH_SECRET: ${NEXTAUTH_SECRET:0:8}... (truncated)"
    echo "  • Proper source directory: /plex-watch-together"
}

update_deployment() {
    log_info "Checking if doctl is available..."
    
    if ! command -v doctl &> /dev/null; then
        log_error "doctl is not installed. Please run ./deploy-app-platform.sh first"
        exit 1
    fi
    
    if ! doctl account get &> /dev/null; then
        log_error "doctl is not authenticated. Please run 'doctl auth init'"
        exit 1
    fi
    
    log_info "Getting app ID..."
    APP_ID=$(doctl apps list -o json | jq -r ".[] | select(.spec.name==\"$APP_NAME\") | .id" 2>/dev/null || echo "")
    
    if [ -z "$APP_ID" ]; then
        log_warning "App '$APP_NAME' not found. Creating new deployment..."
        doctl apps create --spec .do/app.yaml
    else
        log_info "Updating existing app (ID: $APP_ID)..."
        doctl apps update $APP_ID --spec .do/app.yaml
    fi
    
    log_success "App deployment updated!"
}

setup_domain() {
    log_info "Domain configuration instructions:"
    echo
    echo -e "${YELLOW}To connect your DuckDNS domain:${NC}"
    echo "1. Go to https://cloud.digitalocean.com/apps"
    echo "2. Click on your '$APP_NAME' app"
    echo "3. Go to 'Settings' → 'Domains'"
    echo "4. Add domain: $DOMAIN"
    echo "5. Update your DuckDNS configuration:"
    echo "   - Go to https://www.duckdns.org"
    echo "   - Set '$DOMAIN' to point to the provided CNAME"
    echo
    echo -e "${GREEN}The app should be accessible at: https://$DOMAIN${NC}"
}

check_deployment_status() {
    if [ ! -z "$APP_ID" ]; then
        log_info "Checking deployment status..."
        sleep 5
        
        STATUS=$(doctl apps get $APP_ID -o json | jq -r '.last_deployment_active_at // empty' 2>/dev/null || echo "")
        
        if [ ! -z "$STATUS" ]; then
            log_success "Deployment is active!"
            
            # Get app URL
            APP_URL=$(doctl apps get $APP_ID -o json | jq -r '.default_ingress // empty' 2>/dev/null || echo "")
            if [ ! -z "$APP_URL" ]; then
                echo -e "${BLUE}Temporary URL:${NC} $APP_URL"
            fi
        else
            log_warning "Deployment may still be in progress. Check the dashboard for status."
        fi
    fi
}

main() {
    print_header
    update_app_spec
    update_deployment
    check_deployment_status
    setup_domain
    
    echo
    log_success "Environment update completed!"
    echo -e "${YELLOW}Next steps:${NC}"
    echo "1. Wait for deployment to complete (2-5 minutes)"
    echo "2. Configure DuckDNS domain (see instructions above)"
    echo "3. Access your app at https://$DOMAIN"
    echo "4. Complete Plex setup in the web interface"
}

# Run main function
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi