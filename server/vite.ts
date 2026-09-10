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

export function serveStatic(app: Express) {
  const distPath = path.resolve(moduleDir, "public");

  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
