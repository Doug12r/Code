# Deployment Guide

This comprehensive guide covers the deployment process for the Plex Watch Together application across different environments, from local development to production cloud deployment.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Development Environment](#development-environment)
3. [Staging Environment](#staging-environment)
4. [Production Environment](#production-environment)
5. [Infrastructure as Code](#infrastructure-as-code)
6. [CI/CD Pipeline](#cicd-pipeline)
7. [Monitoring and Observability](#monitoring-and-observability)
8. [Security Considerations](#security-considerations)
9. [Troubleshooting](#troubleshooting)

## Prerequisites

### Local Development
- Docker 24.0+ and Docker Compose 2.0+
- Node.js 20+ and pnpm 8+
- Git 2.30+
- VS Code with recommended extensions

### Cloud Deployment
- AWS CLI 2.0+ configured with appropriate permissions
- Terraform 1.0+ for infrastructure management
- Docker Hub or AWS ECR access for container registry
- Domain name and SSL certificate (optional)

### Required AWS Permissions
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ecs:*",
        "ec2:*",
        "rds:*",
        "elasticache:*",
        "elbv2:*",
        "logs:*",
        "secretsmanager:*",
        "iam:*",
        "ecr:*"
      ],
      "Resource": "*"
    }
  ]
}
```

## Development Environment

### Automated Setup

The fastest way to get started:

```bash
# Clone the repository
git clone https://github.com/your-org/plex-watch-together.git
cd plex-watch-together

# Run automated development setup
chmod +x scripts/dev-setup.sh
./scripts/dev-setup.sh
```

This script will:
- Install system dependencies (Node.js, Docker, etc.)
- Set up project environment files
- Install npm dependencies
- Initialize the database
- Configure VS Code settings
- Create Git hooks for code quality

### Manual Setup

If you prefer manual setup or encounter issues:

```bash
# Install dependencies
pnpm install

# Setup environment files
cp .env.example .env.local
cp .env.example .env.development

# Start infrastructure services
docker-compose up -d postgres redis

# Run database migrations
pnpm prisma migrate dev

# Seed the database (optional)
pnpm prisma db seed

# Start development server
pnpm dev
```

### Development Environment Configuration

Edit `.env.local` with your specific configuration:

```env
# Database
DATABASE_URL="postgresql://postgres:password@localhost:5432/plex_dev"
REDIS_URL="redis://localhost:6379"

# Authentication
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="your-development-secret-key"

# Plex Configuration
PLEX_SERVER_URL="http://your-plex-server:32400"
PLEX_TOKEN="your-plex-token"

# Development Features
NODE_ENV="development"
LOG_LEVEL="debug"
ENABLE_DEBUG_LOGS=true
ENABLE_PERFORMANCE_MONITORING=true
```

### Development Commands

```bash
# Start development server with hot reload
pnpm dev

# Run tests
pnpm test
pnpm test:watch

# Run linting and formatting
pnpm lint
pnpm format

# Type checking
pnpm type-check

# Build for production testing
pnpm build

# Clean development environment
./scripts/cleanup.sh
```

## Staging Environment

### Purpose
The staging environment mirrors production configuration for integration testing and user acceptance testing.

### Deployment Process

```bash
# Deploy to staging
./scripts/deploy.sh staging deploy

# Check deployment status
./scripts/deploy.sh staging status

# Run health checks
curl -f https://staging.plexwatchtogether.com/api/health
```

### Staging Configuration

Staging uses reduced resources for cost optimization:

```yaml
# docker-compose.staging.yml
services:
  app:
    replicas: 1
    resources:
      limits:
        memory: 1G
        cpus: 0.5
      reservations:
        memory: 512M
        cpus: 0.25

  postgres:
    environment:
      - POSTGRES_SHARED_BUFFERS=128MB
      - POSTGRES_EFFECTIVE_CACHE_SIZE=512MB
```

### Environment Variables

```env
# Staging environment (.env.staging)
NODE_ENV="staging"
DATABASE_URL="postgresql://postgres:${DB_PASSWORD}@staging-db:5432/plex"
REDIS_URL="redis://staging-redis:6379"
NEXTAUTH_URL="https://staging.plexwatchtogether.com"
LOG_LEVEL="info"
ENABLE_DEBUG_LOGS=false
```

## Production Environment

### Architecture Overview

Production deployment uses AWS ECS with the following components:

- **Application Layer**: ECS Fargate with auto-scaling
- **Load Balancer**: Application Load Balancer with SSL termination
- **Database**: RDS PostgreSQL with Multi-AZ deployment
- **Cache**: ElastiCache Redis cluster
- **Storage**: EFS for shared file storage
- **Monitoring**: CloudWatch, Prometheus, and Grafana

### Infrastructure Deployment

```bash
# Navigate to infrastructure directory
cd infrastructure

# Initialize Terraform
terraform init

# Review deployment plan
terraform plan -var-file="environments/production.tfvars"

# Deploy infrastructure
terraform apply -var-file="environments/production.tfvars"

# Note the outputs for application deployment
terraform output
```

### Application Deployment

#### Option 1: Automated Deployment Script

```bash
# Deploy to production with blue-green deployment
./scripts/deploy.sh production deploy

# Monitor deployment
./scripts/deploy.sh production status

# Rollback if needed
./scripts/deploy.sh production rollback
```

#### Option 2: Manual Deployment

```bash
# Build and push Docker image
docker build -t plex-watch-together:latest .
docker tag plex-watch-together:latest ${ECR_URI}:latest
docker push ${ECR_URI}:latest

# Update ECS service
aws ecs update-service \
  --cluster plex-watch-together-prod \
  --service plex-watch-together-service \
  --force-new-deployment

# Monitor deployment
aws ecs wait services-stable \
  --cluster plex-watch-together-prod \
  --services plex-watch-together-service
```

### Production Configuration

```env
# Production environment (.env.production)
NODE_ENV="production"
DATABASE_URL="${DATABASE_SECRET_ARN}"
REDIS_URL="${REDIS_SECRET_ARN}"
NEXTAUTH_URL="https://plexwatchtogether.com"
LOG_LEVEL="warn"
ENABLE_DEBUG_LOGS=false
ENABLE_PERFORMANCE_MONITORING=true
```

### High Availability Configuration

```yaml
# ECS Service Configuration
services:
  app:
    replicas: 2
    deployment_configuration:
      maximum_percent: 200
      minimum_healthy_percent: 100
      deployment_circuit_breaker:
        enable: true
        rollback: true
    health_check:
      path: /api/health
      interval: 30s
      timeout: 5s
      healthy_threshold: 2
      unhealthy_threshold: 3
```

## Infrastructure as Code

### Terraform Structure

```
infrastructure/
├── main.tf              # Main infrastructure resources
├── variables.tf         # Input variables and configuration
├── outputs.tf          # Output values and connection info
├── database.tf         # RDS and ElastiCache configuration
├── ecs.tf             # ECS cluster and service configuration
├── alb.tf             # Load balancer and target groups
├── iam.tf             # IAM roles and policies
├── monitoring.tf      # CloudWatch and alerting
├── security.tf        # Security groups and WAF
└── environments/      # Environment-specific configurations
    ├── dev.tfvars
    ├── staging.tfvars
    └── production.tfvars
```

### Environment-Specific Variables

```hcl
# environments/production.tfvars
environment = "production"
aws_region  = "us-west-2"

# ECS Configuration
ecs_service_desired_count = 2
ecs_task_cpu             = 1024
ecs_task_memory          = 2048

# Database Configuration
db_instance_class        = "db.t3.medium"
db_multi_az             = true
db_deletion_protection  = true
db_backup_retention_period = 30

# Redis Configuration
redis_node_type         = "cache.t3.small"
redis_num_cache_nodes   = 2

# Auto Scaling
autoscaling_min_capacity = 2
autoscaling_max_capacity = 10
autoscaling_target_cpu   = 70

# Domain Configuration
domain_name            = "plexwatchtogether.com"
create_route53_record  = true
route53_zone_id       = "Z1234567890ABC"
ssl_certificate_arn   = "arn:aws:acm:us-west-2:123456789012:certificate/12345678-1234-1234-1234-123456789012"
```

### Infrastructure Commands

```bash
# Plan infrastructure changes
terraform plan -var-file="environments/production.tfvars" -out=production.plan

# Apply infrastructure changes
terraform apply production.plan

# Show infrastructure state
terraform show

# Destroy infrastructure (use with caution)
terraform destroy -var-file="environments/production.tfvars"
```

## CI/CD Pipeline

### GitHub Actions Workflow

The CI/CD pipeline automatically handles:

1. **Code Quality Checks**
   - TypeScript compilation
   - ESLint and Prettier checks
   - Unit and integration tests
   - Security vulnerability scanning

2. **Docker Build and Push**
   - Multi-stage Docker builds
   - Security scanning with Trivy
   - Push to ECR registry

3. **Deployment**
   - Automated deployment to staging
   - Manual approval for production
   - Blue-green deployment strategy
   - Post-deployment health checks

### Pipeline Configuration

```yaml
# .github/workflows/ci-cd.yml
name: CI/CD Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm test:ci

  build-and-deploy:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - name: Deploy to Production
        run: ./scripts/deploy.sh production deploy
```

### Manual Deployment

For emergency deployments or when CI/CD is unavailable:

```bash
# Create deployment branch
git checkout -b deploy/$(date +%Y%m%d-%H%M%S)

# Build and test locally
pnpm install
pnpm build
pnpm test

# Deploy manually
./scripts/deploy.sh production deploy --force

# Tag the release
git tag -a v$(date +%Y%m%d.%H%M) -m "Manual deployment $(date)"
git push origin --tags
```

## Monitoring and Observability

### Health Checks

The application provides comprehensive health check endpoints:

```bash
# Application health
curl -f https://plexwatchtogether.com/api/health

# Detailed health with components
curl -f https://plexwatchtogether.com/api/health?detailed=true

# Database connectivity
curl -f https://plexwatchtogether.com/api/health/database

# Redis connectivity
curl -f https://plexwatchtogether.com/api/health/redis

# External services (Plex)
curl -f https://plexwatchtogether.com/api/health/external
```

### Logging

#### Application Logs
```bash
# View real-time logs
aws logs tail /aws/ecs/plex-watch-together --follow

# Filter error logs
aws logs filter-log-events \
  --log-group-name /aws/ecs/plex-watch-together \
  --filter-pattern "ERROR"

# Query logs with CloudWatch Insights
aws logs start-query \
  --log-group-name /aws/ecs/plex-watch-together \
  --start-time $(date -d '1 hour ago' +%s) \
  --end-time $(date +%s) \
  --query-string 'fields @timestamp, @message | filter @message like /ERROR/'
```

#### Infrastructure Logs
```bash
# ECS service events
aws ecs describe-services \
  --cluster plex-watch-together-prod \
  --services plex-watch-together-service \
  --query 'services[0].events[0:10]'

# ALB access logs (if enabled)
aws s3 ls s3://your-alb-logs-bucket/AWSLogs/
```

### Metrics and Alerting

#### CloudWatch Metrics

Key metrics to monitor:

- **Application Metrics**
  - Request count and latency
  - Error rate (4xx/5xx responses)
  - Active connections
  - Memory and CPU usage

- **Database Metrics**
  - Connection count
  - Query performance
  - Deadlocks and slow queries
  - Disk usage and IOPS

- **Infrastructure Metrics**
  - ECS task health
  - Load balancer target health
  - Network throughput
  - Auto-scaling activities

#### Custom Dashboards

```bash
# Create CloudWatch dashboard
aws cloudwatch put-dashboard \
  --dashboard-name "PlexWatchTogether-Production" \
  --dashboard-body file://monitoring/cloudwatch-dashboard.json
```

### Performance Monitoring

#### Application Performance Monitoring (APM)
- Request tracing with X-Ray
- Custom metrics with CloudWatch
- Real-user monitoring (RUM)

#### Database Performance
- RDS Performance Insights
- Slow query analysis
- Connection pool monitoring

## Security Considerations

### Network Security

```bash
# Review security groups
aws ec2 describe-security-groups \
  --filters "Name=group-name,Values=plex-watch-together-*"

# Check WAF rules (if enabled)
aws wafv2 list-web-acls --scope REGIONAL
```

### Data Security

#### Secrets Management
```bash
# Rotate database password
aws secretsmanager rotate-secret \
  --secret-id plex-watch-together-prod-db-credentials

# Update application secrets
aws secretsmanager update-secret \
  --secret-id plex-watch-together-prod-app-secrets \
  --secret-string file://new-secrets.json
```

#### SSL/TLS Configuration
- TLS 1.3 for all connections
- HSTS headers enabled
- Certificate auto-renewal via AWS Certificate Manager

### Access Control

#### IAM Best Practices
- Least-privilege access policies
- Regular access review and rotation
- MFA requirement for all human access
- Service-linked roles for AWS services

## Troubleshooting

### Common Issues

#### Application Won't Start
```bash
# Check ECS service status
aws ecs describe-services \
  --cluster plex-watch-together-prod \
  --services plex-watch-together-service

# Check task definition
aws ecs describe-task-definition \
  --task-definition plex-watch-together:latest

# View task logs
aws logs tail /aws/ecs/plex-watch-together --follow
```

#### Database Connection Issues
```bash
# Test database connectivity from ECS task
aws ecs execute-command \
  --cluster plex-watch-together-prod \
  --task <task-id> \
  --container app \
  --interactive \
  --command "/bin/bash"

# Inside the container:
pg_isready -h $DATABASE_HOST -p $DATABASE_PORT
```

#### Performance Issues
```bash
# Check resource utilization
aws cloudwatch get-metric-statistics \
  --namespace AWS/ECS \
  --metric-name CPUUtilization \
  --dimensions Name=ServiceName,Value=plex-watch-together-service \
  --start-time $(date -d '1 hour ago' --iso-8601) \
  --end-time $(date --iso-8601) \
  --period 300 \
  --statistics Average,Maximum
```

### Recovery Procedures

#### Database Recovery
```bash
# Restore from automated backup
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier plex-watch-together-restored \
  --db-snapshot-identifier plex-watch-together-prod-snapshot-2024-01-01

# Point-in-time recovery
aws rds restore-db-instance-to-point-in-time \
  --source-db-instance-identifier plex-watch-together-prod \
  --target-db-instance-identifier plex-watch-together-recovered \
  --restore-time 2024-01-01T12:00:00Z
```

#### Application Recovery
```bash
# Force new deployment
aws ecs update-service \
  --cluster plex-watch-together-prod \
  --service plex-watch-together-service \
  --force-new-deployment

# Scale up during high load
aws ecs update-service \
  --cluster plex-watch-together-prod \
  --service plex-watch-together-service \
  --desired-count 5

# Emergency rollback
./scripts/deploy.sh production rollback
```

### Support Contacts

- **DevOps Team**: devops@plexwatchtogether.com
- **On-Call Engineer**: Use PagerDuty for urgent issues
- **Documentation**: Internal wiki and runbooks
- **Status Page**: status.plexwatchtogether.com

## Conclusion

This deployment guide provides comprehensive instructions for deploying the Plex Watch Together application across all environments. For additional information, refer to:

- [Architecture Documentation](ARCHITECTURE.md)
- [Infrastructure Documentation](INFRASTRUCTURE.md)  
- [Development Guide](README.md)
- [Testing Documentation](TESTING.md)

Remember to follow security best practices, monitor your deployments, and maintain regular backups for production systems.

---

*Last Updated: January 2024*
*Version: 2.0*