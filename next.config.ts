import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  allowedDevOrigins: ['0.0.0.0', 'localhost', '127.0.0.1'],
  // Next.js 16+ default request body limit is 10MB. Our /api/data/import
  // route accepts backup files up to 100MB, so raise the limit here.
  // Without this, large imports get silently truncated to 10MB → JSON
  // parse fails → 400 "Invalid JSON" error.
  experimental: {
    serverActions: {
      bodySizeLimit: '200mb',
    },
    proxyClientMaxBodySize: '100mb',
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
  async redirects() {
    return [
      {
        source: '/admin',
        destination: '/#/admin',
        permanent: false,
      },
    ]
  },
};

export default nextConfig;
