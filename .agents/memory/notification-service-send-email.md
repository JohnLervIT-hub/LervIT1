---
name: notificationService.sendEmail correct usage
description: The email sending method is on the notificationService singleton, not a bare named export.
---

**Rule:** Always use `notificationService.sendEmail({ to, subject, body, type })` — never `import('./notifications.js').sendEmail`.

**Why:** `notifications.ts` exports a `notificationService` class instance (imported as `import { notificationService } from "./notifications"` at the top of routes.ts). There is no standalone `sendEmail` named export. Dynamic import for it will fail at runtime with "sendEmail is not a function."

**How to apply:** The `notificationService` is already imported at the top of `server/routes.ts`. Just call it directly. The method signature is `sendEmail({ to: string, subject: string, body: string, type: string })`.
