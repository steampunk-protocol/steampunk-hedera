/** @type {import('next').NextConfig} */
const nextConfig = {
  // Proxy arena API calls through Next.js to avoid mixed content (HTTPS → HTTP)
  async rewrites() {
    const arenaUrl = process.env.ARENA_BACKEND_URL || 'http://77.237.243.126:8001'
    return [
      {
        source: '/api/arena/:path*',
        destination: `${arenaUrl}/:path*`,
      },
    ]
  },
}
module.exports = nextConfig
