# UI Issues & Design

Running log of visual bugs spotted in the app and design changes to make or remove.

---

## Format

Each entry: what's wrong, where it is, and what the fix or decision is.

---

## Open Issues

*(None currently logged — add new issues below)*

---

## Resolved

### 1 — Dropdown not visible on ⋯ click

**Spotted:** 2026-05-24
**Status:** Fix applied (see [[Bug_Fixes]] Fix 1)

The color/move dropdown failed to open. Root cause was a TypeError in `attachTodoHandlers()` stopping handler registration. Fixed by tightening the step selector to exclude `.todo-linked-step` items.

---

### 2 — Section sub-headers not collapsing

**Spotted:** 2026-05-24
**Status:** Fix applied (see [[Bug_Fixes]] Fix 2)

"In Progress" and "Before Production" headers couldn't be clicked to collapse. Same root cause as issue 1.

---

## Design Notes

### Theme

Tokyo Night color palette throughout. All colors referenced via CSS variables — never hardcode hex values in components.

Key palette:
- Background: `#1a1b26` (`--bg`)
- Surface (cards): `#1f2335` (`--surface`)
- Accent blue: `#7aa2f7` (`--blue`)
- Accent purple: `#bb9af7` (`--purple`)
- Text: `#c0caf5` (`--text`)

### Frameless Window

The app uses `frame: false` in Electron. The custom titlebar uses `-webkit-app-region: drag` so it can be dragged. All interactive elements inside it must set `-webkit-app-region: no-drag`.

### Planned UI Work

- [ ] Add window minimize / maximize / close controls to the custom titlebar
- [ ] Review step panel styling once linked steps are confirmed working
- [ ] Consider a loading indicator when opening large vaults

---

<!-- Template for new issues:

### N — Short description

**Spotted:** YYYY-MM-DD
**Status:** Open | Fixed | Won't Fix

What the user sees. Where it happens. File and line if known.

**Fix:** What was changed, or why it was decided not to fix.

-->
