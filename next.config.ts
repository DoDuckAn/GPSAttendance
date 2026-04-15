import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Allow MongoDB connection in server components
  serverExternalPackages: ['mongoose'],
};

export default nextConfig;
