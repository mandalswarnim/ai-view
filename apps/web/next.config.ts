import type { NextConfig } from "next";

const config: NextConfig = {
  // Workspace packages ship TypeScript source rather than a build.
  transpilePackages: ["@aiview/shared", "@aiview/adapters"],
  serverExternalPackages: ["sharp"],
};

export default config;
