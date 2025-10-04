# Infrastructure Documentation

## Overview

This document provides comprehensive information about the infrastructure setup for the Plex Watch Together application, including Docker containerization, cloud deployment, monitoring, and operational procedures.

## Architecture Overview

### High-Level Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Load Balancer │    │   Application   │    │    Database     │
│      (ALB)      │────│   (ECS/Docker)  │────│ (RDS PostgreSQL)│
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         │              ┌─────────────────┐              │
         │              │     Cache       │              │
         └──────────────│ (Redis/ElastiCache) │──────────┘
                        └─────────────────┘
```

### Component Details

#### 1. Application Layer
- **Container Runtime**: Docker with multi-stage builds
- **Orchestration**: AWS ECS with Fargate
- **Auto Scaling**: CPU and memory-based scaling
- **Health Checks**: Comprehensive application health monitoring

#### 2. Load Balancing
- **Type**: Application Load Balancer (ALB)
- **SSL Termination**: AWS Certificate Manager
- **Health Checks**: `/api/health` endpoint
- **Sticky Sessions**: For Socket.io compatibility

#### 3. Database Layer
- **Primary Database**: PostgreSQL on AWS RDS
- **Cache Layer**: Redis on AWS ElastiCache
- **Backup Strategy**: Automated daily backups with point-in-time recovery
- **Monitoring**: Performance Insights and CloudWatch metrics

#### 4. Networking
- **VPC**: Multi-AZ deployment across 3 availability zones
- **Subnets**: Public, private, and database subnets
- **Security**: Security groups with least-privilege access
- **NAT Gateway**: For outbound internet access from private subnets

## Deployment Environments

### Development Environment

```bash
# Prerequisites
- Docker and Docker Compose
- Node.js 18+ and pnpm
- Git

# Setup
./scripts/dev-setup.sh

# Start development environment
./scripts/dev-start.sh
```

**Services Started:**
- Next.js application (localhost:3000)
- PostgreSQL database (localhost:5432)
- Redis cache (localhost:6379)

### Staging Environment

```bash
# Deploy to staging
./scripts/deploy.sh staging deploy

# Health check
curl -f https://staging.plexwatchtogether.com/api/health
```

**Configuration:**
- Single ECS task
- db.t3.small RDS instance
- Basic monitoring
- 3-day log retention

### Production Environment

```bash
# Deploy to production with blue-green deployment
./scripts/deploy.sh production deploy

# Rollback if needed
./scripts/deploy.sh production rollback
```

**Configuration:**
- Multi-AZ deployment
- Auto-scaling (2-10 instances)
- db.t3.medium RDS with Multi-AZ
- Enhanced monitoring
- 30-day log retention
- Automated backups

## Infrastructure as Code (Terraform)

### Directory Structure

```
infrastructure/
├── main.tf          # Main infrastructure resources
├── variables.tf     # Input variables
├── outputs.tf       # Output values
├── database.tf      # Database and cache resources
├── ecs.tf          # ECS cluster and services
├── alb.tf          # Load balancer configuration
├── iam.tf          # IAM roles and policies
├── monitoring.tf   # CloudWatch and monitoring
├── security.tf     # Security groups and WAF
└── environments/   # Environment-specific configurations
    ├── dev.tfvars
    ├── staging.tfvars
    └── production.tfvars
```

### Deployment Commands

```bash
# Initialize Terraform
cd infrastructure
terraform init

# Plan deployment
terraform plan -var-file="environments/production.tfvars"

# Apply changes
terraform apply -var-file="environments/production.tfvars"

# Destroy infrastructure (be careful!)
terraform destroy -var-file="environments/production.tfvars"
```

### Environment Variables

Create environment-specific `.tfvars` files:

```hcl
# production.tfvars
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

# Domain Configuration
domain_name            = "plexwatchtogether.com"
create_route53_record  = true
route53_zone_id       = "Z1234567890ABC"
```

## Docker Configuration

### Multi-Stage Dockerfile

The application uses a multi-stage Dockerfile optimized for production:

1. **Base Stage**: System dependencies and security updates
2. **Dependencies Stage**: Node.js dependencies installation
3. **Builder Stage**: Application compilation and optimization
4. **Production Stage**: Minimal runtime with security hardening

### Security Features

- Non-root user execution
- Read-only filesystem
- Security labels and capabilities
- Minimal attack surface
- Regular security updates

### Build Commands

```bash
# Development build
docker build -t plex-watch-together:dev .

# Production build
docker build --target production -t plex-watch-together:latest .

# Multi-architecture build
docker buildx build --platform linux/amd64,linux/arm64 -t plex-watch-together:latest .
```

## Monitoring and Observability

### CloudWatch Metrics

#### Application Metrics
- Request count and latency
- Error rates and status codes
- Custom business metrics

#### Infrastructure Metrics
- CPU and memory utilization
- Database performance metrics
- Cache hit rates
- Network throughput

### Log Aggregation

```bash
# View application logs
aws logs tail /aws/ecs/plex-watch-together --follow

# Filter error logs
aws logs filter-log-events \
  --log-group-name /aws/ecs/plex-watch-together \
  --filter-pattern "ERROR"
```

### Alerting

#### Critical Alerts
- Application downtime
- Database connectivity issues
- High error rates (>5%)
- Resource exhaustion

#### Warning Alerts
- High response times (>2s)
- Database slow queries
- Cache miss rates
- Disk space usage (>80%)

### Health Checks

```bash
# Application health
curl -f https://plexwatchtogether.com/api/health

# Database health
curl -f https://plexwatchtogether.com/api/health/database

