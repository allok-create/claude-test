import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // better-sqlite3 為原生模組，不納入打包
  serverExternalPackages: ["better-sqlite3"],
  poweredByHeader: false,
};

export default nextConfig;
