# Vault Format Reference

Reference for how markdown files are structured, how localStorage is used, and what shapes IPC calls return.

---

## Markdown Checkbox Format

All todos are standard GitHub-flavored markdown checkboxes:

```markdown
- [ ] Unchecked todo
- [x] Checked / done todo
  - [ ] Indented child step (2-space indent)
  - [ ] Another child step
```

**Rules:**
- Root todos have zero indent
- Child steps have exactly 2-space indent
- The parser regex: `CHECKBOX_RE = /^(\s*)-\s+\[([ xX])\]\s+(.+)$/`
  - Group 1 = indent string
  - Group 2 = `' '` or `'x'`/`'X'`
  - Group 3 = todo text

---

## Wiki-Link Syntax

Link to another note using double-bracket syntax:

```markdown
- [ ] Implement multi-item orders — see [[multi-item-orders-implementation]]
```

**Behavior in the app:**
- Clicking a `[[link]]` span opens the file in Obsidian via `obsidian://open?file=`
- If the linked file contains `## Step N —` headings, those steps appear as a collapsible linked-step list under the todo
- Linked step done state is tracked in localStorage (file never modified)

---

## Step Heading Format

Guide files use heading-based steps (not checkboxes):

```markdown
## Step 1 — Create the database table

Content explaining the step...

## Step 2 — Write the migration

More content...
```

**Parser regex:** `STEP_HEADING_RE = /^#{1,6}\s+(Step\s+\d+\b.*)$/i`

The app displays these as virtual checkboxes in the steps panel. State is stored in localStorage, not in the guide file.

---

## File Section Structure

Files can have headings that group todos into sections:

```markdown
## TODO

### In Progress
- [ ] Task A
- [ ] Task B

### Before Production
- [ ] Task C
```

**Rules:**
- The app looks for a `## TODO` or `## Checklist` parent heading
- `###` sub-headings become collapsible section sub-headers in the UI
- The section title is used as the key for `collapsedSections`

---

## localStorage Schema

| Key | Value | Description |
|-----|-------|-------------|
| `recentVaults` | `JSON string[]` | Array of absolute vault folder paths, most-recent first |
| `stepDone::${filePath}::${lineIndex}` | `'1'` or absent | Done state for a linked guide step |
| `todoColors` | *(not yet persisted)* | Planned: `JSON.stringify([...todoColors])` — array of `[key, color]` pairs |
| `fileIconColors` | *(not yet persisted)* | Planned: `JSON.stringify([...fileIconColors])` — array of `[filePath, color]` pairs |
| `collapsedGroups` | *(not yet persisted)* | Planned: Set of file paths whose group is collapsed |
| `collapsedSections` | *(not yet persisted)* | Planned: Set of `filePath::sectionTitle` keys |

### Color Persistence — Implementation Notes

**savePalette() / loadPalette() pattern:**
```js
function savePalette() {
  localStorage.setItem('todoColors',    JSON.stringify([...todoColors]));
  localStorage.setItem('fileIconColors', JSON.stringify([...fileIconColors]));
}

function loadPalette() {
  try {
    const tc = localStorage.getItem('todoColors');
    if (tc) for (const [k, v] of JSON.parse(tc)) todoColors.set(k, v);
    const ic = localStorage.getItem('fileIconColors');
    if (ic) for (const [k, v] of JSON.parse(ic)) fileIconColors.set(k, v);
  } catch { /* ignore corrupt data */ }
}
```

**Call `loadPalette()` once** at module startup (near the Map declarations), before any render.

**Call `savePalette()` after each of these 6 mutation sites** in `renderer.js`:
1. `showDropdown` color swatch click (user picks a color — covers both maps)
2. `deleteTodo` (calls `shiftColorKeys`)
3. `reorderTodoBlock` (bulk remaps keys)
4. `moveTodoToSection` (remaps keys)
5. `commitStep` handler inside `attachTodoHandlers` (calls `shiftColorKeys`)
6. `commitNewTodo` handler inside `attachTodoHandlers` (calls `shiftColorKeys`)

**Known limitation — external line shifts:**
`todoColors` keys are `filePath::lineIndex`. `shiftColorKeys` keeps these correct for all in-app mutations. However, if a file is edited externally in Obsidian *while the app is closed*, line numbers can shift and saved colors will point to the wrong todos on next load. There is no way to detect this without comparing file snapshots at startup. Acceptable for a personal dev tool — just be aware colors may drift after heavy external edits.

---

## IPC Data Shapes

### `VaultFile`
```js
{
  name: string,         // "Home.md"
  relativePath: string, // "guides/Home.md"
  path: string,         // "/abs/path/to/Home.md"
  content: string       // full markdown text
}
```

### `read-vault` response
Returns `VaultFile[]` on success, or `{ error: string }` on failure.

### `write-file` response
```js
{ success: true }
// or
{ error: string }
```

### `create-file` response
```js
{ success: true, path: string, name: string, relativePath: string }
// or
{ error: string }
```

---

## Vault Folder Structure Convention

```
project-vault/
├── Home.md                      ← Central index and TODO hub
├── APP_REFERENCE.md             ← Code reference (symbols, functions, CSS vars)
├── database/
│   └── Vault_Format_Reference.md
├── setup/
│   ├── Dev_Environment_Setup.md
│   └── GitNexus_Integration.md
├── guides/
│   └── Feature_Implementation_Guide.md
├── debugging/
│   └── Bug_Fixes.md
├── reviews/
│   └── App_Audit.md
├── ui/
│   └── UI_Issues_Design.md
└── archive/
    └── Claude/
        └── Claude_Session_Notes.md
```
