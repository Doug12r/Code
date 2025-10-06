# Digital Ocean Droplet Deployment Guide

Complete guide for deploying Plex Watch Together on a Digital Ocean droplet with custom domain and SSL.

## Table of Contents
- [Prerequisites](#prerequisites)
- [1. Create Digital Ocean Droplet](#1-create-digital-ocean-droplet)
- [2. Initial Server Setup](#2-initial-server-setup)
- [3. Domain Configuration](#3-domain-configuration)
- [4. Application Deployment](#4-application-deployment)
- [5. SSL and Security](#5-ssl-and-security)
- [6. Monitoring and Maintenance](#6-monitoring-and-maintenance)
- [7. Troubleshooting](#7-troubleshooting)

## Prerequisites

- Digital Ocean account
- Domain name (or use a free subdomain service)
- Local development environment with the project

## 1. Create Digital Ocean Droplet

### Step 1: Create Droplet
1. Log into your Digital Ocean dashboard
2. Click "Create" → "Droplets"
3. **Choose Image**: Ubuntu 22.04 (LTS) x64
4. **Choose Size**: 
   - **Basic Plan**: $12/month (2GB RAM, 1 vCPU, 50GB SSD) - Minimum recommended
   - **Regular**: $24/month (4GB RAM, 2 vCPU, 80GB SSD) - Better performance
5. **Add block storage**: Optional (for media caching)
6. **Choose datacenter**: Select closest to your users
7. **Authentication**: 
   - **SSH Key** (recommended) or **Password**
   - If using SSH key, upload your public key
8. **Add tags**: `plex-watch-together`, `production`
9. Click **Create Droplet**

### Step 2: Note Your Droplet Details
```bash
# Example details (replace with yours)
DROPLET_IP=164.90.xxx.xxx
DROPLET_NAME=plex-watch-together
DOMAIN=yourdomain.com  # or plexwatch.yourdomain.com
```

## 2. Initial Server Setup

### Step 1: Connect to Your Droplet
```bash
# Using SSH key
ssh root@YOUR_DROPLET_IP

# Using password (if you chose password authentication)
ssh root@YOUR_DROPLET_IP
```

### Step 2: Update System
```bash
# Update package lists
apt update

# Upgrade all packages
apt upgrade -y

# Install essential packages
apt install -y curl wget git nano htop ufw fail2ban
```

### Step 3: Create Application User
```bash
# Create user for the application
adduser plexwatch

# Add to sudo group
usermod -aG sudo plexwatch

# Switch to application user
su - plexwatch
```

### Step 4: Setup Firewall
```bash
# Allow SSH
sudo ufw allow ssh

# Allow HTTP and HTTPS
sudo ufw allow 80
sudo ufw allow 443

# Allow application port (optional, we'll use reverse proxy)
sudo ufw allow 3001

# Enable firewall
sudo ufw enable

# Check status
sudo ufw status
```

## 3. Domain Configuration

### Option A: Using Your Own Domain

1. **Add A Record**: Point your domain to the droplet IP
   ```
   Type: A
   Name: @ (for root domain) or plexwatch (for subdomain)
   Value: YOUR_DROPLET_IP
   TTL: 300 (5 minutes)
   ```

2. **Optional CNAME for www**:
   ```
   Type: CNAME
   Name: www
   Value: yourdomain.com
   TTL: 300
   ```

### Option B: Using Free Subdomain Services

#### DuckDNS (Recommended)
1. Visit [DuckDNS.org](https://www.duckdns.org)
2. Sign in with your preferred method
3. Create a subdomain: `your-app-name.duckdns.org`
4. Set IP to your droplet IP
5. Note your token for auto-updates

#### No-IP
1. Visit [No-IP.com](https://www.noip.com)
2. Create free account
3. Create hostname: `your-app.ddns.net`
4. Point to your droplet IP

### Step 3: Verify DNS Resolution
```bash
# Test DNS resolution (replace with your domain)
nslookup yourdomain.com
dig yourdomain.com
```

## 4. Application Deployment

### Step 1: Install Node.js and Dependencies
```bash
# Install Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 for process management
sudo npm install -g pm2

# Install Caddy for reverse proxy
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install -y caddy

# Verify installations
node --version
npm --version
pm2 --version
caddy version
```

### Step 2: Deploy Application Code

#### Option A: Direct Upload (Recommended)
```bash
# Create application directory
mkdir -p /home/plexwatch/app
cd /home/plexwatch/app

# Upload your built application files here
# You can use scp, rsync, or git clone
```

**From your local machine:**
```bash
# Build the application locally first
npm run build

# Copy files to droplet (replace with your details)
rsync -avz --exclude node_modules --exclude .git ./ plexwatch@YOUR_DROPLET_IP:/home/plexwatch/app/

# Or using scp
scp -r ./ plexwatch@YOUR_DROPLET_IP:/home/plexwatch/app/
```

#### Option B: Git Clone (Alternative)
```bash
# Clone from your repository
git clone https://github.com/yourusername/plex-watch-together.git /home/plexwatch/app
cd /home/plexwatch/app

# If private repository, set up SSH keys or use token
```

### Step 3: Install Application Dependencies
```bash
cd /home/plexwatch/app

# Install production dependencies
npm ci --only=production

# Build the application (if not built locally)
npm run build
```

### Step 4: Environment Configuration
```bash
# Create production environment file
nano .env.production

# Add your production environment variables
```

**Example `.env.production`:**
```bash
# Database
DATABASE_URL="file:./prisma/prod.db"

# NextAuth Configuration
NEXTAUTH_URL="https://yourdomain.com"
NEXTAUTH_SECRET="your-super-secret-key-here"

# Application
NODE_ENV=production
PORT=3001

# Optional: External services
REDIS_URL="redis://localhost:6379"

# Plex Configuration (users will set these in UI)
# These are just defaults
PLEX_SERVER_URL=""
PLEX_TOKEN=""
```

### Step 5: Database Setup
```bash
# Generate Prisma client
npx prisma generate

# Run database migrations
npx prisma migrate deploy

# Optional: Seed database
npx prisma db seed
```

## 5. SSL and Security

### Step 1: Configure Caddy Reverse Proxy
```bash
# Backup original Caddy config
sudo cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.backup

# Create new Caddy configuration
sudo nano /etc/caddy/Caddyfile
```

**Caddy Configuration (`/etc/caddy/Caddyfile`):**
```caddy
# Replace yourdomain.com with your actual domain
yourdomain.com {
    # Reverse proxy to Node.js application
    reverse_proxy localhost:3001 {
        # WebSocket support for Socket.IO
        header_up Connection {>Connection}
        header_up Upgrade {>Upgrade}
        header_up Sec-WebSocket-Key {>Sec-WebSocket-Key}
        header_up Sec-WebSocket-Version {>Sec-WebSocket-Version}
        header_up Sec-WebSocket-Extensions {>Sec-WebSocket-Extensions}
        header_up Sec-WebSocket-Protocol {>Sec-WebSocket-Protocol}
        
        # Standard headers
        header_up Host {host}
        header_up X-Real-IP {remote_host}
        header_up X-Forwarded-For {remote_host}
        header_up X-Forwarded-Proto {scheme}
        header_up X-Forwarded-Host {host}
    }
    
    # Enable gzip compression
    encode gzip zstd
    
    # Security headers
    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
        X-Content-Type-Options "nosniff"
        X-Frame-Options "SAMEORIGIN"
        X-XSS-Protection "1; mode=block"
        Referrer-Policy "strict-origin-when-cross-origin"
        -Server
        -X-Powered-By
    }
    
    # Logging
    log {
        output file /var/log/caddy/access.log
        format json
    }
}

# Redirect www to non-www (optional)
www.yourdomain.com {
    redir https://yourdomain.com{uri} permanent
}
```

### Step 2: Start and Enable Services
```bash
# Test Caddy configuration
sudo caddy validate --config /etc/caddy/Caddyfile

# Start and enable Caddy
sudo systemctl enable caddy
sudo systemctl start caddy
sudo systemctl status caddy

# Check Caddy logs
sudo journalctl -u caddy -f
```

### Step 3: Start Application with PM2
```bash
cd /home/plexwatch/app

# Create PM2 ecosystem file
nano ecosystem.config.js
```

**PM2 Configuration (`ecosystem.config.js`):**
```javascript
module.exports = {
  apps: [{
    name: 'plex-watch-together',
    script: 'server.js',
    cwd: '/home/plexwatch/app',
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
    log_file: '/home/plexwatch/logs/app.log',
    error_file: '/home/plexwatch/logs/error.log',
    out_file: '/home/plexwatch/logs/out.log',
    pid_file: '/home/plexwatch/logs/pid',
    max_memory_restart: '1G',
    restart_delay: 5000,
    watch: false,
    ignore_watch: ['node_modules', 'logs', '.git']
  }]
}
```

```bash
# Create logs directory
mkdir -p /home/plexwatch/logs

# Start application with PM2
pm2 start ecosystem.config.js --env production

# Save PM2 configuration
pm2 save

# Setup PM2 to start on boot
pm2 startup
# Follow the instructions shown (run the command it gives you with sudo)

# Check application status
pm2 status
pm2 logs plex-watch-together
```

### Step 4: Verify Deployment
```bash
# Check if application is running
pm2 status

# Check application logs
pm2 logs plex-watch-together --lines 50

# Test local connection
curl http://localhost:3001

# Check Caddy status
sudo systemctl status caddy

# Test SSL certificate (after DNS propagation)
curl -I https://yourdomain.com
```

## 6. Monitoring and Maintenance

### Step 1: Setup Log Rotation
```bash
# Create logrotate configuration
sudo nano /etc/logrotate.d/plex-watch-together
```

**Logrotate Configuration:**
```
/home/plexwatch/logs/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 644 plexwatch plexwatch
    postrotate
        pm2 reload plex-watch-together
    endscript
}
```

### Step 2: Setup Monitoring with PM2
```bash
# Install PM2 monitoring (optional)
pm2 install pm2-logrotate

# Configure log rotation
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
pm2 set pm2-logrotate:compress true

# Monitor application
pm2 monit
```

### Step 3: Database Backup Script
```bash
# Create backup script
nano /home/plexwatch/backup.sh
chmod +x /home/plexwatch/backup.sh
```

**Backup Script (`backup.sh`):**
```bash
#!/bin/bash

BACKUP_DIR="/home/plexwatch/backups"
APP_DIR="/home/plexwatch/app"
DATE=$(date +%Y%m%d_%H%M%S)

# Create backup directory
mkdir -p $BACKUP_DIR

# Backup database
cp $APP_DIR/prisma/prod.db $BACKUP_DIR/database_$DATE.db

# Backup application files (excluding node_modules)
tar -czf $BACKUP_DIR/app_$DATE.tar.gz -C /home/plexwatch --exclude=app/node_modules app/

# Keep only last 7 days of backups
find $BACKUP_DIR -name "*.db" -mtime +7 -delete
find $BACKUP_DIR -name "*.tar.gz" -mtime +7 -delete

echo "Backup completed: $DATE"
```

### Step 4: Setup Cron Jobs
```bash
# Edit crontab
crontab -e

# Add backup job (daily at 2 AM)
0 2 * * * /home/plexwatch/backup.sh >> /home/plexwatch/logs/backup.log 2>&1

# Add PM2 resurrection (on reboot)
@reboot pm2 resurrect
```

## 7. Troubleshooting

### Common Issues and Solutions

#### Application Won't Start
```bash
# Check PM2 logs
pm2 logs plex-watch-together --lines 100

# Check application files
ls -la /home/plexwatch/app/
cat /home/plexwatch/app/.env.production

# Test manual start
cd /home/plexwatch/app
NODE_ENV=production node server.js
```

#### SSL Certificate Issues
```bash
# Check Caddy logs
sudo journalctl -u caddy -f

# Test Caddy config
sudo caddy validate --config /etc/caddy/Caddyfile

# Force certificate renewal
sudo caddy reload --config /etc/caddy/Caddyfile
```

#### DNS Not Resolving
```bash
# Check DNS from droplet
nslookup yourdomain.com
dig yourdomain.com

# Check from external
# Use online DNS checker tools
```

#### WebSocket Connection Issues
```bash
# Test Socket.IO endpoint
curl -v https://yourdomain.com/socket.io/?EIO=4\&transport=polling

# Check application logs for Socket.IO
pm2 logs plex-watch-together | grep -i socket

# Verify Caddy WebSocket headers
sudo caddy fmt /etc/caddy/Caddyfile
```

### Useful Commands

```bash
# Application Management
pm2 restart plex-watch-together    # Restart app
pm2 reload plex-watch-together     # Graceful reload
pm2 stop plex-watch-together       # Stop app
pm2 delete plex-watch-together     # Remove from PM2

# View logs
pm2 logs plex-watch-together --lines 100
tail -f /home/plexwatch/logs/app.log

# System monitoring
htop                               # System resources
sudo ufw status                    # Firewall status
sudo systemctl status caddy       # Caddy status
df -h                              # Disk usage

# Update application
cd /home/plexwatch/app
git pull origin main               # If using git
npm ci --only=production           # Update dependencies
npm run build                      # Rebuild
pm2 reload plex-watch-together     # Restart app
```

### Performance Optimization

#### For Higher Traffic
```bash
# Increase PM2 instances (cluster mode)
# Edit ecosystem.config.js:
instances: 'max',  # Use all CPU cores
exec_mode: 'cluster'

# Install Redis for session storage
sudo apt install redis-server
sudo systemctl enable redis-server
sudo systemctl start redis-server

# Add to .env.production:
REDIS_URL="redis://localhost:6379"
```

#### Database Optimization
```bash
# For high usage, consider PostgreSQL
sudo apt install postgresql postgresql-contrib

# Create database and user
sudo -u postgres psql
CREATE DATABASE plexwatch;
CREATE USER plexwatch WITH PASSWORD 'secure_password';
GRANT ALL PRIVILEGES ON DATABASE plexwatch TO plexwatch;

# Update DATABASE_URL in .env.production
DATABASE_URL="postgresql://plexwatch:secure_password@localhost:5432/plexwatch"
```

### Security Hardening

```bash
# Setup fail2ban for SSH protection
sudo nano /etc/fail2ban/jail.local

[sshd]
enabled = true
port = ssh
filter = sshd
logpath = /var/log/auth.log
maxretry = 3
bantime = 3600

# Restart fail2ban
sudo systemctl restart fail2ban

# Change SSH port (optional)
sudo nano /etc/ssh/sshd_config
# Change: Port 22 to Port 2222
sudo systemctl restart sshd

# Update firewall
sudo ufw allow 2222
sudo ufw delete allow ssh
```

## Support and Updates

### Updating the Application
1. **Backup current version**: Run backup script
2. **Update code**: `git pull` or upload new files
3. **Install dependencies**: `npm ci --only=production`
4. **Build**: `npm run build`
5. **Restart**: `pm2 reload plex-watch-together`
6. **Verify**: Check logs and test functionality

### Getting Help
- Check application logs: `pm2 logs plex-watch-together`
- Check system logs: `sudo journalctl -f`
- Monitor resources: `htop`
- Test connectivity: Use the troubleshooting commands above

---

**🎉 Congratulations!** Your Plex Watch Together application should now be running on Digital Ocean with SSL certificates and proper monitoring. Access it at `https://yourdomain.com` and start sharing your Plex media with friends!