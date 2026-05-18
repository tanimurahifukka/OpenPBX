/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // better-sqlite3 などのネイティブモジュールはサーバ側で require する
  serverExternalPackages: ['better-sqlite3'],
};

export default nextConfig;
