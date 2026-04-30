import type { NextConfig } from 'next';

const isDev = process.env.NODE_ENV === 'development';

const nextConfig: NextConfig = {
  output: 'export', // next build → /out — Go Echo раздаёт статику
  trailingSlash: true, // совместимость с file-based routing на статике
  images: {
    unoptimized: true, // next/image без Node.js runtime
  },
  allowedDevOrigins: ['172.17.243.117'],
  // В dev-режиме проксируем /api/* на Go (порт 3000)
  // В проде rewrites не применяются (output: export), Go сам обрабатывает /api/*
  ...(isDev && {
    async rewrites() {
      return [
        {
          source: '/api/:path*',
          destination: 'http://localhost:3000/api/:path*',
        },
      ];
    },
  }),
};

export default nextConfig;
