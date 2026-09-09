# Puppeteer / Headless Browser Scraping

**Status:** ARCHIVED — Railway build instability
**Last evaluated:** 2026-09-09
**Owner:** Scout Reid (HUNTER-D) crawl sources

## Why archived

We tried both variants of Puppeteer for Scout's Kijiji crawler and both failed on Railway:

- **`puppeteer-core` + system chromium (via nixpacks).** Chromium was either missing at the expected path or missing runtime shared libs (`libnss3`, `libgtk-3-0`, `libasound2`, etc.). Each attempt to close the gap grew the nixpacks package list and made the container heavier without producing a green build.
- **`puppeteer` (bundles its own Chromium at install time).** Puppeteer's postinstall triggered nixpacks auto-detection which produced a malformed `ENV` line (`ENV names can not be blank`) in the generated Dockerfile. Setting `PUPPETEER_SKIP_DOWNLOAD=true` in `.npmrc` was not enough to stop nixpacks from probing the package.

The signals we were collecting from Kijiji are also fully available through its per-category **RSS feed**, which we now consume via `rss2json` from `crawlKijiji` — same lead volume, zero browser dependency.

## What we ship instead

Kijiji category RSS via rss2json:

- Feed: `https://www.kijiji.ca/rss-srp-moving-storage/city-of-calgary/c146l1700199`
- Source label: `kijiji`
- Scored per-item by `scoreSignal` (threshold 45)
- Max 15 items per run
- Implemented in `server/agents/scout.ts::crawlKijiji()`

## Path to un-archive

Revisit Puppeteer only if all of these are true:

1. LervIT is running a **dedicated scraper service** as its own Railway service (or on a different host), so a headless-browser crash blast radius doesn't touch the web/agent process.
2. There is a signal we genuinely can't get through RSS or an official API — Marketplace-style closed content that a headless browser can meaningfully reach without immediate anti-bot blocks.
3. Container size, build time, and blast radius have been weighed against the alternative of paying a scraping-as-a-service vendor (ScraperAPI, Bright Data, ZenRows).

Do not add Puppeteer to the main web/agent container. If a future contributor's PR does, block it and point them here.

## Related files removed in this decision

- `nixpacks.toml` (was pinning chromium + a dozen runtime libs)
- `.npmrc` puppeteer skip flags (`PUPPETEER_SKIP_DOWNLOAD`, etc.)
- `CHROMIUM_PATH` env var (no longer read)
- `puppeteer` and `puppeteer-core` npm dependencies
