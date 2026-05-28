import { defineConfig } from "vite";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./manifest.config";

export default defineConfig({
  plugins: [crx({ manifest })],
  define: {
    __API_BASE__: JSON.stringify(
      process.env.DEAL_MATCH_API_BASE ?? "http://localhost:3000",
    ),
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
