import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

// Strip Next.js "use client" directives — they're no-ops in Vite but confuse
// React Fast Refresh, causing full module reloads instead of hot swaps and
// leaving ReactCurrentDispatcher.current null mid-update (useContext crashes).
function stripUseClient(): import("vite").Plugin {
  return {
    name: "strip-use-client",
    transform(code, id) {
      if (!id.includes("node_modules") && /^["']use client["']\s*;?\s*\n/m.test(code)) {
        return { code: code.replace(/^["']use client["']\s*;?\s*\n/m, ""), map: null };
      }
    },
  };
}

export default defineConfig({
  plugins: [
    stripUseClient(),
    react(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer(),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
