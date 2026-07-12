import type { NextConfig } from "next";
import { assertValidEnvironment } from "./lib/server/environment";
import { getStaticBrowserSecurityHeaders } from "./lib/server/browser-security";

assertValidEnvironment(process.env);

const nextConfig: NextConfig = {
  allowedDevOrigins: ["localhost", "127.0.0.1"],
  devIndicators: false,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: getStaticBrowserSecurityHeaders(),
      },
    ];
  },
};

export default nextConfig;
