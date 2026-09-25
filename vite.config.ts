import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { execSync } from "child_process";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

// Identifier for this build, stamped into the service worker registration URL
// so every deploy lands on fresh SW cache names (see client/public/sw.js).
//
// .dockerignore excludes .git, so `git rev-parse` resolves locally but never
// inside Railway's image build. Railway's own commit SHA is used when it is
// exported to the build, and the timestamp fallback is still unique per image.
function resolveBuildHash(): string {
  const fromEnv =
    process.env.VITE_BUILD_HASH ||
    process.env.RAILWAY_GIT_COMMIT_SHA ||
    process.env.SOURCE_COMMIT;
  if (fromEnv) return fromEnv.trim().slice(0, 12);
  try {
    return execSync("git rev-parse --short HEAD", {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    return `t${Date.now().toString(36)}`;
  }
}

const BUILD_HASH = resolveBuildHash();

// index.html registers the service worker at /sw.js?v=__BUILD_HASH__; the
// worker reads that value off its own location. transformIndexHtml is used
// rather than %VITE_BUILD_HASH% so a missing value fails the build loudly
// instead of silently freezing the cache id at a literal string.
function stampBuildHash(): import("vite").Plugin {
  return {
    name: "stamp-build-hash",
    transformIndexHtml(html) {
      if (!html.includes("__BUILD_HASH__")) return html;
      return html.split("__BUILD_HASH__").join(BUILD_HASH);
    },
  };
}

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
  define: {
    "import.meta.env.VITE_BUILD_HASH": JSON.stringify(BUILD_HASH),
  },
  plugins: [
    stampBuildHash(),
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
