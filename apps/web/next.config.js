/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Turbo for development
    turbo: {},
  },
  env: {
    CUSTOM_KEY: process.env.CUSTOM_KEY,
  },
  poweredByHeader: false,
  reactStrictMode: true,
}

module.exports = nextConfig
