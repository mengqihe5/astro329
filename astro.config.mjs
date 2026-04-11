import { defineConfig } from "astro/config";
import netlify from "@astrojs/netlify";

import cloudflare from "@astrojs/cloudflare";

export default defineConfig({
  output: "server",
  adapter: cloudflare(),
  server: {
    host: true,
  },
});