# App Audit

Code reviews and security/correctness audits of the Dev Todo app.

---

## Audit 1 — Full Security & Correctness Review

**Date:** 2026-05-24
**Scope:** All files — `main.js`, `preload.js`, `src/index.html`, `src/renderer.js`, `src/styles.css`
**Status:** ✅ Complete — all findings resolved

### Findings & Fixes

| # | Severity | File | Issue | Status |
|---|----------|------|-------|--------|
| 1 | Medium | `main.js:91` | `create-file` handler used `path.join(folderPath, fileName)` with no sanitization — a fileName like `../../.bashrc` could escape the vault folder | ✅ Fixed: `path.basename()` strips all directory components before join |
| 2 | Medium | `renderer.js` | `moveTodoToSection` never called `shiftColorKeys` — colors went stale after a move-to-section operation | ✅ Fixed: added per-direction color key remapping inline in `moveTodoToSection` |
| 3 | Low | `renderer.js:startEditTodo` | `item.querySelector('.todo-text')` not null-checked — double-clicking edit while already editing could crash | ✅ Fixed: added `if (!textEl) return` guard |
| 4 | Low | `renderer.js:attachTodoHandlers` | `header.nextElementSibling` and `header.querySelector('.group-arrow')` used without null checks in file group collapse handler | ✅ Fixed: added `if (!todosEl \|\| !arrow) return` guard |
| 5 | Low | `renderer.js:save` | `refreshVault()` on window focus could race with an in-progress async save, overwriting in-memory file content before the write completed | ✅ Fixed: added `isSaving` flag; focus refresh skipped while a save is in progress |

### Items Reviewed & Cleared

| Area | Finding | Verdict |
|------|---------|---------|
| `write-file` IPC handler | No path validation | Acceptable — renderer only passes paths that came from `readVault`, which the user selected via OS dialog |
| All `innerHTML` uses | User content injected into DOM | Safe — all user-provided strings pass through `escHtml()` before insertion |
| `shell.openExternal` | Opens Obsidian URI with user-controlled file name | Safe — `encodeURIComponent` applied; `obsidian://` is a local custom protocol |
| `read-vault` symlink traversal | Could follow symlinks outside vault | Acceptable — user chose the vault folder themselves |
| `escHtml()` coverage | Escapes `&`, `<`, `>`, `"` but not `'` | Safe — all attributes use double-quote delimiters |
| `todoColors` SET vs GET key encoding | `dataset.id` (auto-unescaped) vs `node.id` (raw) | Consistent — both are unescaped strings |
| Linked step items (`todo-linked-step`) | No ⋯ button exposed | Safe — cannot be colored; no `data-id` in `todoColors` |
| localStorage `recentVaults` | Paths stored without validation | Acceptable — user controls their own localStorage; paths validated at open time |

### Notes

- This is a local personal desktop app. Threat model excludes external attackers — all IPC callers are the app itself.
- GTK-WARNING and ICD graphics driver warnings seen in terminal output are Linux system-level noise, not app errors.
- No framework or build step — all security depends on manual `escHtml()` discipline. Future contributors must maintain this pattern for any new `innerHTML` use.

---

## Audit 2 — Drag-and-Drop & Focus-Refresh Review

**Date:** 2026-05-25
**Scope:** `src/renderer.js` — drag implementation, focus-refresh guard, color key remapping
**Status:** ✅ Complete — 1 finding fixed, remainder cleared

### Findings & Fixes

| # | Severity | File | Issue | Status |
|---|----------|------|-------|--------|
| 1 | Medium | `renderer.js:focus handler` | `refreshVault()` on window focus not guarded against an active drag — if user Alt-Tabs mid-drag, vault re-renders detach the source item and `fromLineIndex` becomes stale, risking a corrupted drop | ✅ Fixed: added `&& !dragState` to the focus guard |

### Items Reviewed & Cleared

| Area | Finding | Verdict |
|------|---------|---------|
| `cloneNode(true)` on drag source | Could copy event listeners to clone | Safe — `cloneNode` copies DOM structure and attributes only, never event listeners |
| `onDragCancel` removes `pointerup` listener added with `{ once: true }` | `removeEventListener` might not match | Safe — capture flag is the only matching criterion; `once` doesn't affect it. Listener is removed correctly |
| `reorderTodoBlock` color remap | Bulk-delete-then-reinsert could lose colors | Safe — old→new index formula verified for both up and down moves; edge case where `toLineIndex` is inside the moved block returns early |
| `getTodoSectionTitle` + `getFileSections` called per item in `initDrag` | O(n × lineIndex) work | Acceptable — vault files are small; imperceptible at drag-start |
| Pointer events without `setPointerCapture` | Events could be lost if pointer leaves window | Acceptable — desktop-only app; document-level listeners catch all pointer events within the window |
| `moveTodoToSection` called with `fromLineIndex` from drag-start | Line index could be stale if file changed externally during drag | Mitigated by the focus-refresh guard fix (Finding 1) — vault can no longer refresh while a drag is active |
| `dragging-active` class cleanup | Could get stuck if `onDragPointerUp` throws early | Safe — `classList.remove` is called synchronously before any `await`; no throw path before it |
| `escHtml()` coverage on drag clone | Clone built via `cloneNode` not `innerHTML` | Safe — `cloneNode` copies existing escaped DOM; no new user content injected |

### Notes

- Drag implementation uses pointer events exclusively — no HTML5 DnD API surface. This eliminates the ghost-image, `dataTransfer`, and cross-origin DnD attack surface entirely.
- The only persistent state mutated during drag is `todoColors` (via `reorderTodoBlock`/`moveTodoToSection`). Both functions perform atomic remap before saving, so a cancelled drag leaves `todoColors` untouched.
- `todoColors` and `fileIconColors` are still not persisted to localStorage — planned for next session.

---

<!-- Template for new audits:

## Audit N — Description

**Date:** YYYY-MM-DD
**Scope:** Which files / features
**Status:** In Progress | Complete

### Findings

| Severity | File | Issue | Fix |
|----------|------|-------|-----|
| Low/Med/High | file:line | What's wrong | How to fix |

-->
