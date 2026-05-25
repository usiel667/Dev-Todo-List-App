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
