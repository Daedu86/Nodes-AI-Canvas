import type { NextConfig } from "next";
import { assertValidEnvironment } from "./lib/server/environment";

assertValidEnvironment(process.env);

const nextConfig: NextConfig = {
  allowedDevOrigins: ["localhost", "127.0.0.1"],
  devIndicators: false,
};

export default nextConfig;
