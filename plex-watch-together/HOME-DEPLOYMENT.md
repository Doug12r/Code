# 🏠 Home Server Deployment Guide

Complete guide for running Plex Watch Together on your home machine with Caddy reverse proxy.

## 🚀 Quick Setup Options

### Option 1: With Domain Name (Recommended)
If you have a domain pointing to your home IP:

```bash
# 1. Start your app
npm run build && npm start

# 2. Install Caddy (Ubuntu/Debian)
sudo apt update
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install caddy

# 3. Configure Caddy
sudo cp Caddyfile /etc/caddy/Caddyfile
# Edit the file to replace yourdomain.com with your actual domain
sudo nano /etc/caddy/Caddyfile

# 4. Start Caddy
sudo systemctl enable caddy
sudo systemctl start caddy
```

### Option 2: Local Network Only
For testing on your local network:

```bash
# 1. Start your app
npm start

# 2. Use the localhost config in Caddyfile
caddy run --config Caddyfile --adapter caddyfile

# Access at: http://localhost:8080
```

### Option 3: Docker Compose with Caddy

```yaml
# docker-compose.home.yml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "3001:3001"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://plexuser:plexpass@postgres:5432/plexwatch
    depends_on:
      - postgres
      - redis
    networks:
      - plex-network

  caddy:
    image: caddy:2-alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    depends_on:
      - app
    networks:
      - plex-network

  postgres:
    image: postgres:15-alpine
    environment:
      - POSTGRES_USER=plexuser
      - POSTGRES_PASSWORD=plexpass
      - POSTGRES_DB=plexwatch
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - plex-network

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data
    networks:
      - plex-network

volumes:
  postgres_data:
  redis_data:
  caddy_data:
  caddy_config:

networks:
  plex-network:
    driver: bridge
```

## 🌐 Network Configuration

### Port Forwarding (for external access)
Forward these ports on your router:
- **Port 80** → Your machine's local IP
- **Port 443** → Your machine's local IP

### Dynamic DNS (if you don't have static IP)
Use services like:
- **DuckDNS** (free): `yourusername.duckdns.org`
- **No-IP** (free): `yourusername.ddns.net`
- **Cloudflare** (free with domain)

## 🔒 Security Considerations

### Firewall Setup (Ubuntu)
```bash
# Enable firewall
sudo ufw enable

# Allow SSH (important!)
sudo ufw allow ssh

# Allow HTTP/HTTPS
sudo ufw allow 80
sudo ufw allow 443

# Allow your app port (for direct access if needed)
sudo ufw allow 3001

# Check status
sudo ufw status
```

### SSL Certificate
Caddy automatically gets Let's Encrypt certificates for your domain. No manual setup needed!

### Environment Variables
Create `.env.production`:

```bash
# Database
DATABASE_URL="postgresql://plexuser:plexpass@localhost:5432/plexwatch"

# Authentication
NEXTAUTH_URL="https://your-domain.com"
NEXTAUTH_SECRET="your-super-secret-key-here"

# Plex
PLEX_CLIENT_IDENTIFIER="plex-watch-together-home"

# Security
ENCRYPTION_KEY="your-encryption-key-32-characters-long"

# Optional: OAuth
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"
```

## 📱 Access Methods

### Internal Network
- **Direct:** `http://your-local-ip:3001`
- **Through Caddy:** `http://your-local-ip:8080`

### External Network (with domain)
- **HTTPS:** `https://your-domain.com`
- **Automatic redirect from HTTP**

### Mobile Access
The app is fully responsive and works great on phones/tablets!

## 🛠️ Troubleshooting

### Check App Status
```bash
# Check if app is running
curl http://localhost:3001/api/ping

# Check logs
npm start 2>&1 | tee app.log
```

### Check Caddy Status
```bash
# Check Caddy service
sudo systemctl status caddy

# Check Caddy logs
sudo journalctl -u caddy -f

# Test Caddy config
sudo caddy validate --config /etc/caddy/Caddyfile
```

### Network Testing
```bash
# Test internal access
curl http://localhost:3001

# Test Caddy proxy
curl http://localhost:8080

# Test external access (replace with your domain)
curl https://your-domain.com
```

## 🚀 Performance Tips

### Enable Compression
Already configured in the Caddyfile with `encode gzip zstd`

### Database Optimization
```bash
# For better performance, use PostgreSQL instead of SQLite
# Update your DATABASE_URL in .env.production
```

### Monitoring
```bash
# Monitor system resources
htop

# Monitor network
sudo netstat -tulpn | grep :3001
sudo netstat -tulpn | grep :80
sudo netstat -tulpn | grep :443
```

## 🎯 Quick Start Commands

```bash
# Complete setup in one go:
git clone your-repo
cd plex-watch-together

# Install dependencies
npm install

# Setup environment
cp .env.example .env.production
# Edit .env.production with your settings

# Build and start
npm run build
npm start &

# Setup Caddy (Ubuntu)
sudo apt install caddy
sudo cp Caddyfile /etc/caddy/Caddyfile
# Edit /etc/caddy/Caddyfile with your domain
sudo systemctl enable --now caddy

# Check everything is working
curl http://localhost:3001/api/ping
curl http://localhost:8080/api/ping  # Through Caddy
```

## 🌟 Features You'll Get

- ✅ **Automatic HTTPS** with Let's Encrypt
- ✅ **Security Headers** for protection
- ✅ **Compression** for faster loading
- ✅ **Professional URLs** (your-domain.com)
- ✅ **Mobile Access** from anywhere
- ✅ **Zero Configuration** SSL
- ✅ **Automatic Redirects** HTTP → HTTPS

Your friends can now access your Plex Watch Together at `https://your-domain.com`! 🎬🍿