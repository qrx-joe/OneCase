/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Turbopack for development
    turbo: {},
  },
  env: {
    CUSTOM_KEY: process.env.CUSTOM_KEY,
  },
  // Disable x-powered-by header
  poweredByHeader: false,
  // React strict mode
  reactStrictMode: true,
}

module.exports = nextConfig
