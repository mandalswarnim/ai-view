import { existsSync } from "node:fs";
import { defineConfig } from "wxt";

// Vite exposes WXT_* variables to extension code, but this config file runs
// in plain Node, so read the same files here for the manifest.
for (const file of [".env.local", ".env"]) {
  if (existsSync(file)) process.loadEnvFile(file);
}

const apiOrigin = new URL(process.env.WXT_API_BASE_URL || "http://localhost:3000").origin;

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "AI View: property photo check",
    description:
      "Shows when photos on Rightmove listings show signs of AI editing, and whether the listing says so.",
    // "storage" holds the anonymous install ID and the panel's open/closed state.
    permissions: ["storage"],
    // The only origin the extension talks to besides the portal page it runs
    // on. Portal access comes from the content script's match patterns.
    host_permissions: [`${apiOrigin}/*`],
  },
});
