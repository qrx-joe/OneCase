/** @type {import('next').NextConfig} */
const nextConfig = {
  ...(process.env.ONECASE_E2E === 'true' ? {
    distDir: '.next-e2e',
    typescript: { tsconfigPath: '.tsconfig.e2e.json' },
  } : {}),
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
