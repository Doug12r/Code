# 🦆 DuckDNS Setup Guide for Plex Watch Together

Complete guide for setting up Plex Watch Together with your `plexwatch.duckdns.org` domain.

## 🚀 Quick Setup

### Step 1: Configure DuckDNS
1. **Go to [DuckDNS.org](https://www.duckdns.org)**
2. **Sign in** with your preferred method
3. **Verify your domain** `plexwatch.duckdns.org` is created
4. **Update the IP** to point to your home's public IP
5. **Get your DuckDNS token** (you'll need this for auto-updates)

### Step 2: Auto-Update DuckDNS IP (Recommended)
Create a cron job to keep your IP updated:

```bash
# Create update script
cat > update-duckdns.sh << 'EOF'
#!/bin/bash
# Replace YOUR_TOKEN with your actual DuckDNS token
echo url="https://www.duckdns.org/update?domains=plexwatch&token=YOUR_TOKEN&ip=" | curl -k -o ~/duckdns.log -K -
EOF

chmod +x update-duckdns.sh

# Add to crontab (updates every 5 minutes)
crontab -e
# Add this line:
# */5 * * * * /home/yourusername/Code/plex-watch-together/update-duckdns.sh >/dev/null 2>&1
```

### Step 3: Setup Your Application
```bash
# Run the automated setup
./setup-home-server.sh plexwatch.duckdns.org 3001 443 true

# Or manual setup:
npm run build
npm start &

# Install and configure Caddy
sudo apt install caddy
sudo cp Caddyfile /etc/caddy/Caddyfile
sudo systemctl enable --now caddy
```

## 🔧 Network Configuration

### Router Port Forwarding
Forward these ports to your home server's local IP:

| Port | Protocol | Destination | Purpose |
|------|----------|-------------|---------|
| 80   | TCP      | Your PC IP | HTTP → HTTPS redirect |
| 443  | TCP      | Your PC IP | HTTPS traffic |

**Example:** If your PC is `192.168.1.100`, forward:
- `80` → `192.168.1.100:80`
- `443` → `192.168.1.100:443`

### Firewall Configuration
```bash
# Ubuntu/Debian firewall setup
sudo ufw enable
sudo ufw allow ssh
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 3001/tcp  # Direct app access (optional)
sudo ufw status
```

## 🎯 Testing Your Setup

### 1. Test DuckDNS Resolution
```bash
# Check if your domain resolves to your IP
nslookup plexwatch.duckdns.org
dig plexwatch.duckdns.org

# Should return your public IP address
```

### 2. Test Local Application
```bash
# Test app directly
curl http://localhost:3001/api/ping

# Should return: {"status":"ok","timestamp":"..."}
```

### 3. Test Caddy Proxy
```bash
# Test HTTP (should redirect to HTTPS)
curl -I http://plexwatch.duckdns.org

# Should return: HTTP/1.1 301 Moved Permanently
# Location: https://plexwatch.duckdns.org/
```

### 4. Test HTTPS Access
```bash
# Test HTTPS
curl https://plexwatch.duckdns.org/api/ping

# Should return: {"status":"ok","timestamp":"..."}
```

## 🌍 External Access

### Share with Friends
Your friends can access your Plex Watch Together at:
**https://plexwatch.duckdns.org**

### Mobile Access
The app works perfectly on mobile devices. Your friends can:
- **Browse to:** `https://plexwatch.duckdns.org`
- **Add to home screen** for app-like experience
- **Join rooms** with invite codes
- **Chat and watch** synchronized videos

## 🛠️ Troubleshooting

### Common Issues

#### "Site can't be reached"
```bash
# Check DuckDNS IP
curl "https://www.duckdns.org/update?domains=plexwatch&token=YOUR_TOKEN&ip="

# Check port forwarding
sudo netstat -tlnp | grep :80
sudo netstat -tlnp | grep :443

# Check if domain resolves correctly
nslookup plexwatch.duckdns.org
```

#### "Certificate errors"
```bash
# Check Caddy logs
sudo journalctl -u caddy -f

# Restart Caddy to retry certificate
sudo systemctl restart caddy

# Check certificate status
curl -vI https://plexwatch.duckdns.org 2>&1 | grep -i cert
```

#### "Connection refused"
```bash
# Check if app is running
ps aux | grep "node server.js"

# Check if Caddy is running
sudo systemctl status caddy

# Check firewall
sudo ufw status
```

### Debug Commands
```bash
# Check all services
echo "=== App Status ==="
curl -s http://localhost:3001/api/ping || echo "App not responding"

echo "=== Caddy Status ==="
sudo systemctl status caddy --no-pager

echo "=== Port Status ==="
sudo netstat -tlnp | grep -E ":(80|443|3001)"

echo "=== DNS Resolution ==="
nslookup plexwatch.duckdns.org

echo "=== Certificate Test ==="
echo | openssl s_client -connect plexwatch.duckdns.org:443 2>/dev/null | openssl x509 -noout -dates
```

## 🔒 Security Features

### Automatic HTTPS
- ✅ **Let's Encrypt certificates** - Free and automatic
- ✅ **Auto-renewal** - Never expires
- ✅ **Perfect Forward Secrecy** - Enhanced security
- ✅ **HTTP/2 support** - Faster loading

### Security Headers
Already configured in Caddyfile:
- `Strict-Transport-Security` - Force HTTPS
- `X-Content-Type-Options` - Prevent MIME attacks
- `X-Frame-Options` - Prevent clickjacking
- `X-XSS-Protection` - XSS protection
- `Referrer-Policy` - Control referrer information

## 📊 Monitoring

### View Access Logs
```bash
# Caddy access logs
tail -f /var/log/caddy/access.log

# Application logs
tail -f logs/app.log
```

### Monitor Performance
```bash
# System resources
htop

# Network connections
sudo ss -tulpn | grep -E ":(80|443|3001)"

# Certificate expiry
echo | openssl s_client -connect plexwatch.duckdns.org:443 2>/dev/null | openssl x509 -noout -dates
```

## 🎉 Success Checklist

- ✅ DuckDNS domain `plexwatch.duckdns.org` points to your public IP
- ✅ Router forwards ports 80 and 443 to your PC
- ✅ Application runs on `http://localhost:3001`
- ✅ Caddy proxy running with automatic HTTPS
- ✅ External access works: `https://plexwatch.duckdns.org`
- ✅ Let's Encrypt certificate valid and auto-renewing
- ✅ Friends can access and create/join rooms

## 🚀 Your URLs

- **Public Access:** https://plexwatch.duckdns.org
- **Direct Access:** http://localhost:3001
- **Admin/Debug:** https://plexwatch.duckdns.org/api/monitoring

**You're all set! Your Plex Watch Together is now accessible worldwide! 🌍🎬🍿**