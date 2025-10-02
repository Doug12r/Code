# Plex Service Plugin Testing Guide

This guide explains how to test the Plex Service Plugin to verify its caching, deduplication, and performance improvements.

## 🚀 Quick Start

### 1. Make sure your development server is running:
```bash
npm run dev
```

### 2. Choose your testing method:

## 🖥️ Browser Testing (Recommended)

Visit the interactive test page:
```
http://localhost:3004/test/plex-service
```

This provides a user-friendly interface to:
- ✅ Test cache performance (see dramatic speed improvements)
- ✅ Test request deduplication (5 concurrent requests → 1 API call)
- ✅ View real-time performance metrics
- ✅ Clear caches and reset state

## 💻 Command Line Testing

Run the interactive terminal script:
```bash
node manual-test.js
```

Features:
- 🎯 Interactive menu-driven testing
- 📊 Performance comparisons with timing
- 🎨 Colored output for easy reading
- 📈 Real-time metrics display

## 🧪 API Testing

### Test specific endpoints directly:

#### 1. Cache Performance Test
```bash
# First call (cache miss - slower)
curl "http://localhost:3004/api/plex/libraries"

# Second call (cache hit - much faster)
curl "http://localhost:3004/api/plex/libraries"
```

#### 2. Performance Metrics
```bash
curl "http://localhost:3004/api/plex/v2/performance"
```

#### 3. Clear Cache
```bash
curl -X POST "http://localhost:3004/api/plex/v2/performance" \
  -H "Content-Type: application/json" \
  -d '{"action":"clear-cache"}'
```

#### 4. Automated Test Suite
```bash
curl "http://localhost:3004/api/test/plex-service"
```

## 📊 What to Expect

### Cache Performance Improvements
- **First call (cache miss):** ~100-500ms (actual Plex API call)
- **Subsequent calls (cache hit):** ~1-10ms (served from memory)
- **Performance improvement:** 10-50x faster with caching

### Request Deduplication
- **5 concurrent identical requests:** Only 1 actual API call made
- **Response time:** Similar to single request (not 5x slower)
- **Efficiency:** 80% reduction in redundant API calls

### Performance Metrics
- **Cache hit rate:** Should increase to 70%+ with usage
- **Average response time:** Should decrease significantly
- **Error rate:** Should remain low with automatic retry logic
- **Recommendations:** Plugin provides optimization suggestions

## 🔍 Testing Scenarios

### Scenario 1: Fresh Start (Cache Miss Testing)
1. Clear cache: `POST /api/plex/v2/performance` with `{"action":"clear-cache"}`
2. Make first request: `GET /api/plex/libraries` (should be slow)
3. Make second request: `GET /api/plex/libraries` (should be fast)

### Scenario 2: Concurrent Load Testing
1. Open multiple browser tabs
2. Simultaneously click "Plex Libraries" in each tab
3. Only 1 API call should be made (check browser network tab)

### Scenario 3: Different Endpoints
1. Test libraries: `GET /api/plex/libraries`
2. Test media: `GET /api/plex/libraries/1/media`
3. Test search: `GET /api/plex/search?query=test`
4. Each should have independent caching

### Scenario 4: Cache Expiration
1. Make request: `GET /api/plex/libraries`
2. Wait 5+ minutes (cache TTL)
3. Make same request again (should hit API again)

## 🐛 Troubleshooting

### "Server not accessible" error
- Make sure dev server is running: `npm run dev`
- Check port 3004 is available
- Verify no firewall blocking localhost

### "Plex connection failed" errors
- Check your Plex server is running and accessible
- Verify Plex credentials in the setup modal
- Use the diagnostics page to test connectivity

### Cache not working
- Check browser console for errors
- Verify plugin is imported correctly
- Clear cache and try again

### No performance improvement
- Make sure you're testing identical requests
- Check that cache TTL hasn't expired
- Verify plugin is being used (not direct PlexAPI)

## 📈 Performance Comparison

### Before Plugin (Direct PlexAPI)
```typescript
// Every request hits the API
const libraries = await plexApi.getLibraries()  // ~200ms
const libraries2 = await plexApi.getLibraries() // ~200ms
const libraries3 = await plexApi.getLibraries() // ~200ms
// Total: ~600ms, 3 API calls
```

### After Plugin (Cached & Deduplicated)
```typescript
// First request hits API, rest served from cache
const libraries = await plexService.getLibraries()  // ~200ms
const libraries2 = await plexService.getLibraries() // ~5ms
const libraries3 = await plexService.getLibraries() // ~5ms
// Total: ~210ms, 1 API call
```

## 🎯 Success Metrics

Your plugin is working correctly when you see:

✅ **Cache Hit Rate > 70%** (after some usage)  
✅ **Response Time < 10ms** (for cached requests)  
✅ **Request Deduplication** (concurrent requests → 1 API call)  
✅ **Error Handling** (graceful failures with retry)  
✅ **Performance Monitoring** (real-time metrics)  

## 🔧 Advanced Testing

### Load Testing
```bash
# Install Apache Bench
sudo apt-get install apache2-utils

# Test 100 concurrent requests
ab -n 100 -c 10 http://localhost:3004/api/plex/libraries
```

### Network Simulation
```bash
# Simulate slow network (Linux)
sudo tc qdisc add dev lo root netem delay 100ms

# Test with delay
curl "http://localhost:3004/api/plex/libraries"

# Remove delay
sudo tc qdisc del dev lo root
```

### Memory Usage
```bash
# Monitor Node.js memory usage
node --inspect manual-test.js
# Open Chrome DevTools → Memory tab
```

## 📚 Related Documentation

- [Plugin Architecture](../src/lib/plex-service.ts) - Core implementation
- [Performance API](../src/app/api/plex/v2/performance/route.ts) - Metrics endpoint
- [Metrics Dashboard](../src/components/plex-service-metrics.tsx) - UI component
- [Test Suite](../src/lib/plex-service.test.ts) - Automated tests

---

Need help? The plugin includes comprehensive error messages and performance recommendations to guide optimization!