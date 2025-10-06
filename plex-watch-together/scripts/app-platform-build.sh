#!/bin/bash

# App Platform Build Script
# This script handles the build process for Digital Ocean App Platform

set -e

echo "🚀 Starting Plex Watch Together build for App Platform..."

# Set build-time DATABASE_URL if not already set
if [ -z "$DATABASE_URL" ]; then
    export DATABASE_URL="file:./build-temp.db"
    echo "📦 Using temporary build database: $DATABASE_URL"
fi

# Install dependencies
echo "📦 Installing dependencies..."
if [ "$NODE_ENV" = "production" ]; then
    npm ci --only=production
else
    npm ci
fi

# Generate Prisma client
echo "🔧 Generating Prisma client..."
npx prisma generate

# Create a minimal database for build (if using file database)
if [[ "$DATABASE_URL" == file:* ]]; then
    echo "🗄️  Creating build database..."
    npx prisma db push --force-reset || echo "Warning: Could not create build database, continuing..."
fi

# Build the application
echo "🏗️  Building Next.js application..."
npm run build

# Clean up build database
if [[ "$DATABASE_URL" == file:* ]] && [ -f "./build-temp.db" ]; then
    rm -f ./build-temp.db
    echo "🧹 Cleaned up build database"
fi

echo "✅ Build completed successfully!"