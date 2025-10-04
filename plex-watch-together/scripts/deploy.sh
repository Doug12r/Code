#!/bin/bash
# Production Deployment Script
# Handles blue-green deployment with rollback capabilities

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ENVIRONMENT="${1:-production}"
ACTION="${2:-deploy}"
VERSION="${3:-latest}"

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

# Load environment variables
load_environment() {
    local env_file="$PROJECT_DIR/.env.$ENVIRONMENT"
    
    if [ -f "$env_file" ]; then
        log_info "Loading environment from $env_file"
        source "$env_file"
    else
        log_warning "Environment file $env_file not found"
    fi
    
    # Set default values
    export DOMAIN_NAME="${DOMAIN_NAME:-localhost}"
    export DATABASE_URL="${DATABASE_URL:-postgresql://postgres:postgres@localhost:5432/plex}"
    export REDIS_URL="${REDIS_URL:-redis://localhost:6379}"
    export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-plex-${ENVIRONMENT}}"
}

# Health check function
health_check() {
    local url="${1:-http://localhost:3000}"
    local max_attempts=30
    local attempt=1
    
    log_info "Running health check on $url"
    
    while [ $attempt -le $max_attempts ]; do
        if curl -f -s "$url/api/health" > /dev/null 2>&1; then
            log_success "Health check passed (attempt $attempt/$max_attempts)"
            return 0
        fi
        
        log_info "Health check failed (attempt $attempt/$max_attempts), retrying in 10s..."
        sleep 10
        ((attempt++))
    done
    
    log_error "Health check failed after $max_attempts attempts"
    return 1
}

# Pre-deployment checks
pre_deployment_checks() {
    log_info "Running pre-deployment checks..."
    
    # Check if Docker is running
    if ! docker info > /dev/null 2>&1; then
        log_error "Docker is not running"
        exit 1
    fi
    
    # Check if required files exist
    local required_files=(
        "$PROJECT_DIR/docker-compose.yml"
        "$PROJECT_DIR/Dockerfile"
        "$PROJECT_DIR/package.json"
    )
    
    for file in "${required_files[@]}"; do
        if [ ! -f "$file" ]; then
            log_error "Required file not found: $file"
            exit 1
        fi
    done
    
    # Check if environment file exists for production
    if [ "$ENVIRONMENT" = "production" ] && [ ! -f "$PROJECT_DIR/.env.production" ]; then
        log_warning "Production environment file not found"
    fi
    
    log_success "Pre-deployment checks passed"
}

# Build application
build_application() {
    log_info "Building application for $ENVIRONMENT environment..."
    
    cd "$PROJECT_DIR"
    
    # Build Docker images
    if [ "$ENVIRONMENT" = "production" ]; then
        docker-compose -f docker-compose.yml -f docker-compose.prod.yml build --no-cache
    else
        docker-compose build --no-cache
    fi
    
    log_success "Application built successfully"
}

# Database migration
run_migrations() {
    log_info "Running database migrations..."
    
    cd "$PROJECT_DIR"
    
    # Run migrations in a temporary container
    if [ "$ENVIRONMENT" = "production" ]; then
        docker-compose -f docker-compose.yml -f docker-compose.prod.yml run --rm app npx prisma migrate deploy
    else
        docker-compose run --rm app npx prisma migrate deploy
    fi
    
    log_success "Database migrations completed"
}

# Blue-green deployment
deploy_blue_green() {
    log_info "Starting blue-green deployment..."
    
    cd "$PROJECT_DIR"
    
    local current_env="blue"
    local new_env="green"
    
    # Check which environment is currently running
    if docker-compose ps | grep -q "green"; then
        current_env="green"
        new_env="blue"
    fi
    
    log_info "Current environment: $current_env"
    log_info "Deploying to: $new_env"
    
    # Start new environment
    export COMPOSE_PROJECT_NAME="plex-${ENVIRONMENT}-${new_env}"
    
    if [ "$ENVIRONMENT" = "production" ]; then
        docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
    else
        docker-compose up -d
    fi
    
    # Wait for services to be ready
    sleep 30
    
    # Health check on new environment
    local new_port
    if [ "$new_env" = "blue" ]; then
        new_port=3000
    else
        new_port=3001
    fi
    
    if health_check "http://localhost:$new_port"; then
        log_success "New environment ($new_env) is healthy"
        
        # Switch traffic (in production, this would update load balancer)
        log_info "Switching traffic to $new_env environment"
        
        # Stop old environment
        export COMPOSE_PROJECT_NAME="plex-${ENVIRONMENT}-${current_env}"
        docker-compose down
        
        log_success "Blue-green deployment completed"
    else
        log_error "New environment health check failed, rolling back..."
        rollback_deployment "$new_env"
        exit 1
    fi
}

# Standard deployment
deploy_standard() {
    log_info "Starting standard deployment..."
    
    cd "$PROJECT_DIR"
    
    # Stop services gracefully
    if [ "$ENVIRONMENT" = "production" ]; then
        docker-compose -f docker-compose.yml -f docker-compose.prod.yml down --timeout 30
    else
        docker-compose down --timeout 30
    fi
    
    # Start services
    if [ "$ENVIRONMENT" = "production" ]; then
        docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
    else
        docker-compose up -d
    fi
    
    # Wait for services to start
    sleep 30
    
    # Health check
    if health_check; then
        log_success "Standard deployment completed successfully"
    else
        log_error "Deployment failed health check"
        exit 1
    fi
}

