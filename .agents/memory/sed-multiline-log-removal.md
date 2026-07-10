---
name: sed multi-line console.log removal danger
description: Using sed to remove console.log lines leaves orphaned continuation lines when the log spans multiple lines.
---

**Rule:** Never use sed to strip multi-line console.log statements. Use manual edits (edit tool) instead.

**Why:** sed operates line-by-line. A multi-line call like:
```js
console.log('label', {
  key: value,
  key2: value2
});
```
...sed removes only the first line, leaving the object literal body and closing `});` as orphaned syntax. TypeScript then reports cascading parse errors (TS1005, TS1128) across the file.

**How to apply:** Always use the edit tool with old_string/new_string to remove complete multi-line blocks in one atomic operation.
