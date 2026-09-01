---
name: GoogleMapsContext loadError guard ordering
description: loadError check must come before the isLoaded spinner guard or it is permanently unreachable.
---

**Rule:** In any component using GoogleMapsContext, always check `loadError` BEFORE `!isLoaded`.

**Why:** When Maps fails to load (missing API key, network error), `isLoaded` stays `false` and `loadError` is set. If the component guards `if (!isLoaded) return <spinner>` first, it will always bail out before reaching the `loadError` check — silently looping as a spinner forever instead of showing the error.

**How to apply:**
```tsx
if (loadError) return <ErrorUI />;          // first
if (!isLoaded || isLoading || !data) return <Spinner />;  // second
```
