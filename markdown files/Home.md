# Dev Todo — Project Notes

A central index for all project documentation. Click any link to open the note directly in Obsidian.

---

## TODO

### In Progress
- [x] Fix color / move dropdown not showing menu when clicked — see [[Bug_Fixes]]
- [x] Fix section sub-headers (In Progress, Before Production) not collapsing — see [[Bug_Fixes]]
- [ ] add todo button drop down.
- [ ] Add undo feature for accidental edits / deletions in markdown files
- [ ] Add link to md file in the drop down in todo and for file
- [ ] New note button not working — see [[Bug_Fixes]]

### Before Production
- [ ] Add window minimize / maximize / close controls to frameless titlebar
- [ ] Persist todoColors and fileIconColors to localStorage across sessions
- [ ] Persist collapsedGroups and collapsedSections to localStorage across sessions
- [ ] Handle vault read errors gracefully in the UI (not just alert)

### Planned Features
- [ ] Drag-and-drop to reorder todos within a section
- [ ] Multi-vault support (switch between vaults without restarting)
- [ ] Add keyboard shortcut (Cmd/Ctrl+K) to focus search input
- [ ] Build files and folders for a new project from within the app
- [ ] Dark / light theme toggle
- [ ] make keybindings for vim motions
- [ ] create settings and a button for that

### Obsidian Setup
- [x] Install Dataview plugin — auto-generate live TODO lists from all notes
- [ ] Drop down link to md file
- [ ] Install Tasks plugin — enhanced checkbox management
- [ ] Install Git plugin — commit notes alongside code from inside Obsidian

---

## App Layout

**Process:** `main.js` → `preload.js` → `src/renderer.js`

| File | Role |
|------|------|
| `main.js` | Electron main process — creates window, registers IPC handlers |
| `preload.js` | Context bridge — exposes `window.vault.*` API to renderer |
| `src/index.html` | Shell HTML — titlebar, ribbon, sidebar, workspace, dropdown |
| `src/renderer.js` | All UI logic — state, rendering, event handlers |
| `src/styles.css` | Tokyo Night theme — CSS variables, component styles |

**IPC Channels:**

| Channel | Direction | Description |
|---------|-----------|-------------|
| `open-vault` | renderer → main | Opens OS folder picker, returns path |
| `read-vault` | renderer → main | Recursively scans `.md` files in vault |
| `write-file` | renderer → main | Writes content to a file path |
| `create-file` | renderer → main | Creates a new `.md` file with `# Title` stub |
| `open-obsidian-file` | renderer → main | Opens file via `obsidian://open?file=` URL |

---

## Guides
Step-by-step implementation guides for features built into the app.

- [[Feature_Implementation_Guide]] — Template for documenting new features

---

## Debugging
Logs of bugs encountered, their root cause, and how they were resolved.

- [[Bug_Fixes]] — App-level bugs: dropdown, collapse, IPC errors
- [[Electron_Debug]] — Electron-specific issues: binary install, Node compat, reload

---

## Setup & Configuration
Reference docs for tools and services wired into the project.

- [[Dev_Environment_Setup]] — Node version, Electron install workaround, npm scripts
- [[GitNexus_Integration]] — GitNexus workflow: when to run analyze, how to use with Claude

---

## Data & Storage
Reference for vault file formats, localStorage schema, and IPC data shapes.

- [[Vault_Format_Reference]] — Markdown checkbox format, wiki-link syntax, step heading format

---

## UI Issues & Design
Visual bugs spotted in the app and design changes to make or remove.

- [[UI_Issues_Design]] — Running log of UI issues and design changes

---

## Reviews
Code reviews and audits.

- [[App_Audit]] — Security and correctness review template

---

## Archive
Notes from AI tool sessions kept for reference.

### Claude
- [[Claude_Session_Notes]] — Key decisions and context from build sessions