# Rollback deployment
rollback_deployment() {
    local failed_env="${1:-unknown}"
    
    log_warning "Rolling back deployment..."
    
    cd "$PROJECT_DIR"
    
    # Stop failed environment
    export COMPOSE_PROJECT_NAME="plex-${ENVIRONMENT}-${failed_env}"
    docker-compose down
    
    # Get previous successful image
    local previous_image=$(docker images --format "table {{.Repository}}:{{.Tag}}" | grep "plex-watch-together" | sed -n '2p')
    
    if [ -n "$previous_image" ]; then
        log_info "Rolling back to previous image: $previous_image"
        
        # Update environment to use previous image
        export DOCKER_IMAGE="$previous_image"
        
        if [ "$ENVIRONMENT" = "production" ]; then
            docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
        else
            docker-compose up -d
        fi
        
        sleep 30
        
        if health_check; then
            log_success "Rollback completed successfully"
        else
            log_error "Rollback failed - manual intervention required"
            exit 1
        fi
    else
        log_error "No previous image found for rollback"
        exit 1
    fi
}

# Backup database
backup_database() {
    log_info "Creating database backup..."
    
    local backup_dir="$PROJECT_DIR/backups"
    local backup_file="$backup_dir/db_backup_$(date +%Y%m%d_%H%M%S).sql"
    
    mkdir -p "$backup_dir"
    
    # Extract database connection details
    local db_url="${DATABASE_URL:-postgresql://postgres:postgres@localhost:5432/plex}"
    
    # Create backup using pg_dump
    docker-compose exec -T postgres pg_dump "$db_url" > "$backup_file"
    
    if [ -f "$backup_file" ]; then
        log_success "Database backup created: $backup_file"
        
        # Keep only last 10 backups
        ls -t "$backup_dir"/db_backup_*.sql | tail -n +11 | xargs -r rm
    else
        log_error "Database backup failed"
        return 1
    fi
}

# Monitoring and alerting
setup_monitoring() {
    log_info "Setting up monitoring and alerting..."
    
    # Start monitoring services if configured
    if [ "$ENVIRONMENT" = "production" ]; then
        docker-compose -f docker-compose.yml -f docker-compose.prod.yml --profile monitoring up -d
        log_success "Monitoring services started"
    fi
}

# Post-deployment tasks
post_deployment() {
    log_info "Running post-deployment tasks..."
    
    # Clear application cache
    docker-compose exec -T app npm run cache:clear || log_warning "Cache clear failed"
    
    # Warm up application
    health_check
    curl -s "http://localhost:3000/" > /dev/null || log_warning "Application warmup failed"
    
    # Setup monitoring
    setup_monitoring
    
    # Send notification (implement your notification logic here)
    send_notification "Deployment completed successfully for $ENVIRONMENT environment"
    
    log_success "Post-deployment tasks completed"
}

# Send notification (placeholder - implement your preferred method)
send_notification() {
    local message="$1"
    log_info "Notification: $message"
    
    # Example: Slack notification
    if [ -n "$SLACK_WEBHOOK_URL" ]; then
        curl -X POST -H 'Content-type: application/json' \
             --data "{\"text\":\"$message\"}" \
             "$SLACK_WEBHOOK_URL" || log_warning "Failed to send Slack notification"
    fi
    
    # Example: Email notification
    if [ -n "$NOTIFICATION_EMAIL" ]; then
        echo "$message" | mail -s "Deployment Notification" "$NOTIFICATION_EMAIL" || log_warning "Failed to send email notification"
    fi
}

# Show deployment status
show_status() {
    log_info "Deployment Status for $ENVIRONMENT:"
    
    cd "$PROJECT_DIR"
    docker-compose ps
    
    echo ""
    log_info "Service URLs:"
    echo "Application: http://localhost:${PORT:-3000}"
    echo "Health Check: http://localhost:${PORT:-3000}/api/health"
    
    if docker-compose ps | grep -q prometheus; then
        echo "Prometheus: http://localhost:9090"
    fi
    
    if docker-compose ps | grep -q grafana; then
        echo "Grafana: http://localhost:3001"
    fi
}

# Usage information
usage() {
    echo "Usage: $0 [environment] [action] [version]"
    echo ""
    echo "Arguments:"
    echo "  environment  Target environment (development|staging|production) [default: production]"
    echo "  action       Action to perform (deploy|rollback|status|backup) [default: deploy]" 
    echo "  version      Version/tag to deploy [default: latest]"
    echo ""
    echo "Examples:"
    echo "  $0                                    # Deploy latest to production"
    echo "  $0 staging deploy v1.2.3             # Deploy v1.2.3 to staging"
    echo "  $0 production rollback               # Rollback production deployment"
    echo "  $0 production status                 # Show production status"
    echo "  $0 production backup                 # Backup production database"
    echo ""
}

# Main execution
main() {
    case "$1" in
        "--help"|"-h")
            usage
            exit 0
            ;;
    esac
    
    log_info "Plex Watch Together Deployment Script"
    log_info "Environment: $ENVIRONMENT | Action: $ACTION | Version: $VERSION"
    echo ""
    
    # Load environment
    load_environment
    
    # Execute action
    case "$ACTION" in
        "deploy")
            pre_deployment_checks
            backup_database
            build_application
            run_migrations
            
            if [ "$ENVIRONMENT" = "production" ]; then
                deploy_blue_green
            else
                deploy_standard
            fi
            
            post_deployment
            show_status
            ;;
        "rollback")
            rollback_deployment
            show_status
            ;;
        "status")
            show_status
            ;;
        "backup")
            backup_database
            ;;
        *)
            log_error "Invalid action: $ACTION"
            usage
            exit 1
            ;;
    esac
    
    log_success "Deployment script completed successfully!"
}

# Run main function
main "$@"