# Digital Ocean App Platform Deployment

This guide shows how to deploy Plex Watch Together using Digital Ocean's App Platform with GitHub integration for automatic deployments.

## Benefits of App Platform vs Manual Droplets

### App Platform Advantages ✅
- **GitHub Integration**: Auto-deploy on every push
- **Zero Server Management**: No SSH, no manual updates
- **Built-in SSL**: Automatic HTTPS certificates
- **Auto-scaling**: Handles traffic spikes automatically
- **Built-in CDN**: Global content delivery
- **Database Integration**: Managed PostgreSQL option
- **Environment Management**: Easy config via dashboard
- **Monitoring Included**: Built-in logs and metrics

### Traditional Droplet Advantages
- **More Control**: Full server access
- **Cost Effective**: Potentially cheaper for constant load
- **Custom Configuration**: Any software stack
- **Resource Isolation**: Dedicated resources

## App Platform Deployment Guide

### Prerequisites
1. **GitHub Repository**: Your code must be in a GitHub repo
2. **Digital Ocean Account**: Sign up at [digitalocean.com](https://digitalocean.com)
3. **Domain** (optional): Can use provided `.ondigitalocean.app` domain

### Step 1: Prepare Your Repository

Create these files in your repository root:

#### 1. App Platform Spec (`.do/app.yaml`)
```yaml
name: plex-watch-together
services:
  - name: web
    source_dir: /
    github:
      repo: YOUR_GITHUB_USERNAME/plex-watch-together
      branch: main
      deploy_on_push: true
    build_command: npm ci && npm run build
    run_command: node server.js
    environment_slug: node-js
    instance_count: 1
    instance_size_slug: basic-xxs
    http_port: 3001
    routes:
      - path: /
    envs:
      - key: NODE_ENV
        value: production
      - key: PORT
        value: "3001"
      - key: NEXTAUTH_URL
        value: ${APP_URL}
      - key: NEXTAUTH_SECRET
        value: ${NEXTAUTH_SECRET}
      - key: DATABASE_URL
        value: ${DATABASE_URL}

databases:
  - name: db
    engine: PG
    version: "15"
    size_slug: db-s-1vcpu-1gb
    num_nodes: 1

workers:
  - name: socket-server
    source_dir: /
    build_command: npm ci
    run_command: node socket-server.js
    instance_count: 1
    instance_size_slug: basic-xxs
    envs:
      - key: NODE_ENV
        value: production
```

#### 2. Docker Configuration (Optional - for more control)
```dockerfile
# Dockerfile
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies
RUN npm ci --only=production

# Copy application code
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Build application
RUN npm run build

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3001/api/ping || exit 1

# Start application
CMD ["node", "server.js"]
```

#### 3. Build Script (`scripts/build.sh`)
```bash
#!/bin/bash
set -e

echo "🔨 Building Plex Watch Together for App Platform..."

# Install dependencies
npm ci --only=production

# Generate Prisma client
npx prisma generate

# Run database migrations
npx prisma migrate deploy

# Build Next.js application
npm run build

echo "✅ Build completed successfully"
```

### Step 2: Deploy to App Platform

#### Option A: Using Digital Ocean Dashboard (Recommended)
1. **Go to App Platform**: Visit [cloud.digitalocean.com/apps](https://cloud.digitalocean.com/apps)
2. **Create App**: Click "Create App"
3. **Connect GitHub**: 
   - Choose "GitHub" as source
   - Authorize Digital Ocean to access your repos
   - Select your `plex-watch-together` repository
   - Choose `main` branch
4. **Configure Resources**:
   - **Web Service**: Auto-detected from your code
   - **Database**: Add PostgreSQL database
   - **Environment Variables**: Add required variables
5. **Review and Deploy**: Click "Create Resources"

#### Option B: Using CLI (Advanced)
```bash
# Install doctl CLI
curl -sL https://github.com/digitalocean/doctl/releases/download/v1.100.0/doctl-1.100.0-linux-amd64.tar.gz | tar -xzv
sudo mv doctl /usr/local/bin

# Authenticate
doctl auth init

# Deploy from spec file
doctl apps create --spec .do/app.yaml

# Or deploy directly from GitHub
doctl apps create --github-repo YOUR_USERNAME/plex-watch-together --github-branch main
```

### Step 3: Configure Environment Variables

In the App Platform dashboard, add these environment variables:

```bash
# Required Variables
NODE_ENV=production
PORT=3001
NEXTAUTH_URL=${APP_URL}  # Auto-populated by App Platform
NEXTAUTH_SECRET=your-generated-secret-32-chars

# Database (Auto-populated if you add managed database)
DATABASE_URL=${db.DATABASE_URL}

# Optional: External Services
REDIS_URL=redis://redis-cluster-url
PLEX_SERVER_URL=  # Users will configure in UI
PLEX_TOKEN=       # Users will configure in UI

# Optional: Monitoring
LOG_LEVEL=info
ENABLE_METRICS=true
```

### Step 4: Custom Domain Setup (Optional)

```bash
# In App Platform Dashboard:
# 1. Go to Settings → Domains
# 2. Add your custom domain: plexwatch.yourdomain.com
# 3. Update your DNS to point to the provided CNAME
# 4. SSL certificates are handled automatically
```

## Advanced App Platform Configuration

### Auto-Deploy Script (`.github/workflows/deploy.yml`)
```yaml
name: Deploy to Digital Ocean App Platform

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v4
    
    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version: '20'
        cache: 'npm'
    
    - name: Install dependencies
      run: npm ci
    
    - name: Run tests
      run: npm test
    
    - name: Build application
      run: npm run build
    
    - name: Deploy to App Platform
      if: github.ref == 'refs/heads/main'
      uses: digitalocean/app_action@v1.1.5
      with:
        app_name: plex-watch-together
        token: ${{ secrets.DIGITALOCEAN_ACCESS_TOKEN }}
```

### Environment-Specific Configurations

#### Production App Spec (`.do/production.yaml`)
```yaml
name: plex-watch-together-prod
services:
  - name: web
    instance_count: 2  # Multiple instances for HA
    instance_size_slug: basic-s  # Larger instances
    autoscaling:
      min_instance_count: 1
      max_instance_count: 5
      cpu_threshold_percent: 80
      memory_threshold_percent: 80
    
databases:
  - name: db
    size_slug: db-s-2vcpu-4gb  # Larger database
    num_nodes: 1
```

#### Development App Spec (`.do/development.yaml`)
```yaml
name: plex-watch-together-dev
services:
  - name: web
    github:
      branch: develop  # Deploy from develop branch
    instance_count: 1
    instance_size_slug: basic-xxs
```

## Cost Comparison

### App Platform Pricing
```
Basic Plan:
- Web Service: $12/month (1 vCPU, 512MB RAM)
- Database: $15/month (1 vCPU, 1GB RAM, 10GB storage)
- Total: ~$27/month

Professional Plan:
- Web Service: $24/month (1 vCPU, 1GB RAM)  
- Database: $25/month (1 vCPU, 2GB RAM, 25GB storage)
- Total: ~$49/month
```

### Traditional Droplet Pricing
```
Manual Setup:
- Droplet: $12-24/month
- Managed Database: $15/month (optional)
- Total: $12-39/month
```

## Migration from Droplet to App Platform

### 1. Prepare Repository
```bash
# Ensure your code is in GitHub
git remote add origin https://github.com/yourusername/plex-watch-together.git
git push -u origin main

# Add App Platform configuration files
cp .do/app.yaml .
git add .do/
git commit -m "Add App Platform configuration"
git push
```

### 2. Export Data from Droplet
```bash
# Connect to your droplet
ssh plexwatch@YOUR_DROPLET_IP

# Export database
cd /home/plexwatch/app
npx prisma db push --force-reset
pg_dump $DATABASE_URL > backup.sql

# Download backup
scp plexwatch@YOUR_DROPLET_IP:/home/plexwatch/app/backup.sql ./
```

### 3. Import to App Platform Database
```bash
# Get App Platform database connection
doctl apps list
doctl databases connection get <database-id>

# Import data
psql $APP_PLATFORM_DATABASE_URL < backup.sql
```

## Deployment Automation Script

Create a one-click deployment script:

```bash
#!/bin/bash
# deploy-to-app-platform.sh

echo "🚀 Deploying Plex Watch Together to Digital Ocean App Platform..."

# Check if doctl is installed
if ! command -v doctl &> /dev/null; then
    echo "Installing doctl..."
    curl -sL https://github.com/digitalocean/doctl/releases/download/v1.100.0/doctl-1.100.0-linux-amd64.tar.gz | tar -xzv
    sudo mv doctl /usr/local/bin
fi

# Authenticate (if not already done)
if ! doctl account get &> /dev/null; then
    echo "Please authenticate with Digital Ocean:"
    doctl auth init
fi

# Deploy app
echo "Creating app from repository..."
doctl apps create --spec .do/app.yaml

echo "✅ Deployment initiated! Check https://cloud.digitalocean.com/apps for status"
```

## Monitoring and Maintenance

### Built-in Features
- **Automatic SSL**: Let's Encrypt certificates
- **Auto-scaling**: Based on CPU/memory usage  
- **Health checks**: Automatic container restarts
- **Logging**: Centralized log aggregation
- **Metrics**: CPU, memory, request metrics
- **Alerts**: Email/Slack notifications

### Custom Monitoring
```javascript
// Add to your app for custom metrics
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    version: process.env.npm_package_version
  })
})
```

## Summary

### When to Use App Platform
✅ **Perfect for**:
- Quick deployments with zero server management
- Automatic scaling requirements
- GitHub-based workflow
- Built-in SSL and CDN needs
- Team collaboration with CI/CD

### When to Use Droplets  
✅ **Better for**:
- Custom server configurations
- Cost optimization for predictable loads
- Full system control requirements
- Specialized software stacks

**Recommendation**: Start with App Platform for rapid deployment and easy management. You can always migrate to droplets later if you need more control or cost optimization.

Would you like me to create the complete App Platform deployment files for your project?