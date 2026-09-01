---
name: Voice recording storage
description: Durable storage and delivery rule for Telnyx call recordings and voicemail.
---

Telnyx recording webhook URLs must be treated as temporary transport URLs, not durable media storage. Archive recording bytes in private object storage and retain only a private object reference for long-term playback.

**Why:** Provider recording URLs can expire and cross-origin redirects can break authenticated browser playback. Recordings also contain sensitive customer conversations.

**How to apply:** On recording events, copy the audio into private storage promptly. Serve it only through an authenticated, permission-checked, same-origin endpoint; never expose stored provider URLs in API responses.