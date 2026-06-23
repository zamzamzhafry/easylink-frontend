// next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    esmExternals: 'loose',
    optimizePackageImports: ['lucide-react', 'recharts'],
  },
};
module.exports = nextConfig;
