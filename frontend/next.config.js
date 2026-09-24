/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  async rewrites() {
    const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    return [
      {
        source: '/api/:path*',
        destination: `${backendUrl}/api/:path*`,
      },
      {
        source: '/uploads/:path*',
        destination: `${backendUrl}/uploads/:path*`,
      },
      // Proxy Socket.IO handshake + upgrade to the backend gateway.
      {
        source: '/socket.io/:path*',
        destination: `${backendUrl}/socket.io/:path*`,
      },
      // Next 会把 /socket.io/?EIO=... 308 重定向成去掉末尾斜杠的
      // /socket.io?EIO=...，上面那条就匹配不到了（404）。反向代理没把
      // /socket.io/ 直接转给后端时，实时推送全靠这条兜底（只能走 HTTP
      // 长轮询，WebSocket 升级要在 nginx 层转发）。
      {
        source: '/socket.io',
        destination: `${backendUrl}/socket.io/`,
      },
      {
        source: '/ws/:path*',
        destination: `${backendUrl}/ws/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
