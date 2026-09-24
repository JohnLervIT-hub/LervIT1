// Production-safe module. MUST NOT import `vite` (or anything that imports
// vite) — statically or dynamically. esbuild bundles this file into the prod
// output; any reachable `import('vite')` here will pull vite into the bundle
// and crash the container because vite lives in devDependencies (stripped by
// `npm ci --omit=dev`). Dev-only integration lives in ./vite-dev.ts and is
// dynamically imported from server/index.ts behind a NODE_ENV guard.
import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// import.meta.dirname was only added in Node 20.11. Railway's Nixpacks default
// can land on an older Node where it evaluates to undefined, and
// path.resolve(undefined, ...) throws "paths[0] must be of type string" at
// serveStatic() during boot. fileURLToPath works on every supported Node.
const moduleDir = path.dirname(fileURLToPath(import.meta.url));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

// Vite emits hashed bundles as dist/public/assets/[name]-[hash].[ext], so the
// filename changes whenever the content does and the old URL is never reused.
// Those are safe to cache forever. index.html is not: it is the document that
// names the current hashes, so a cached copy pins the browser to the previous
// deploy's chunks until it expires.
const HASHED_ASSET = /-[A-Za-z0-9_-]{8,}\.[a-z0-9]+$/i;

function isImmutableAsset(filePath: string): boolean {
  const rel = filePath.split(path.sep).join("/");
  return rel.includes("/assets/") && HASHED_ASSET.test(rel);
}

export function serveStatic(app: Express) {
  const distPath = path.resolve(moduleDir, "public");

  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(
    express.static(distPath, {
      setHeaders: (res, filePath) => {
        if (path.basename(filePath) === "index.html") {
          // Not 'no-store': the browser may keep the copy, it just has to
          // revalidate first. express.static still sends an ETag, so an
          // unchanged deploy costs a 304 rather than a full re-download.
          res.setHeader("Cache-Control", "no-cache");
        } else if (isImmutableAsset(filePath)) {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        }
      },
    }),
  );

  // Fall through to index.html if the file doesn't exist. This is the path an
  // SPA navigation actually takes, so it needs the same no-cache treatment —
  // setHeaders above only fires for files express.static itself matched.
  app.use("*", (_req, res) => {
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
