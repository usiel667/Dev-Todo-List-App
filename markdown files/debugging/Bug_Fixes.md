# Bug Fixes

A running log of bugs found in the Dev Todo app, their root cause, and the fix applied.

---

## Fix 1 — Color/Move dropdown not showing on ⋯ click

**Date:** 2026-05-24
**Status:** 🔧 In Progress

**Problem:** Clicking the ⋯ button on a todo item shows nothing. The dropdown is fully hidden and does not appear.

**Root Cause:** The `.todo-step` forEach in `attachTodoHandlers()` was selecting `.todo-linked-step` items (which have no `.edit-btn`, `.more-btn`, or `.delete-btn`). Calling `querySelector('.edit-btn').addEventListener(...)` on `null` threw a TypeError mid-loop, halting all subsequent handler registration — including the ⋯ handler on regular todos and the section collapse handlers.

**Fix:** Changed the selector from `.todo-step` to `.todo-step:not(.todo-linked-step)` so linked guide steps are excluded from the regular step-item handler loop.

**File:** `src/renderer.js` — `attachTodoHandlers()` — step items selector

---

## Fix 2 — Section sub-headers (In Progress, Before Production) not collapsing

**Date:** 2026-05-24
**Status:** 🔧 In Progress

**Root Cause:** Same as Fix 1 — the TypeError in the `.todo-step` forEach prevented the section collapse handler block from ever being reached in `attachTodoHandlers()`. Fixing the step selector (Fix 1) restores section collapse as well.

**File:** `src/renderer.js` — `attachTodoHandlers()` — section collapse handlers

---

## Fix 3 — Electron binary not installing (Node v26 incompatibility)

**Date:** 2026-05-12
**Status:** ✅ Resolved

**Problem:** `npm install` ran without error but `npm start` failed with `Cannot find Electron app`. The Electron postinstall script downloaded the zip but didn't extract it.

**Root Cause:** Node.js v26.1.0 is incompatible with Electron v28's postinstall script. The zip downloads to `~/.cache/electron/` but the extraction step silently fails.

**Fix:** Manually extract and write the path file:
```bash
unzip -o ~/.cache/electron/*/electron-v28.3.3-linux-x64.zip \
  -d node_modules/electron/dist/
echo "electron" > node_modules/electron/path.txt
```

---

## Fix 4 — Obsidian "vault not found" error on wiki-link click

**Date:** 2026-05-12
**Status:** ✅ Resolved

**Problem:** Clicking a `[[wiki-link]]` span opened Obsidian but showed "vault not found" error.

**Root Cause:** The `obsidian://open` URL included `vault=VAULTNAME` but the vault name didn't match the folder name Obsidian had registered.

**Fix:** Removed the `vault` parameter entirely. Obsidian uses whichever vault is currently active:
```js
// Before
const url = `obsidian://open?vault=${vaultName}&file=${encodeURIComponent(fileNoExt)}`;
// After
const url = `obsidian://open?file=${encodeURIComponent(fileNoExt)}`;
```

**File:** `main.js` — `open-obsidian-file` IPC handler

---

<!-- Template for new bugs:

## Fix N — Short description

**Date:** YYYY-MM-DD
**Status:** 🔧 In Progress | ✅ Resolved

**Problem:** What the user sees / what breaks.

**Root Cause:** Why it's happening — file, function, line number if known.

**Fix:**
```
Code change or steps to reproduce the fix
```

**File:** Which file(s) were changed

-->
