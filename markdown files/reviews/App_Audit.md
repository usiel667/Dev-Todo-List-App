# App Audit

Code reviews and security/correctness audits of the Dev Todo app.

---

## Audit Template

Use this structure for each audit. Copy, increment the number, fill in findings.

---

## Audit 1 — Initial Security Review

**Date:** YYYY-MM-DD
**Scope:** Full app — IPC, renderer, preload
**Status:** Template (not yet completed)

### IPC Security

| Check | Status | Notes |
|-------|--------|-------|
| `nodeIntegration: false` in BrowserWindow | ✅ | Set in `main.js` |
| `contextIsolation: true` in BrowserWindow | ✅ | Set in `main.js` |
| All IPC exposed via `contextBridge` only | ✅ | `preload.js` uses `contextBridge.exposeInMainWorld` |
| No `shell.openExternal` with unvalidated input | ⬜ | Review `open-obsidian-file` handler |
| File paths validated before read/write | ⬜ | Confirm paths can't escape vault root |

### Renderer Security

| Check | Status | Notes |
|-------|--------|-------|
| No `eval()` or `new Function()` | ⬜ | |
| No `innerHTML` with unsanitized user text | ⬜ | Todo text is set via `innerHTML` — verify escaping |
| Wiki-link URLs validated before `openObsidianFile` | ⬜ | |

### Correctness Checks

| Check | Status | Notes |
|-------|--------|-------|
| `attachTodoHandlers()` selectors are precise | ⬜ | Avoid null querySelector — see Bug Fix 1 |
| Step handler block runs before regular todo block | ⬜ | Ordering matters in `attachTodoHandlers()` |
| `pendingNewTodo` cleared on re-render | ⬜ | |
| `pendingNewStep` cleared on re-render | ⬜ | |

### Findings

*List any issues found here.*

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
