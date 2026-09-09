# Facebook Marketplace Integration

**Status:** ARCHIVED — revisit with Facebook Business API access
**Last evaluated:** 2026-09-09
**Owner:** Scout Reid (HUNTER-D) crawl sources

## Why archived

Facebook Marketplace has no public API surface for crawling listings, and every unauthenticated approach we could deploy from Railway hits the same wall:

- **Direct HTML fetch** — Marketplace pages render client-side; the initial HTML is a login/JS bootstrap shell with no listing content.
- **Public listings scrape via headless browser** — Facebook fingerprints the session (canvas, WebGL, TLS JA3, mouse patterns) and either serves a checkpoint challenge or returns a stripped shell within a few requests.
- **Feed aggregators / third-party mirrors** — none of the ones we evaluated reliably surface Calgary marketplace listings; TOS-hostile besides.

Beyond the mechanics, sustained scraping is a clear ToS violation and creates account-suspension + platform-block risk for LervIT.

## What we ship instead

Craigslist Calgary housing RSS via `rss2json`:

- Feed: `https://calgary.craigslist.org/search/hhh?format=rss`
- Source label: `craigslist`
- Static intent score: 45
- Max 10 items per run
- Implemented in `server/agents/scout.ts::crawlCraigslist()`

Housing listings signal "this person will need a mover soon" for both sides of the transaction — same latent-demand signal we were hoping to pull from Marketplace moving-sale posts.

## Path to un-archive

Revisit if / when one of these becomes true:

1. LervIT gets **Facebook Business API** access with a legitimate use case that returns listing metadata.
2. Facebook publishes a **public Marketplace search API** (has been rumoured — nothing shipped as of the archive date).
3. We partner with a data broker who is licensed to redistribute Marketplace listings.

Do not re-implement scraping. If a future contributor pushes a PR that brings scraping back, block it and point them here.
