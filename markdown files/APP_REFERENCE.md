# App Reference — Dev Todo

Quick-navigation index of every major constant, state variable, function, IPC channel, and CSS variable in the codebase.

---

## Table of Contents

- [IPC Channels](#ipc-channels)
- [State Variables](#state-variables)
- [Key Constants](#key-constants)
- [Core Functions](#core-functions)
- [Markdown Helpers](#markdown-helpers)
- [Rendering Functions](#rendering-functions)
- [Event Handlers](#event-handlers)
- [CSS Variables](#css-variables)
- [Scripts](#scripts)

---

## IPC Channels

> `main.js` → `preload.js` → `window.vault.*`

| Channel | `window.vault` method | Parameters | Returns |
|---------|-----------------------|------------|---------|
| `open-vault` | `openVault()` | — | `string \| null` (folder path) |
| `read-vault` | `readVault(folderPath)` | `folderPath: string` | `VaultFile[]` or `{ error }` |
| `write-file` | `writeFile(filePath, content)` | path, content strings | `{ success } \| { error }` |
| `create-file` | `createFile(folderPath, fileName)` | folder path, name | `{ success, path, name, relativePath } \| { error }` |
| `open-obsidian-file` | `openObsidianFile(vaultPath, fileName)` | vault path, file name | `{ success }` |

**VaultFile shape:**
```js
{
  name: string,         // e.g. "Home.md"
  relativePath: string, // e.g. "guides/Home.md"
  path: string,         // absolute path
  content: string       // full file text
}
```

---

## State Variables

> `src/renderer.js` — module-level

| Variable | Type | Description |
|----------|------|-------------|
| `vaultPath` | `string \| null` | Absolute path to the open vault folder |
| `vaultFiles` | `VaultFile[]` | All `.md` files loaded from the vault |
| `activeTag` | `string \| null` | Currently filtered tag, or null for all |
| `statusFilter` | `'active' \| 'done' \| 'all'` | Checkbox filter state (default: `'active'`) |
| `searchQuery` | `string` | Live search text |
| `tabs` | `Tab[]` | Open tabs; always starts with `{ id:'all', filePath:null, name:'All' }` |
| `activeTabId` | `string` | ID of the currently visible tab |
| `currentPanel` | `'files' \| 'tags' \| null` | Which ribbon panel is open |
| `pendingNewTodo` | `object \| null` | `{ filePath, targetSection?, savedText? }` — inline new-todo state |
| `pendingNewStep` | `object \| null` | `{ filePath, parentLineIndex }` — inline new-step state |
| `dragState` | `object \| null` | Active drag context — `{ filePath, fromLineIndex, sourceItem, cloneEl, startMouseY, cloneStartY, currentTarget, currentInsertBefore, currentSectionTarget, snapshots, sectionSnapshots, sourceSection }` |
| `dragRafId` | `number \| null` | `requestAnimationFrame` ID used to throttle `pointermove` during drag |
| `lastMoveEvent` | `PointerEvent \| null` | Most-recent `pointermove` event, read inside the RAF callback |
| `collapsedGroups` | `Set<string>` | File paths whose todo group is collapsed |
| `collapsedSections` | `Set<string>` | Keys `"${filePath}::${sectionTitle}"` for collapsed sections |
| `collapsedSteps` | `Set<string>` | Parent todo IDs whose steps panel is collapsed |
| `todoColors` | `Map<string, string>` | todo id → CSS color string |
| `fileIconColors` | `Map<string, string>` | file path → CSS color string |

---

## Key Constants

> `src/renderer.js`

| Constant | Value / Description |
|----------|---------------------|
| `CHECKBOX_RE` | `/^(\s*)-\s+\[([ xX])\]\s+(.+)$/` — matches markdown checkboxes; group 1 = indent, 2 = state, 3 = text |
| `STEP_HEADING_RE` | `/^#{1,6}\s+(Step\s+\d+\b.*)$/i` — matches `## Step N — Title` headings in guide files |
| `COLORS` | Array of 8 Tokyo Night color presets: Default, Red, Orange, Yellow, Green, Teal, Blue, Purple |

---

## Core Functions

> `src/renderer.js`

| Function | Description |
|----------|-------------|
| `openVault()` | Opens OS folder dialog, calls `addRecentVault`, delegates to `openVaultByPath` |
| `openVaultByPath(folderPath)` | Sets vault state, reads files, enables UI |
| `refreshVault()` | Re-reads all files from disk, re-renders everything |
| `enableUI()` | Enables the new-file button after a vault is open |
| `save(file)` | Writes `file.content` back to disk via IPC |
| `createNewFile()` | Prompts for a name and creates a `.md` stub via IPC |

---

## Markdown Helpers

> `src/renderer.js`

| Function | Signature | Description |
|----------|-----------|-------------|
| `parseTodos(file)` | `(file) → Todo[]` | Extracts all checkboxes from file content; captures indent for tree building |
| `buildTodoTree(todos)` | `(Todo[]) → TreeNode[]` | Groups indented todos as children of their nearest root todo |
| `getLinkedSteps(todoText)` | `(string) → Step[]` | Finds `[[wiki-link]]` in text, looks up the file, returns `## Step N` headings |
| `getFileSections(file)` | `(file) → Section[]` | Returns headings under TODO/Checklist parents (for move-to-section dropdown) |
| `getTodoSectionTitle(lineIndex, content)` | `(number, string) → string \| null` | Returns the last heading before a line |
| `appendTodo(content, text)` | `(string, string) → { content, insertAt }` | Inserts a new `- [ ] ` into the TODO section (or end of file); callers must call `shiftColorKeys` with `insertAt` |
| `insertStep(content, parentLine, text)` | `(string, number, string) → { content, insertAt }` | Inserts `  - [ ] Step N — text` after parent and its existing steps; callers must call `shiftColorKeys` with `insertAt` |
| `setTodoDone(content, lineIndex, done)` | `(string, number, bool) → string` | Toggles `[ ]` / `[x]` on a line |
| `setTodoText(content, lineIndex, text)` | `(string, number, string) → string` | Replaces todo text on a line |
| `deleteTodoLine(content, lineIndex)` | `(string, number) → string` | Removes a line from file content |
| `moveTodoToSection(filePath, lineIndex, section)` | async | Moves a todo line to a different heading; remaps `todoColors` keys |
| `reorderTodoBlock(filePath, fromLineIndex, toLineIndex)` | async | Moves a root todo + its indented children to a new position within the same file; remaps all `todoColors` keys using old→new index mapping |
| `shiftColorKeys(filePath, fromIndex, delta)` | — | Shifts all `todoColors` keys for a file by `delta` starting at `fromIndex`; call after any line insert (+1) or delete (-1) |

---

## Rendering Functions

> `src/renderer.js`

| Function | Description |
|----------|-------------|
| `renderTabs()` | Builds the `.workspace-tabs` bar; always includes the All tab and a `+` picker button |
| `renderSidebar()` | Renders file list and tag chips |
| `renderTodos()` | Main render: groups by file → section → tree node; builds HTML string; calls `attachTodoHandlers()` |
| `attachTodoHandlers()` | Wires all click/change/keydown/pointerdown listeners after innerHTML is replaced |
| `initDrag(e, sourceItem, filePath, lineIndex)` | Starts a pointer-event drag — creates fixed clone, snapshots item + section header positions, registers `pointermove`/`pointerup`/`pointercancel` handlers |
| `onDragPointerMove(e)` | RAF-throttled drag move — updates clone Y position, hit-tests against frozen snapshots, applies `drag-over-top`/`drag-over-bottom`/`drag-section-over` indicators |
| `onDragPointerUp()` | Drop handler — calls `moveTodoToSection` for cross-section drops or `reorderTodoBlock` for same-section reorder |
| `onDragCancel()` | Pointer-cancel / escape cleanup — removes clone and all drag indicators |
| `clearDragIndicators()` | Removes `drag-over-top`, `drag-over-bottom`, and `drag-section-over` from all elements |
| `updateStatusBar()` | Updates vault name and active/total counts in the status bar |
| `renderRecentVaults()` | Populates `#recent-vaults-list` from localStorage |
| `showDropdown(anchorEl, mode, ctx)` | Positions and fills the floating color/section picker |
| `hideDropdown()` | Hides the floating dropdown |
| `showTabPicker(anchorEl)` | Shows the file picker popup under the `+` tab button |
| `renderTodoText(text)` | Converts `[[wiki-link]]` spans to clickable elements |
| `startEditTodo(item, filePath, lineIndex)` | Replaces todo text with an inline input |

---

## Event Handlers

> `src/renderer.js` — bottom of file

| Element | Event | Action |
|---------|-------|--------|
| `#open-vault-btn`, `#open-vault-btn2` | click | `openVault()` |
| `#open-recent-btn` | click | Toggle `#recent-vaults-list` |
| `#open-vault-btn` (ribbon) | click | `openVault()` |
| `#new-file-btn` | click | `createNewFile()` |
| `#search-input` | input | Update `searchQuery`, re-render todos |
| `#status-filter` | change | Update `statusFilter`, re-render todos |
| `#ribbon-files` | click | Toggle files panel or collapse sidebar |
| `#ribbon-tags` | click | Toggle tags panel or collapse sidebar |

---

## CSS Variables

> `src/styles.css` — `:root`

| Variable | Value | Use |
|----------|-------|-----|
| `--bg` | `#1a1b26` | Main workspace background |
| `--bg-dark` | `#16161e` | Titlebar, ribbon, sidebar, tab bar |
| `--surface` | `#1f2335` | Todo card background |
| `--surface-2` | `#24283b` | Dropdown background |
| `--highlight` | `#292e42` | Hover state background |
| `--border` | `#292e42` | Standard border |
| `--border-bright` | `#3b4261` | Active/focused border |
| `--text` | `#c0caf5` | Primary text |
| `--text-muted` | `#565f89` | Secondary text |
| `--text-dim` | `#3b4261` | Disabled / placeholder text |
| `--blue` | `#7aa2f7` | Accent — active tabs, focused inputs |
| `--purple` | `#bb9af7` | Accent — file icons, active sidebar items |
| `--green` | `#9ece6a` | Checkboxes, done state |
| `--red` | `#f7768e` | Danger / delete actions |
| `--cyan` | `#7dcfff` | Wiki links (hover) |
| `--orange` | `#ff9e64` | Color swatch |
| `--yellow` | `#e0af68` | Color swatch |
| `--teal` | `#73daca` | Color swatch |
| `--ribbon-w` | `44px` | Left ribbon width |
| `--sidebar-w` | `258px` | Sidebar width |
| `--titlebar-h` | `34px` | Titlebar height |

---

## Scripts

> `package.json`

| Script | Command | Description |
|--------|---------|-------------|
| `start` | `electron .` | Launch the app in production mode |
| `dev` | `NODE_ENV=development electron .` | Launch with hot-reload (`electron-reload`) |

**Electron binary install workaround** (Node v26+ incompatibility):
```bash
unzip -o ~/.cache/electron/*/electron-v*-linux-x64.zip \
  -d node_modules/electron/dist/
echo "electron" > node_modules/electron/path.txt
```
