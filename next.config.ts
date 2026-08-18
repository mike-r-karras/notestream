import type { NextConfig } from "next";

const defaultApiUrl = process.env.NODE_ENV === "production"
  ? "https://notestream-api.mike-r-karras.workers.dev"
  : "http://localhost:8787";

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? defaultApiUrl,
  },
};

export default nextConfig;

import('@opennextjs/cloudflare').then(m => m.initOpenNextCloudflareForDev());
