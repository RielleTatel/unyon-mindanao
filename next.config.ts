import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  logging: { serverFunctions: false, incomingRequests: { ignore: [/\/api\/private-files\//] } },
};

export default nextConfig;
