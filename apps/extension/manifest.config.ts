import { defineManifest } from "@crxjs/vite-plugin";

export default defineManifest({
  manifest_version: 3,
  name: "Deal Match — Is this a good deal?",
  version: "0.0.1",
  description:
    "On any product page, see price history, cross-retailer comparisons, and whether to buy now or wait.",
  action: {
    default_popup: "src/popup/index.html",
    default_title: "Deal Match",
  },
  background: {
    service_worker: "src/background/index.ts",
    type: "module",
  },
  content_scripts: [
    {
      matches: ["<all_urls>"],
      js: ["src/content/index.ts"],
      run_at: "document_idle",
    },
  ],
  permissions: ["storage", "activeTab"],
  host_permissions: ["<all_urls>"],
});
