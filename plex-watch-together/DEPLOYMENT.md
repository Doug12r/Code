# Production Deployment Guide

## 🚀 Deployment Options

### Vercel (Recommended)
Easiest deployment with automatic CI/CD:

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Environment variables (set in Vercel dashboard)
DATABASE_URL=postgresql://user:pass@host:5432/dbname
REDIS_URL=redis://user:pass@host:6379
NEXTAUTH_SECRET=your-secret-key
NEXTAUTH_URL=https://your-domain.com
ENCRYPTION_KEY=your-encryption-key
ADMIN_EMAIL=admin@yoursite.com
ADMIN_PASSWORD=secure-admin-password
```

### Docker (Self-hosted)
For complete control and self-hosting:

```dockerfile
FROM node:18-alpine AS base

# Install dependencies
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --only=production

# Build application  
FROM base AS builder
WORKDIR /app
COPY . .
COPY --from=deps /app/node_modules ./node_modules
RUN npm run build

# Production image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
```

### Railway
Simple deployment with built-in PostgreSQL:

```bash
# Install Railway CLI
npm i -g @railway/cli

# Login and deploy
railway login
railway init
railway add postgresql
railway deploy
```

## 🔧 Environment Configuration

### Required Environment Variables

```bash
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/plex_watch_together
REDIS_URL=redis://localhost:6379

# Authentication
NEXTAUTH_SECRET=super-secret-jwt-key-min-32-chars
NEXTAUTH_URL=https://your-domain.com

# Security  
ENCRYPTION_KEY=your-encryption-key-for-tokens

# Admin Account
ADMIN_EMAIL=admin@yoursite.com
ADMIN_PASSWORD=secure-admin-password

# Optional: Analytics
VERCEL_ANALYTICS_ID=your-analytics-id
SENTRY_DSN=your-sentry-dsn
```

### Database Setup

```sql
-- Create database
CREATE DATABASE plex_watch_together;
CREATE USER plex_user WITH PASSWORD 'secure_password';
GRANT ALL PRIVILEGES ON DATABASE plex_watch_together TO plex_user;

-- Run migrations (automatic in deployment)
npx prisma migrate deploy
```

## 🔍 Health Monitoring

### Health Check Endpoints

```bash
# Application health
GET /api/health

# Database health  
GET /api/health/database

# Redis health
GET /api/health/redis

# Plex service health
GET /api/health/plex
```

### Monitoring Setup

```javascript
// Add to your monitoring service
const endpoints = [
  'https://yoursite.com/api/health',
  'https://yoursite.com/api/health/database',
  'https://yoursite.com/api/health/redis'
]

// Check every 5 minutes
setInterval(checkEndpoints, 5 * 60 * 1000)
```

## 📊 Performance Monitoring

### Key Metrics to Track

- Response times per endpoint
- Database connection pool usage
- Redis cache hit rates
- Active WebSocket connections
- Error rates and types

### Recommended Tools

- **Vercel Analytics**: Built-in performance monitoring
- **Sentry**: Error tracking and performance monitoring
- **DataDog**: Comprehensive APM solution
- **New Relic**: Full-stack monitoring

## 🔒 Security Checklist

### Pre-deployment Security

- [ ] Environment variables secured
- [ ] Rate limiting configured
- [ ] HTTPS enforced
- [ ] Security headers set
- [ ] Database credentials rotated
- [ ] JWT secrets generated (32+ characters)
- [ ] Admin account secured
- [ ] Plex tokens encrypted

### Post-deployment Security

- [ ] SSL certificate valid
- [ ] Security headers verified
- [ ] Rate limiting tested
- [ ] Database access restricted
- [ ] Backup strategy implemented
- [ ] Monitoring alerts configured

## 🚨 Troubleshooting

### Common Issues

#### Database Connection Errors
```bash
# Check connection string
echo $DATABASE_URL

# Test connection
npx prisma db push --preview-feature
```

#### Redis Connection Issues
```bash  
# Test Redis connection
redis-cli -u $REDIS_URL ping

# Check Redis memory
redis-cli -u $REDIS_URL info memory
```

#### Socket.io Connection Problems
```javascript
// Enable debug logging
localStorage.debug = 'socket.io-client:socket'

// Check WebSocket upgrade
// Network tab → WS filter in browser dev tools
```

#### Performance Issues
```bash
# Check cache hit rates
curl https://yoursite.com/api/plex/v2/performance

# Monitor response times
curl -w "@curl-format.txt" https://yoursite.com/api/health
```

## 📈 Scaling Considerations

### Horizontal Scaling

```yaml
# docker-compose.yml for load balancing
version: '3.8'
services:
  app1:
    image: plex-watch-together
    environment:
      - PORT=3000
  app2:
    image: plex-watch-together  
    environment:
      - PORT=3001
  nginx:
    image: nginx
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
    ports:
      - "80:80"
```

### Database Scaling

```bash
# Read replicas for PostgreSQL
DATABASE_READ_URL=postgresql://readonly-user@read-replica:5432/db

# Connection pooling
DATABASE_POOL_MAX=20
DATABASE_POOL_MIN=5
```

### Redis Clustering

```bash
# Redis cluster for high availability
REDIS_CLUSTER_NODES=redis1:6379,redis2:6379,redis3:6379
```

## 🔄 CI/CD Pipeline

### GitHub Actions Example

```yaml
name: Deploy
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18
      - run: npm ci
      - run: npm run build
      - run: npm test
      - uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
```

## 📋 Deployment Checklist

### Pre-deployment
- [ ] All tests passing
- [ ] Environment variables configured
- [ ] Database migrations ready
- [ ] SSL certificates obtained
- [ ] Domain DNS configured
- [ ] Monitoring tools setup

### Deployment
- [ ] Application deployed successfully
- [ ] Database migrations applied
- [ ] Health checks passing
- [ ] SSL certificate active
- [ ] Rate limiting functional
- [ ] WebSocket connections working

### Post-deployment
- [ ] Performance metrics baseline established
- [ ] Error monitoring active
- [ ] Backup strategy verified
- [ ] Load testing completed
- [ ] User acceptance testing passed
- [ ] Documentation updated

## 📞 Support

### Getting Help

- **Documentation**: Check ARCHITECTURE.md for technical details
- **Issues**: GitHub Issues for bug reports
- **Performance**: Use built-in monitoring dashboard
- **Security**: Follow security best practices guide

### Emergency Contacts

- Database issues: Check connection pooling and query performance
- Redis issues: Verify cache configuration and memory usage  
- Application errors: Check error logs and monitoring dashboards
- Security concerns: Review rate limiting and access logs