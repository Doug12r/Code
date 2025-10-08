# DNS and SSL Configuration Guide

## Current Situation Analysis

Your `plexwatch.duckdns.org` domain is pointing to **Cloudflare IPs**:
- 162.159.140.98
- 172.66.0.96

The SSL error `SSL_ERROR_NO_CYPHER_OVERLAP` means there's a mismatch between what your browser expects and what the server provides.

## Solution Options

### Option 1: Use App Platform (Recommended) ✅

**Pros:**
- Automatic SSL certificates
- No server management
- Auto-scaling
- Built-in CDN
- Professional grade infrastructure

**Steps:**
1. **Get your App Platform URL:**
   ```bash
   # If you have doctl installed:
   doctl apps list
   # Look for your app URL (something like: https://plex-watch-together-xxxx.ondigitalocean.app)
   ```

2. **Update DuckDNS to point to App Platform:**
   - Go to https://www.duckdns.org
   - Login to your account
   - Find `plexwatch` domain
   - **Remove Cloudflare proxy** (if enabled)
   - Set it to **CNAME** pointing to your App Platform domain
   - Or set **A record** to App Platform IP

3. **Wait for DNS propagation** (5-30 minutes)

4. **App Platform will automatically provision SSL certificate**

### Option 2: Fix Home Server with Cloudflare

**If you prefer to use your home server:**

1. **Configure Cloudflare properly:**
   - Go to Cloudflare dashboard
   - Set SSL/TLS mode to **"Full"** or **"Full (strict)"**
   - Enable **"Always Use HTTPS"**

2. **Fix your home server SSL:**
   - Your Caddy server needs proper SSL configuration
   - Make sure it's running and accessible on port 443

3. **Update Cloudflare origin server:**
   - Point to your actual home IP (not the current misconfigured one)

## Immediate Fix: Test App Platform Directly

Let's first test if your App Platform deployment is working:

```bash
# Test the direct App Platform URL (without custom domain)
curl -I https://plex-watch-together-[your-app-id].ondigitalocean.app
```

If this works, then the issue is just DNS configuration.

## Quick Fix Commands

### For App Platform Route:
```bash
# 1. Check app status
./deploy-app-platform.sh

# 2. Get the direct URL and test it
# 3. Update DuckDNS to point to that URL
```

### For Home Server Route:
```bash
# 1. Check if your home server is actually running
sudo systemctl status caddy

# 2. Test local SSL
curl -I https://localhost

# 3. Fix Cloudflare configuration
```

## Recommendation

**Use App Platform** - it's much simpler and more reliable. Your home server setup was working before, but managing SSL certificates, server updates, and infrastructure is complex.

Would you like me to help you:
1. **Get your App Platform URL and configure DuckDNS to point there?**
2. **Or troubleshoot your home server SSL configuration?**