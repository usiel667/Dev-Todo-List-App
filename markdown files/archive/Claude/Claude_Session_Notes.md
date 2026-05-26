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

## Session 4 — Bug Fixes, Debugging, Auto-Refresh

**Date:** 2026-05-24
**Scope:** Three bug fixes, DevTools-based debugging workflow, vault auto-refresh on focus

**Bugs fixed:**

**App resets on checkbox click (Fix 5):**
- `electron-reload` was watching `__dirname` (entire project root) with `hardReset: true`
- Any vault file write triggered a full Electron restart
- Fix: scope watcher to `path.join(__dirname, 'src')` — only code changes reload the app
- File: `main.js`

**Color transfers to wrong todo after line shifts (Fix 6):**
- `todoColors` Map is keyed by `filePath::lineIndex`
- Inserting or deleting a line shifts all subsequent line numbers, making stored color keys point to wrong todos
- Fix: added `shiftColorKeys(filePath, fromIndex, delta)` — updates all affected map keys whenever lines are inserted (+1) or deleted (-1)
- Called in: `deleteTodo`, `commitStep` handler, `commitNewTodo` handler
- `insertStep` and `appendTodo` now return `{ content, insertAt }` instead of just the content string so callers know where the shift happened
- File: `src/renderer.js`

**App doesn't reflect external edits (e.g. from Obsidian):**
- Vault files are read once on vault open and cached in `vaultFiles[]`
- Changes made in Obsidian or any external editor are never picked up
- Fix: `window.addEventListener('focus', ...)` — calls `refreshVault()` when the app window regains focus, but only if a vault is open and no inline edit is in progress (`!pendingNewTodo && !pendingNewStep`)
- File: `src/renderer.js`

**Debugging workflow established:**
- Open Electron DevTools with `Ctrl+Shift+I` inside the app window (not the terminal)
- Use the inspector cursor (top-left of DevTools) to click an element and jump to it in the Elements panel
- Right-click element → Copy → Copy outerHTML to get `data-id`, `class`, and `style` in one paste
- `data-id` format is `filePath::lineIndex` — cross-reference with `todoColors` Map to trace color bugs

---

## Session 5 — Security Audit, Drag-and-Drop, Bug Fixes

**Date:** 2026-05-24 – 2026-05-25
**Scope:** Full security/correctness audit, drag-and-drop todo reorder, create-file IPC fix

**Security audit (Audit 1 — all 5 findings fixed):**
- `create-file` IPC: `path.basename()` added to prevent path traversal (`../../.bashrc` style)
- `moveTodoToSection`: was never calling `shiftColorKeys` — colors went stale after a move; fixed inline per-direction remapping
- `startEditTodo`: `item.querySelector('.todo-text')` not null-checked — double-click during edit could crash; added `if (!textEl) return`
- File group collapse handler: `header.nextElementSibling` / `header.querySelector('.group-arrow')` used without null checks; added guards
- `save()`: `refreshVault()` on window focus could race with in-progress saves; added `isSaving` flag; focus refresh skipped while saving

**create-file IPC bug fixed:**
- Handler referenced `safeName` (undefined) instead of `baseName` — new file button always threw a ReferenceError
- Fix: changed all `safeName` references to `baseName` in `main.js`

**Drag-and-drop reorder:**
- Implemented with **pointer events** (not HTML5 DnD) for full control
- `initDrag` creates a `position:fixed` clone of the todo item; only Y is updated during `pointermove` — X is locked to the column
- `onDragPointerMove` is RAF-throttled via `dragRafId`; stores latest event in `lastMoveEvent` to always use the most recent position
- Hit-testing uses **frozen snapshots** of item positions taken at drag-start — animating margin never feeds back into hit-testing (eliminates jitter)
- Threshold for switching the gap indicator is the **bottom edge** of each item (not midpoint) — gap only moves after cursor fully passes an item
- Drops restricted to **same section** by filtering snapshots on `getTodoSectionTitle` value; cursor can't fall through to the next section
- **Cross-section drop**: section sub-headers are snapshotted separately; hovering one highlights it blue (`.drag-section-over`); dropping calls `moveTodoToSection` which already handles line/color remapping
- `reorderTodoBlock(filePath, fromLineIndex, toLineIndex)`: moves root todo + indented children as a block; remaps all `todoColors` keys using exact old→new index formula (verified for both up and down moves)
- `todoListEl.classList.add('dragging-active')` during drag gives section headers a dashed outline as a hint they are droppable

**Key invariants to preserve:**
- Every drag function (`onDragPointerUp`, `onDragCancel`) must call `todoListEl.classList.remove('dragging-active')` on cleanup
- `sectionSnapshots` are keyed by `data-section-key` format `filePath::sectionTitle` — parse with `indexOf('::')` (first occurrence)
- `reorderTodoBlock` is a no-op if `toLineIndex` falls inside the moved block

---

## Useful Context for Future Sessions

- **Electron workaround:** On Node v26+, run the unzip command after `npm install` (see [[Dev_Environment_Setup]])
- **Handler order matters:** In `attachTodoHandlers()`, register linked step handlers before regular step handlers or you'll get null-reference TypeErrors
- **Guide files are read-only:** Never write back to guide files. Wiki-linked step state lives in localStorage only
- **`renderTodos()` rebuilds all HTML:** After any state change that affects the view, call `renderTodos()`. The only exception is chevron toggle and section collapse, which directly toggle DOM classes for performance
- **GitNexus:** Run `npx gitnexus analyze` after significant refactors. Always run impact analysis before editing `attachTodoHandlers`, `renderTodos`, or any IPC handler — these are high-fan-out symbols
- **`todoColors` keys are `filePath::lineIndex`** — any operation that inserts or deletes lines must call `shiftColorKeys(filePath, insertAt, ±1)` to keep colors on the right todos
- **`insertStep` and `appendTodo` return `{ content, insertAt }`** — not just a string; callers must destructure to get the insertion point for `shiftColorKeys`
- **Auto-refresh on focus** — `refreshVault()` fires on `window focus` event; skip if `pendingNewTodo`, `pendingNewStep`, or `isSaving` is set to avoid interrupting inline edits or racing with a save
- **Drag uses pointer events, not HTML5 DnD** — `pointerdown` → `initDrag`; `pointermove` / `pointerup` / `pointercancel` on `document`. Never reintroduce `dragstart` / `dragover` — HTML5 DnD can't lock the X axis
- **Drag snapshots are frozen** — positions are captured once in `initDrag` before any animation; never call `getBoundingClientRect()` during the RAF loop for hit-testing
- **Section boundary enforcement** — candidates filtered by `s.section === dragState.sourceSection` (from `getTodoSectionTitle`); cross-section drops go through section header hit-testing, not item hit-testing
- **`reorderTodoBlock` color remapping** — bulk remap using old→new index formula; deletes all file keys then reinserts. Don't use `shiftColorKeys` for block moves — it only handles single-line shifts
- **Color persistence (not yet implemented)** — full plan in [[Vault_Format_Reference]] under "Color Persistence — Implementation Notes". Key points: `savePalette()` / `loadPalette()` helpers, 6 call sites for save, one known limitation (external line shifts while app is closed can misalign colors)
