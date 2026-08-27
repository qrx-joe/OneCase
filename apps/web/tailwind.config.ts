import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // OneCase Semantic Tokens (v1.0)
        'oc-blue': '#007AFF',
        'oc-blue-hover': '#0064D6',
        'oc-blue-soft': 'rgba(0,122,255,0.10)',
        'oc-green': '#34C759',
        'oc-green-soft': 'rgba(52,199,89,0.11)',
        'oc-orange': '#FF9500',
        'oc-orange-soft': 'rgba(255,149,0,0.11)',
        'oc-red': '#FF3B30',
        'oc-red-soft': 'rgba(255,59,48,0.10)',
        'oc-purple': '#5856D6',
        'oc-purple-soft': 'rgba(88,86,214,0.10)',
      },
    },
  },
  plugins: [],
}
export default config
