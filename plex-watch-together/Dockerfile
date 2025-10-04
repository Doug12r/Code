# Multi-stage Docker build for optimized production image

# Base image with system dependencies
FROM node:18-alpine AS base
RUN apk add --no-cache \
    libc6-compat \
    curl \
    ca-certificates \
    ffmpeg \
    dumb-init \
    tini \
    && rm -rf /var/cache/apk/*

# Set security-focused environment variables
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV NPM_CONFIG_UPDATE_NOTIFIER=false
ENV NPM_CONFIG_FUND=false
ENV NPM_CONFIG_AUDIT=false

# Dependencies stage - install all dependencies including dev
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --include=dev && npm cache clean --force

# Build stage - compile the application
FROM base AS builder
WORKDIR /app

# Copy dependencies and source
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Build Next.js application
RUN npm run build

# Production stage - minimal runtime image
FROM base AS runner
WORKDIR /app

# Set production environment variables
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV NODE_OPTIONS="--max-old-space-size=2048"

# Create system user for security (non-root execution)
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs --ingroup nodejs

# Create necessary directories with proper permissions
RUN mkdir -p /app/.next/cache && \
    mkdir -p /app/logs && \
    chown -R nextjs:nodejs /app

# Install production dependencies only
COPY package.json package-lock.json ./
RUN npm ci --only=production && \
    npm cache clean --force && \
    rm -rf ~/.npm

# Copy built application and necessary files
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma

# Copy Prisma client
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma

# Set correct permissions
RUN chmod -R 755 /app

# Switch to non-root user
USER nextjs

EXPOSE 3000

# Enhanced health check with comprehensive monitoring
HEALTHCHECK --interval=15s --timeout=5s --start-period=60s --retries=5 \
  CMD curl -f http://localhost:3000/api/health || exit 1

# Security: Drop all capabilities and add only necessary ones
RUN apk add --no-cache shadow && \
    usermod -u 1001 nextjs && \
    groupmod -g 1001 nodejs

# Use tini for proper signal handling and zombie reaping
ENTRYPOINT ["tini", "--"]
CMD ["node", "server.js"]

# Add labels for better container management
LABEL \
  org.opencontainers.image.title="Plex Watch Together" \
  org.opencontainers.image.description="Synchronized video watching application" \
  org.opencontainers.image.vendor="Plex Watch Together Team" \
  org.opencontainers.image.source="https://github.com/your-username/plex-watch-together" \
  maintainer="team@plexwatchtogether.com"