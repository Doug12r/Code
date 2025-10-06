import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // External packages for server components
  serverExternalPackages: ['@prisma/client'],
  
  // Environment variable validation
  env: {
    SKIP_ENV_VALIDATION: process.env.SKIP_ENV_VALIDATION || 'false'
  },
  
  // Output configuration for App Platform
  output: 'standalone',
  
  // Disable static optimization for API routes that use database
  trailingSlash: false,
  
  // Image optimization
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
      {
        protocol: 'http',
        hostname: 'localhost',
      }
    ],
  },
  
  // Webpack configuration
  webpack: (config, { isServer, dev }) => {
    // Prisma client optimization
    if (isServer && !dev) {
      config.externals = [...(config.externals || []), '@prisma/client'];
    }
    
    return config;
  },
  
  // Headers for security
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          {
            key: 'Access-Control-Allow-Origin',
            value: process.env.NEXTAUTH_URL || '*'
          },
          {
            key: 'Access-Control-Allow-Methods',
            value: 'GET, POST, PUT, DELETE, OPTIONS'
          },
          {
            key: 'Access-Control-Allow-Headers',
            value: 'Content-Type, Authorization'
          }
        ]
      }
    ];
  }
};

export default nextConfig;