# Cache health
curl -f https://plexwatchtogether.com/api/health/cache
```

## Security

### Network Security

- **VPC Isolation**: All resources in private VPC
- **Security Groups**: Restrictive inbound/outbound rules
- **WAF Protection**: SQL injection and XSS protection
- **DDoS Protection**: AWS Shield integration

### Data Security

- **Encryption at Rest**: RDS and ElastiCache encryption
- **Encryption in Transit**: TLS 1.3 for all connections
- **Secrets Management**: AWS Secrets Manager
- **Key Rotation**: Automated credential rotation

### Access Control

- **IAM Roles**: Least-privilege access policies
- **MFA**: Multi-factor authentication required
- **Audit Logging**: CloudTrail for API calls
- **Network ACLs**: Additional layer of security

## Backup and Disaster Recovery

### Database Backups

- **Automated Backups**: Daily backups with 30-day retention
- **Point-in-Time Recovery**: Up to the last 5 minutes
- **Cross-Region Replication**: For disaster recovery
- **Backup Testing**: Automated restore validation

### Application Recovery

- **Blue-Green Deployment**: Zero-downtime deployments
- **Auto-Scaling**: Automatic recovery from failures
- **Health Checks**: Automatic unhealthy instance replacement
- **Rollback Capability**: Quick rollback to previous version

### Recovery Procedures

```bash
# Database restore from backup
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier plex-watch-together-restored \
  --db-snapshot-identifier plex-watch-together-snapshot-2024-01-01

# Application rollback
./scripts/deploy.sh production rollback
```

## Performance Optimization

### Application Optimizations

- **Connection Pooling**: Database connection optimization
- **Caching Strategy**: Multi-layer caching with Redis
- **CDN Integration**: Static asset delivery via CloudFront
- **Compression**: Gzip/Brotli compression enabled

### Database Optimizations

- **Read Replicas**: For read-heavy workloads
- **Connection Pooling**: PgBouncer integration
- **Query Optimization**: Performance Insights monitoring
- **Indexing Strategy**: Optimized database indexes

### Infrastructure Optimizations

- **Auto Scaling**: Responsive to traffic patterns
- **Resource Right-Sizing**: Optimal CPU/memory allocation
- **Network Optimization**: Placement groups and enhanced networking
- **Cost Optimization**: Spot instances for development

## Operational Procedures

### Deployment Process

1. **Pre-Deployment Checks**
   - Code review and testing
   - Security scan completion
   - Database migration validation

2. **Deployment Execution**
   - Blue-green deployment
   - Health check validation
   - Smoke testing

3. **Post-Deployment Verification**
   - Monitoring dashboard review
   - Performance metrics validation
   - User acceptance testing

### Incident Response

1. **Detection**: Automated alerting and monitoring
2. **Assessment**: Impact and severity evaluation
3. **Response**: Immediate mitigation steps
4. **Recovery**: Full service restoration
5. **Post-Mortem**: Root cause analysis and improvements

### Maintenance Windows

- **Scheduled Maintenance**: Second Sunday of each month (2 AM - 4 AM UTC)
- **Emergency Patches**: As needed with minimal downtime
- **Database Maintenance**: Automated during low-traffic hours

## Cost Optimization

### Resource Management

- **Auto Scaling**: Scale down during low traffic
- **Reserved Instances**: For predictable workloads
- **Spot Instances**: For development environments
- **Resource Monitoring**: Regular right-sizing reviews

### Cost Monitoring

```bash
# View cost by service
aws ce get-cost-and-usage \
  --time-period Start=2024-01-01,End=2024-01-31 \
  --granularity MONTHLY \
  --metrics BlendedCost \
  --group-by Type=DIMENSION,Key=SERVICE
```

### Estimated Monthly Costs (Production)

| Service | Configuration | Est. Monthly Cost |
|---------|--------------|-------------------|
| ECS Tasks | 2x (1 vCPU, 2GB RAM) | ~$60 |
| RDS | db.t3.medium Multi-AZ | ~$106 |
| ElastiCache | cache.t3.micro | ~$15 |
| ALB | Standard configuration | ~$16 |
| Data Transfer | 100GB/month | ~$9 |
| **Total** | | **~$206/month** |

## Troubleshooting Guide

### Common Issues

#### Application Won't Start
```bash
# Check ECS service status
aws ecs describe-services --cluster plex-watch-together --services plex-watch-together-service

# Check task logs
aws logs tail /aws/ecs/plex-watch-together --follow
```

#### Database Connection Issues
```bash
# Test database connectivity
aws rds describe-db-instances --db-instance-identifier plex-watch-together-prod

# Check security groups
aws ec2 describe-security-groups --group-ids sg-xxxxx
```

#### High Response Times
```bash
# Check application metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/ApplicationELB \
  --metric-name TargetResponseTime \
  --start-time 2024-01-01T00:00:00Z \
  --end-time 2024-01-01T23:59:59Z \
  --period 300 \
  --statistics Average
```

### Performance Debugging

1. **Application Performance**
   - Review CloudWatch metrics
   - Analyze slow query logs
   - Check cache hit rates

2. **Infrastructure Performance**
   - Monitor CPU/memory usage
   - Review network throughput
   - Check disk I/O patterns

3. **Database Performance**
   - Use Performance Insights
   - Analyze query execution plans
   - Monitor connection pool usage

## Contact Information

For infrastructure-related questions or issues:

- **DevOps Team**: devops@plexwatchtogether.com
- **On-Call Engineer**: Use PagerDuty escalation
- **Documentation**: [Internal Wiki](https://wiki.plexwatchtogether.com)
- **Status Page**: [status.plexwatchtogether.com](https://status.plexwatchtogether.com)

---

*Last Updated: January 2024*
*Version: 1.0*