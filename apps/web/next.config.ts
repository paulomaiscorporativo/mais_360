import type { NextConfig } from "next";
import { loadMonorepoEnv } from "./src/server/load-env";

// O .env fica na raiz do monorepo (compartilhado com Prisma e worker).
loadMonorepoEnv();

const nextConfig: NextConfig = {
  // Pacotes do monorepo são TypeScript puro: o Next transpila.
  transpilePackages: ["@mais/core", "@mais/db"],
  serverExternalPackages: ["@prisma/client", "bcryptjs"],
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
