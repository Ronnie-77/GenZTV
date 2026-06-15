import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  allowedDevOrigins: ['0.0.0.0', 'localhost'],
  experimental: {
    serverActions: {
      bodySizeLimit: '200mb',
    },
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
