# Claude Session Notes

Key decisions and context from build sessions with Claude. Use this to resume work without re-explaining the architecture.

---

## Session 1 — Initial Build

**Date:** 2026-05-12 (approx)
**Scope:** Core Electron setup, IPC, vault reading, todo rendering, Tokyo Night theme

**Key decisions:**
- `frame: false` window with custom titlebar using `-webkit-app-region`
- All IPC via `contextBridge` — no `nodeIntegration`
- Vault is a folder of `.md` files, read recursively
- Todos parsed with `CHECKBOX_RE` — captures indent for tree building
- State lives entirely in `renderer.js` module scope (no framework)
- Tokyo Night theme via CSS custom properties

---

## Session 2 — Tabs, Sections, Steps

**Date:** 2026-05-23
**Scope:** Tab system, section collapse, step sub-todos, linked guide steps, bug fixes

**Key decisions:**

**Tab system:**
- Tabs stored as `Tab[]` with `{ id, filePath, name }`; always starts with All tab
- `+` button at end of tab bar opens a floating `tab-picker` div with all vault files
- Tab state not persisted (resets on reload) — acceptable for now

**Section collapse:**
- Section sub-headers (`###`) parsed from file content during render
- `collapsedSections` Set uses key `"${filePath}::${sectionTitle}"`
- Toggled directly via DOM class (no re-render) for performance

**Step sub-todos:**
- `buildTodoTree(todos)` groups indented checkboxes (`indent.length > 0`) as children of the last root todo
- Steps panel shown/hidden with `.todo-with-steps` wrapper + `.todo-steps` panel
- Chevron (▶) on parent; rotates 90° when expanded

**Linked guide steps (wiki-links):**
- If todo text contains `[[filename]]`, `getLinkedSteps(text)` looks up the file
- Guide file has `## Step N — Title` headings (no checkboxes) — `STEP_HEADING_RE` parses these
- Step done state stored in localStorage as `stepDone::${filePath}::${lineIndex}`
- Guide file is never modified — it's read-only reference material
- Steps auto-collapse when all are checked

**Critical bug fixed:**
- `attachTodoHandlers()` selector `.todo-step` was matching `.todo-linked-step` items
- Linked step items have no `.edit-btn` — `querySelector('.edit-btn').addEventListener(...)` threw TypeError
- TypeError stopped the forEach mid-loop, preventing section collapse and ⋯ dropdown handlers from registering
- Fix: changed selector to `.todo-step:not(.todo-linked-step)`

---

## Session 3 — Vault Documentation

**Date:** 2026-05-24
**Scope:** Built out `markdown files/` vault directory for the project itself

**Files created:**
- `Home.md` — central TODO index and project nav
- `APP_REFERENCE.md` — complete code reference (IPC, state, functions, CSS vars)
- `debugging/Bug_Fixes.md` — bug log
- `database/Vault_Format_Reference.md` — markdown format, localStorage, IPC shapes
- `setup/Dev_Environment_Setup.md` — install guide, Electron workaround
- `setup/GitNexus_Integration.md` — GitNexus workflow reference
- `guides/Feature_Implementation_Guide.md` — step-by-step feature template
- `reviews/App_Audit.md` — security/correctness audit template
- `ui/UI_Issues_Design.md` — UI bug tracker and design notes
- `archive/Claude/Claude_Session_Notes.md` — this file

**Pattern established:** This folder structure is the standard for all projects going forward. The goal is to eventually build it from within the app itself (planned feature).

---

## Useful Context for Future Sessions

- **Electron workaround:** On Node v26+, run the unzip command after `npm install` (see [[Dev_Environment_Setup]])
- **Handler order matters:** In `attachTodoHandlers()`, register linked step handlers before regular step handlers or you'll get null-reference TypeErrors
- **Guide files are read-only:** Never write back to guide files. Wiki-linked step state lives in localStorage only
- **`renderTodos()` rebuilds all HTML:** After any state change that affects the view, call `renderTodos()`. The only exception is chevron toggle and section collapse, which directly toggle DOM classes for performance
- **GitNexus:** Run `npx gitnexus analyze` after significant refactors. Always run impact analysis before editing `attachTodoHandlers`, `renderTodos`, or any IPC handler — these are high-fan-out symbols
