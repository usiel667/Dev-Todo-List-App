# Feature Implementation Guide — Template

Use this template when documenting a new feature. Copy it, rename the file to match the feature, and fill in each section.

---

## Overview

**Feature name:** *(e.g. "Drag-and-Drop Todo Reordering")*
**Status:** Planned | In Progress | Complete
**Date started:** YYYY-MM-DD

Brief one-paragraph description of what this feature does and why it's being added.

---

## Step 1 — Define the data model

What state does this feature need? Add new variables to the state section at the top of `renderer.js`.

```js
// Example
let draggedTodo = null; // { filePath, lineIndex } while dragging
```

**Files to update:**
- `src/renderer.js` — state variables section

---

## Step 2 — Update the HTML structure

Does this feature need new elements in `index.html`? Describe them here.

```html
<!-- Example: drag handle on each todo item -->
<span class="drag-handle">⠿</span>
```

**Files to update:**
- `src/index.html`

---

## Step 3 — Add the rendering logic

Which render function builds the new UI elements? Usually `renderTodos()` or a helper it calls.

Describe the HTML string additions and any new CSS class names used.

**Files to update:**
- `src/renderer.js` — `renderTodos()` or helper function

---

## Step 4 — Wire the event handlers

Add event listeners in `attachTodoHandlers()`. Remember: handler order matters — a TypeError in an earlier block will prevent later blocks from registering.

```js
// Example handler block
document.querySelectorAll('.drag-handle').forEach(handle => {
  handle.addEventListener('mousedown', e => {
    // ...
  });
});
```

**Files to update:**
- `src/renderer.js` — `attachTodoHandlers()`

---

## Step 5 — Add the markdown mutation (if needed)

If this feature modifies file content, add a helper function near the other markdown helpers (`insertStep`, `setTodoDone`, etc.).

```js
function reorderTodo(content, fromIndex, toIndex) {
  // ...
}
```

**Files to update:**
- `src/renderer.js` — markdown helpers section

---

## Step 6 — Add styles

New CSS goes in `styles.css`. Use existing CSS variables (see `APP_REFERENCE.md`). Don't add new color values — use the Tokyo Night palette.

```css
.drag-handle {
  color: var(--text-dim);
  cursor: grab;
  padding: 0 4px;
}
```

**Files to update:**
- `src/styles.css`

---

## Step 7 — Test

- [ ] Feature works on the happy path
- [ ] Edge cases handled (empty list, single item, etc.)
- [ ] No regressions in existing ⋯ dropdown, section collapse, or step expansion
- [ ] Run `gitnexus_detect_changes` to confirm blast radius matches expectations

---

## Notes

*Any implementation decisions, constraints, or gotchas discovered during the build.*
