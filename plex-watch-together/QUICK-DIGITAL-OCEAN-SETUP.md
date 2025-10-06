# Quick Digital Ocean Setup Guide

## TL;DR - Fast Deployment

### Prerequisites
1. **Digital Ocean Account**: Sign up at [digitalocean.com](https://digitalocean.com)
2. **Domain Name**: Either your own domain or free services like:
   - [DuckDNS](https://duckdns.org) - Free subdomains
   - [No-IP](https://noip.com) - Free dynamic DNS
3. **SSH Key**: Generate with `ssh-keygen -t rsa -b 4096`

### 1. Create Droplet (5 minutes)
```bash
# In Digital Ocean Dashboard:
# 1. Click "Create" → "Droplets"
# 2. Choose: Ubuntu 22.04 LTS
# 3. Size: $12/month (2GB RAM, 1 vCPU) - Minimum
# 4. Add your SSH key
# 5. Create droplet and note the IP address
```

### 2. Point Domain to Droplet (2 minutes)
```bash
# Add DNS A record:
# Name: @ (for root domain) or your-subdomain
# Type: A
# Value: YOUR_DROPLET_IP
# TTL: 300 seconds
```

### 3. Automated Deployment (15 minutes)
```bash
# From your local project directory:
./deploy-to-digitalocean.sh yourdomain.com YOUR_DROPLET_IP ~/.ssh/id_rsa

# Example:
./deploy-to-digitalocean.sh plexwatch.duckdns.org 164.90.123.45 ~/.ssh/id_rsa
```

**That's it!** The script handles everything:
- Server setup and security
- Dependencies (Node.js, Caddy, PM2)
- Application deployment
- SSL certificates (automatic)
- Process management
- Monitoring and backups

### 4. Access Your App
```bash
# Wait 5-10 minutes for DNS propagation, then visit:
https://yourdomain.com

# If DNS hasn't propagated yet, test with IP:
http://YOUR_DROPLET_IP:3001
```

## Manual Deployment (Alternative)

If you prefer manual control, follow the detailed guide in [DIGITAL-OCEAN-DEPLOYMENT.md](./DIGITAL-OCEAN-DEPLOYMENT.md).

## Cost Breakdown

### Minimal Setup ($12-15/month)
- **Droplet**: $12/month (2GB RAM, 1 vCPU, 50GB SSD)
- **Domain**: $0-15/year (free with DuckDNS)
- **Bandwidth**: 2TB included

### Recommended Setup ($24-30/month)
- **Droplet**: $24/month (4GB RAM, 2 vCPU, 80GB SSD)
- **Load Balancer**: $12/month (for high availability)
- **Managed Database**: $15/month (PostgreSQL)

### High Performance ($50+/month)
- **Droplet**: $48/month (8GB RAM, 4 vCPU, 160GB SSD)
- **Block Storage**: $10/month (100GB for media caching)
- **CDN**: $5/month (global content delivery)

## Post-Deployment

### Essential Commands
```bash
# SSH into your droplet
ssh plexwatch@YOUR_DROPLET_IP

# Check application status
pm2 status

# View logs
pm2 logs plex-watch-together

# Restart application
pm2 restart plex-watch-together

# Update application
cd /home/plexwatch/app
git pull origin main
npm ci --only=production
npm run build
pm2 reload plex-watch-together
```

### Monitoring
- **Application**: PM2 dashboard at droplet IP:3001
- **System**: `htop` for resource usage
- **Logs**: `/home/plexwatch/logs/`
- **Backups**: Automatic daily backups to `/home/plexwatch/backups/`

### Security Features Included
- ✅ Firewall configured (UFW)
- ✅ Fail2ban for SSH protection
- ✅ SSL certificates (Let's Encrypt)
- ✅ Security headers via Caddy
- ✅ Application user (non-root)
- ✅ Process isolation

### Performance Optimizations
- ✅ Gzip compression
- ✅ HTTP/2 support
- ✅ Static file caching
- ✅ Process management with PM2
- ✅ Automatic restarts on crash
- ✅ Memory limit monitoring

## Troubleshooting

### Common Issues

#### "Site can't be reached"
```bash
# Check DNS propagation
nslookup yourdomain.com

# Check firewall
sudo ufw status

# Test local connection
curl http://localhost:3001
```

#### SSL Certificate Issues
```bash
# Check Caddy logs
sudo journalctl -u caddy -f

# Force certificate renewal
sudo caddy reload
```

#### Application Not Starting
```bash
# Check PM2 status
pm2 status

# View error logs
pm2 logs plex-watch-together --lines 50

# Check environment file
cat /home/plexwatch/app/.env.production
```

#### Socket.IO Connection Problems
```bash
# Test Socket.IO endpoint
curl https://yourdomain.com/socket.io/?EIO=4\&transport=polling

# Check WebSocket headers in Caddy config
sudo cat /etc/caddy/Caddyfile
```

### Getting Help
1. **Check logs first**: `pm2 logs plex-watch-together`
2. **Test connectivity**: Use curl commands above
3. **DNS issues**: Use online DNS checker tools
4. **Server resources**: Run `htop` to check memory/CPU

## Scaling Up

### For More Users
```bash
# Enable cluster mode (use all CPU cores)
# Edit ecosystem.config.js:
instances: 'max'
exec_mode: 'cluster'

# Add Redis for session storage
sudo apt install redis-server
# Update .env.production with REDIS_URL
```

### For Better Performance
```bash
# Upgrade to larger droplet
# Add PostgreSQL database
# Enable CDN for static assets
# Add load balancer for multiple droplets
```

## Backup and Recovery

### Automatic Backups
- **Database**: Daily backup at 2 AM
- **Application**: Full app backup (excluding node_modules)
- **Retention**: 7 days of backups kept
- **Location**: `/home/plexwatch/backups/`

### Manual Backup
```bash
# Run backup script manually
/home/plexwatch/backup.sh

# Download backup to local machine
scp plexwatch@YOUR_DROPLET_IP:/home/plexwatch/backups/database_*.db ./local-backup/
```

### Disaster Recovery
```bash
# Restore from backup
cd /home/plexwatch/app
pm2 stop plex-watch-together
cp /home/plexwatch/backups/database_YYYYMMDD_HHMMSS.db ./prisma/prod.db
pm2 start plex-watch-together
```

---

## Support

For detailed setup instructions, see [DIGITAL-OCEAN-DEPLOYMENT.md](./DIGITAL-OCEAN-DEPLOYMENT.md)

**🚀 Ready to deploy?** Run the automated script and have your Plex Watch Together app live in under 20 minutes!