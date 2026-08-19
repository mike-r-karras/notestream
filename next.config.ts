import type { NextConfig } from "next";

const defaultApiUrl = process.env.NODE_ENV === "production"
  ? "https://notestream-api.mike-r-karras.workers.dev"
  : "http://localhost:8787";
const defaultConversionApiUrl = process.env.NODE_ENV === "production"
  ? "https://audiveris-api-hjll6wnp3a-uc.a.run.app"
  : "http://localhost:8080";

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? defaultApiUrl,
    NEXT_PUBLIC_CONVERSION_API_URL:
      process.env.NEXT_PUBLIC_CONVERSION_API_URL ?? defaultConversionApiUrl,
  },
};

export default nextConfig;

import('@opennextjs/cloudflare').then(m => m.initOpenNextCloudflareForDev());
