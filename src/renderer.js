'use strict';

// ── State ──────────────────────────────────────────────────────────────────
let vaultPath = null;
let vaultFiles = [];
let activeTag = null;
let statusFilter = 'active';
let searchQuery = '';

// ── Tabs ───────────────────────────────────────────────────────────────────
let tabs = [{ id: 'all', filePath: null, name: 'All' }];
let activeTabId = 'all';

function getActiveFilePath() {
  return tabs.find(t => t.id === activeTabId)?.filePath ?? null;
}

function openFileTab(file) {
  const existing = tabs.find(t => t.filePath === file.path);
  if (existing) {
    activeTabId = existing.id;
  } else {
    const id = 'tab-' + file.path;
    tabs.push({ id, filePath: file.path, name: stripMd(file.name) });
    activeTabId = id;
  }
  renderTabs();
  renderSidebar();
  renderTodos();
}

function closeTab(tabId) {
  if (tabId === 'all') return;
  const idx = tabs.findIndex(t => t.id === tabId);
  if (idx === -1) return;
  tabs.splice(idx, 1);
  if (activeTabId === tabId) activeTabId = tabs[Math.max(0, idx - 1)].id;
  renderTabs();
  renderSidebar();
  renderTodos();
}

function showTabPicker(anchorEl) {
  const existing = document.getElementById('tab-picker');
  if (existing) { existing.remove(); return; }

  const picker = document.createElement('div');
  picker.id = 'tab-picker';
  picker.className = 'tab-picker';

  if (!vaultPath || vaultFiles.length === 0) {
    picker.innerHTML = '<div class="tab-picker-empty">No vault open</div>';
  } else {
    for (const file of vaultFiles) {
      const isOpen = tabs.some(t => t.filePath === file.path);
      const item = document.createElement('div');
      item.className = 'tab-picker-item' + (isOpen ? ' is-open' : '');
      item.innerHTML = `
        <span class="tab-picker-check">${isOpen ? '✓' : ''}</span>
        <span class="tab-picker-label">${escHtml(stripMd(file.name))}</span>
      `;
      item.addEventListener('click', () => { openFileTab(file); picker.remove(); });
      picker.appendChild(item);
    }
  }

  document.body.appendChild(picker);
  const r = anchorEl.getBoundingClientRect();
  let left = r.left;
  if (left + 200 > window.innerWidth - 8) left = window.innerWidth - 208;
  picker.style.left = left + 'px';
  picker.style.top = (r.bottom + 4) + 'px';

  const dismiss = e => {
    if (!picker.contains(e.target) && e.target !== anchorEl) {
      picker.remove();
      document.removeEventListener('click', dismiss, true);
    }
  };
  setTimeout(() => document.addEventListener('click', dismiss, true), 0);
}

function renderTabs() {
  const tabsEl = document.querySelector('.workspace-tabs');
  tabsEl.innerHTML = '';
  for (const tab of tabs) {
    const div = document.createElement('div');
    div.className = 'workspace-tab' + (tab.id === activeTabId ? ' active' : '');
    div.innerHTML = `
      <span class="tab-check-icon"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg></span>
      <span class="tab-name">${escHtml(tab.name)}</span>
      ${tab.id !== 'all' ? `<button class="tab-close" title="Close">×</button>` : ''}
    `;
    div.addEventListener('click', e => {
      if (e.target.closest('.tab-close')) return;
      activeTabId = tab.id;
      renderTabs();
      renderSidebar();
      renderTodos();
    });
    const closeBtn = div.querySelector('.tab-close');
    if (closeBtn) closeBtn.addEventListener('click', e => { e.stopPropagation(); closeTab(tab.id); });
    tabsEl.appendChild(div);
  }

  const addBtn = document.createElement('button');
  addBtn.className = 'tab-new-btn';
  addBtn.title = 'Open file in new tab';
  addBtn.textContent = '+';
  addBtn.addEventListener('click', e => { e.stopPropagation(); showTabPicker(addBtn); });
  tabsEl.appendChild(addBtn);
}
const collapsedGroups   = new Set();
const collapsedSections = new Set(); // key: `${filePath}::${sectionTitle}`
const collapsedSteps    = new Set(); // parent todo id → steps collapsed
const todoColors        = new Map(); // todo id  → color string
const fileIconColors    = new Map(); // file path → color string

// Shift todoColors keys when lines are inserted (+1) or deleted (-1) in a file
function shiftColorKeys(filePath, fromIndex, delta) {
  const prefix = filePath + '::';
  const updates = [];
  for (const [key, color] of todoColors) {
    if (!key.startsWith(prefix)) continue;
    const lineIdx = parseInt(key.slice(prefix.length), 10);
    if (isNaN(lineIdx)) continue;
    if (delta > 0 && lineIdx >= fromIndex) {
      updates.push([key, prefix + (lineIdx + delta), color]);
    } else if (delta < 0) {
      if (lineIdx === fromIndex) {
        updates.push([key, null, null]); // remove color for deleted line
      } else if (lineIdx > fromIndex) {
        updates.push([key, prefix + (lineIdx + delta), color]);
      }
    }
  }
  for (const [oldKey, newKey, color] of updates) {
    todoColors.delete(oldKey);
    if (newKey !== null) todoColors.set(newKey, color);
  }
}

const COLORS = [
  { label: 'Default', value: null },
  { label: 'Red',     value: '#f7768e' },
  { label: 'Orange',  value: '#ff9e64' },
  { label: 'Yellow',  value: '#e0af68' },
  { label: 'Green',   value: '#9ece6a' },
  { label: 'Teal',    value: '#73daca' },
  { label: 'Blue',    value: '#7aa2f7' },
  { label: 'Purple',  value: '#bb9af7' },
];

// ── DOM refs ───────────────────────────────────────────────────────────────
const openVaultBtn     = document.getElementById('open-vault-btn');
const openVaultBtn2    = document.getElementById('open-vault-btn2');
const vaultNameEl      = document.getElementById('vault-name');
const fileListEl       = document.getElementById('file-list');
const tagListEl        = document.getElementById('tag-list');
const todoListEl       = document.getElementById('todo-list');
const searchInput      = document.getElementById('search-input');
const statusFilterEl   = document.getElementById('status-filter');
const todoCountEl      = document.getElementById('todo-count');
const newFileBtn       = document.getElementById('new-file-btn');

let pendingNewTodo = null; // { filePath }
let pendingNewStep = null; // { filePath, parentLineIndex }
let dragState = null;     // { filePath, fromLineIndex, sourceItem, cloneEl, ... }
let dragRafId = null;
let lastMoveEvent = null;

const titlebarVaultEl   = document.getElementById('titlebar-vault');
const statusVaultLabel  = document.getElementById('status-vault-label');
const statusTodoCount   = document.getElementById('status-todo-count');

const dropdownEl          = document.getElementById('todo-dropdown');
const dropdownSwatchesEl  = document.getElementById('dropdown-swatches');
const dropdownSectionsEl  = document.getElementById('dropdown-sections');
const dropdownSectionList = document.getElementById('dropdown-section-list');

let dropdownContext = null; // { mode: 'todo'|'icon', todoId?, filePath, lineIndex? }

function showDropdown(anchorEl, mode, ctx) {
  dropdownContext = { mode, ...ctx };

  // Color swatches
  dropdownSwatchesEl.innerHTML = '';
  const currentColor = mode === 'todo' ? todoColors.get(ctx.todoId) : fileIconColors.get(ctx.filePath);
  for (const c of COLORS) {
    const btn = document.createElement('button');
    btn.className = 'color-swatch' + (currentColor === c.value ? ' active' : '');
    btn.title = c.label;
    btn.textContent = '◈';
    btn.style.color = c.value || 'var(--text-muted)';
    if (!c.value) btn.classList.add('swatch-default');
    btn.addEventListener('click', () => {
      if (mode === 'todo') { if (c.value) todoColors.set(ctx.todoId, c.value); else todoColors.delete(ctx.todoId); }
      else                 { if (c.value) fileIconColors.set(ctx.filePath, c.value); else fileIconColors.delete(ctx.filePath); }
      hideDropdown();
      renderTodos();
    });
    dropdownSwatchesEl.appendChild(btn);
  }

  // Section list — for todo mode and new-section mode
  if (mode === 'todo' || mode === 'new-section') {
    dropdownSectionsEl.style.display = '';
    dropdownSectionList.innerHTML = '';
    const file = vaultFiles.find(f => f.path === ctx.filePath);
    const sections = file ? getFileSections(file) : [];
    if (sections.length === 0) {
      dropdownSectionList.innerHTML = '<span class="dropdown-empty">No sections in this file</span>';
    } else {
      for (const sec of sections) {
        const btn = document.createElement('button');
        btn.className = 'dropdown-section-item';
        btn.textContent = sec.title;
        btn.addEventListener('click', async () => {
          hideDropdown();
          if (mode === 'new-section' && pendingNewTodo) {
            // Set the target section then re-render and re-focus input
            pendingNewTodo.targetSection = sec;
            renderTodos();
            const input = todoListEl.querySelector('.new-todo-inline');
            if (input) { if (pendingNewTodo.savedText) input.value = pendingNewTodo.savedText; input.focus(); }
          } else {
            await moveTodoToSection(ctx.filePath, ctx.lineIndex, sec);
          }
        });
        dropdownSectionList.appendChild(btn);
      }
    }
    // Hide color swatches for new-section mode
    if (mode === 'new-section') dropdownSwatchesEl.parentElement.style.display = 'none';
  } else {
    dropdownSectionsEl.style.display = 'none';
  }

  // Position near anchor
  dropdownEl.style.display = 'block';
  const r = anchorEl.getBoundingClientRect();
  const ddW = 188;
  let left = r.right - ddW;
  let top  = r.bottom + 4;
  if (left < 8) left = 8;
  if (top + dropdownEl.offsetHeight > window.innerHeight - 8) top = r.top - dropdownEl.offsetHeight - 4;
  dropdownEl.style.left = left + 'px';
  dropdownEl.style.top  = top  + 'px';
}

function hideDropdown() {
  dropdownEl.style.display = 'none';
  dropdownContext = null;
  dropdownSwatchesEl.parentElement.style.display = ''; // restore if hidden
}

document.addEventListener('click', e => {
  if (dropdownEl.style.display === 'none') return;
  if (!dropdownEl.contains(e.target) && !e.target.closest('.more-btn') && !e.target.closest('.group-icon')) hideDropdown();
});

// ── Guide step state (localStorage) ───────────────────────────────────────
function getStepDone(filePath, lineIndex) {
  return localStorage.getItem(`stepDone::${filePath}::${lineIndex}`) === 'true';
}
function setStepDone(filePath, lineIndex, done) {
  const key = `stepDone::${filePath}::${lineIndex}`;
  if (done) localStorage.setItem(key, 'true');
  else localStorage.removeItem(key);
}

// Returns step headings from a wiki-linked guide file, or [] if none
function getLinkedSteps(todoText) {
  const links = [...todoText.matchAll(/\[\[([^\]]+)\]\]/g)].map(m => m[1].trim());
  for (const link of links) {
    const file = vaultFiles.find(f => stripMd(f.name).toLowerCase() === link.toLowerCase());
    if (!file) continue;
    const steps = file.content.split('\n').flatMap((line, lineIndex) => {
      const m = line.match(STEP_HEADING_RE);
      if (!m) return [];
      return [{ id: `${file.path}::step::${lineIndex}`, text: m[1].trim(), lineIndex, filePath: file.path, done: getStepDone(file.path, lineIndex) }];
    });
    if (steps.length > 0) return steps;
  }
  return [];
}

// ── Todo tree (parent + indented steps) ───────────────────────────────────
function buildTodoTree(todos) {
  const roots = [];
  let lastRoot = null;
  for (const todo of todos) {
    if (todo.indent.length === 0) {
      const node = { ...todo, children: [] };
      roots.push(node);
      lastRoot = node;
    } else if (lastRoot) {
      lastRoot.children.push(todo);
    }
  }
  return roots;
}

// ── Section helpers ────────────────────────────────────────────────────────
function getFileSections(file) {
  const lines = file.content.split('\n');
  const allHeadings = lines.flatMap((line, i) => {
    const m = line.match(/^(#{1,6})\s+(.+)$/);
    return m ? [{ level: m[1].length, title: m[2].trim(), lineIndex: i }] : [];
  });

  const parentRe = /^(todo|checklist)$/i;
  const result = [];

  for (let i = 0; i < allHeadings.length; i++) {
    const h = allHeadings[i];
    if (!parentRe.test(h.title)) continue;
    result.push(h); // include the TODO / Checklist heading itself
    for (let j = i + 1; j < allHeadings.length; j++) {
      if (allHeadings[j].level <= h.level) break;
      result.push(allHeadings[j]);
    }
  }

  return result;
}

async function moveTodoToSection(filePath, todoLineIndex, targetSection) {
  const file = vaultFiles.find(f => f.path === filePath);
  if (!file) return;
  const lines = file.content.split('\n');
  const todoLine = lines[todoLineIndex];

  let sectionEnd = lines.length;
  for (let i = targetSection.lineIndex + 1; i < lines.length; i++) {
    const m = lines[i].match(/^(#{1,6})\s/);
    if (m && m[1].length <= targetSection.level) { sectionEnd = i; break; }
  }
  let insertAt = sectionEnd;
  while (insertAt > targetSection.lineIndex + 1 && lines[insertAt - 1].trim() === '') insertAt--;

  const movedColor = todoColors.get(`${filePath}::${todoLineIndex}`);
  if (todoLineIndex < insertAt) {
    // Lines [todoLineIndex+1, insertAt-1] shift up by -1; moved line lands at insertAt-1
    for (let i = todoLineIndex + 1; i <= insertAt - 1; i++) {
      const c = todoColors.get(`${filePath}::${i}`);
      todoColors.delete(`${filePath}::${i}`);
      if (c) todoColors.set(`${filePath}::${i - 1}`, c);
      else todoColors.delete(`${filePath}::${i - 1}`);
    }
    todoColors.delete(`${filePath}::${todoLineIndex}`);
    if (movedColor) todoColors.set(`${filePath}::${insertAt - 1}`, movedColor);
    lines.splice(todoLineIndex, 1);
    lines.splice(insertAt - 1, 0, todoLine);
  } else {
    // Lines [insertAt, todoLineIndex-1] shift down by +1; moved line lands at insertAt
    for (let i = todoLineIndex - 1; i >= insertAt; i--) {
      const c = todoColors.get(`${filePath}::${i}`);
      todoColors.delete(`${filePath}::${i}`);
      if (c) todoColors.set(`${filePath}::${i + 1}`, c);
      else todoColors.delete(`${filePath}::${i + 1}`);
    }
    todoColors.delete(`${filePath}::${todoLineIndex}`);
    if (movedColor) todoColors.set(`${filePath}::${insertAt}`, movedColor);
    lines.splice(insertAt, 0, todoLine);
    lines.splice(todoLineIndex + 1, 1);
  }

  file.content = lines.join('\n');
  await save(file);
  renderSidebar();
  renderTodos();
}

async function reorderTodoBlock(filePath, fromLineIndex, toLineIndex) {
  if (fromLineIndex === toLineIndex) return;
  const file = vaultFiles.find(f => f.path === filePath);
  if (!file) return;

  const lines = file.content.split('\n');

  // Collect block: root todo + any immediately-following indented children
  let blockSize = 1;
  while (fromLineIndex + blockSize < lines.length) {
    const m = lines[fromLineIndex + blockSize].match(CHECKBOX_RE);
    if (m && m[1].length > 0) blockSize++;
    else break;
  }

  // toLineIndex == fromLineIndex or within the block → no-op
  if (toLineIndex > fromLineIndex && toLineIndex < fromLineIndex + blockSize) return;

  const block = lines.slice(fromLineIndex, fromLineIndex + blockSize);
  const newLines = [];

  if (toLineIndex > fromLineIndex) {
    for (let i = 0; i < fromLineIndex; i++) newLines.push(lines[i]);
    for (let i = fromLineIndex + blockSize; i < toLineIndex; i++) newLines.push(lines[i]);
    for (const l of block) newLines.push(l);
    for (let i = toLineIndex; i < lines.length; i++) newLines.push(lines[i]);
  } else {
    for (let i = 0; i < toLineIndex; i++) newLines.push(lines[i]);
    for (const l of block) newLines.push(l);
    for (let i = toLineIndex; i < fromLineIndex; i++) newLines.push(lines[i]);
    for (let i = fromLineIndex + blockSize; i < lines.length; i++) newLines.push(lines[i]);
  }

  // Remap color keys using the old→new index mapping
  const prefix = filePath + '::';
  const oldColors = new Map();
  for (const [key, color] of todoColors) {
    if (!key.startsWith(prefix)) continue;
    const idx = parseInt(key.slice(prefix.length), 10);
    if (!isNaN(idx)) oldColors.set(idx, color);
  }
  for (const key of [...todoColors.keys()]) {
    if (key.startsWith(prefix)) todoColors.delete(key);
  }
  for (const [oldIdx, color] of oldColors) {
    let newIdx;
    if (toLineIndex > fromLineIndex) {
      if (oldIdx < fromLineIndex) newIdx = oldIdx;
      else if (oldIdx < fromLineIndex + blockSize) newIdx = toLineIndex - blockSize + (oldIdx - fromLineIndex);
      else if (oldIdx < toLineIndex) newIdx = oldIdx - blockSize;
      else newIdx = oldIdx;
    } else {
      if (oldIdx < toLineIndex) newIdx = oldIdx;
      else if (oldIdx < fromLineIndex) newIdx = oldIdx + blockSize;
      else if (oldIdx < fromLineIndex + blockSize) newIdx = toLineIndex + (oldIdx - fromLineIndex);
      else newIdx = oldIdx;
    }
    todoColors.set(prefix + newIdx, color);
  }

  file.content = newLines.join('\n');
  await save(file);
  renderSidebar();
  renderTodos();
}

// ── Pointer-event drag (Y-only, RAF-throttled) ─────────────────────────────
function clearDragIndicators() {
  todoListEl.querySelectorAll('.drag-over-top, .drag-over-bottom, .drag-section-over').forEach(el => {
    el.classList.remove('drag-over-top', 'drag-over-bottom', 'drag-section-over');
  });
}

function initDrag(e, sourceItem, filePath, lineIndex) {
  e.preventDefault();
  const rect = sourceItem.getBoundingClientRect();
  const clone = sourceItem.cloneNode(true);
  clone.classList.add('drag-clone');
  // Position clone exactly over source; only Y will change
  clone.style.position   = 'fixed';
  clone.style.left       = rect.left + 'px';
  clone.style.top        = rect.top  + 'px';
  clone.style.width      = rect.width + 'px';
  clone.style.margin     = '0';
  clone.style.zIndex     = '9999';
  clone.style.pointerEvents = 'none';
  clone.style.transition = 'none';
  document.body.appendChild(clone);
  sourceItem.classList.add('dragging');

  // Determine source item's section so we never drop across section boundaries
  const sourceFile = vaultFiles.find(f => f.path === filePath);
  const sourceSection = sourceFile ? getTodoSectionTitle(lineIndex, sourceFile.content) : null;

  // Snapshot original positions + sections before any margin animations run,
  // so hit-testing never reacts to its own layout changes.
  const snapshots = [...todoListEl.querySelectorAll('.todo-item:not(.new-todo-row):not(.todo-step)')]
    .map(el => {
      const r = el.getBoundingClientRect();
      const elLine = parseInt(el.dataset.line, 10);
      const elFile = el.dataset.file;
      const elFileObj = elFile === filePath ? sourceFile : vaultFiles.find(f => f.path === elFile);
      const section = elFileObj ? getTodoSectionTitle(elLine, elFileObj.content) : null;
      return { el, top: r.top, bottom: r.bottom, filePath: elFile, section };
    });

  // Snapshot section headers so hovering one intentionally triggers a cross-section drop
  const sectionSnapshots = [];
  todoListEl.querySelectorAll('.section-sub-header').forEach(el => {
    const key = el.dataset.sectionKey;
    const sep = key.indexOf('::');
    const headerFilePath = key.slice(0, sep);
    const sectionTitle = key.slice(sep + 2);
    const headerFile = vaultFiles.find(f => f.path === headerFilePath);
    if (!headerFile) return;
    const section = getFileSections(headerFile).find(s => s.title === sectionTitle);
    if (!section) return;
    const r = el.getBoundingClientRect();
    sectionSnapshots.push({ el, top: r.top, bottom: r.bottom, filePath: headerFilePath, sectionTitle, section });
  });

  todoListEl.classList.add('dragging-active');

  dragState = {
    filePath, fromLineIndex: lineIndex,
    sourceItem, cloneEl: clone,
    startMouseY: e.clientY, cloneStartY: rect.top,
    currentTarget: null, currentInsertBefore: null,
    currentSectionTarget: null,
    snapshots, sectionSnapshots, sourceSection
  };

  document.addEventListener('pointermove', onDragPointerMove);
  document.addEventListener('pointerup',   onDragPointerUp,  { once: true });
  document.addEventListener('pointercancel', onDragCancel,   { once: true });
}

function onDragPointerMove(e) {
  if (!dragState) return;
  lastMoveEvent = e;
  if (dragRafId) return;
  dragRafId = requestAnimationFrame(() => {
    dragRafId = null;
    if (!dragState || !lastMoveEvent) return;
    const ev = lastMoveEvent;

    // Move clone on Y axis only
    dragState.cloneEl.style.top = (dragState.cloneStartY + (ev.clientY - dragState.startMouseY)) + 'px';

    const mouseY = ev.clientY;

    // Check section headers first — hovering one intentionally triggers a cross-section drop
    const hoveredSection = dragState.sectionSnapshots.find(
      s => s.filePath === dragState.filePath &&
           s.sectionTitle !== dragState.sourceSection &&
           mouseY >= s.top && mouseY <= s.bottom
    ) ?? null;

    if (hoveredSection !== dragState.currentSectionTarget) {
      clearDragIndicators();
      dragState.currentSectionTarget = hoveredSection;
      dragState.currentTarget = null;
      if (hoveredSection) hoveredSection.el.classList.add('drag-section-over');
    }

    if (hoveredSection) return; // section header is active — skip item hit-testing

    // Use frozen snapshot positions so margin animations don't affect hit-testing.
    // Restrict to the same section so the cursor can't fall through to the next one.
    const candidates = dragState.snapshots.filter(
      s => s.filePath === dragState.filePath &&
           s.el !== dragState.sourceItem &&
           s.section === dragState.sourceSection
    );

    // Gap moves to BEFORE the first item whose original bottom hasn't been crossed yet.
    let newTarget = null;
    let newInsertBefore = true;
    for (const snap of candidates) {
      if (mouseY < snap.bottom) { newTarget = snap.el; newInsertBefore = true; break; }
    }
    if (!newTarget && candidates.length > 0) {
      newTarget = candidates[candidates.length - 1].el;
      newInsertBefore = false;
    }

    if (newTarget !== dragState.currentTarget || newInsertBefore !== dragState.currentInsertBefore) {
      clearDragIndicators();
      dragState.currentTarget       = newTarget;
      dragState.currentInsertBefore = newInsertBefore;
      if (newTarget) newTarget.classList.add(newInsertBefore ? 'drag-over-top' : 'drag-over-bottom');
    }
  });
}

async function onDragPointerUp() {
  document.removeEventListener('pointermove', onDragPointerMove);
  document.removeEventListener('pointercancel', onDragCancel);
  if (dragRafId) { cancelAnimationFrame(dragRafId); dragRafId = null; }
  lastMoveEvent = null;
  if (!dragState) return;

  const { sourceItem, cloneEl, currentTarget, currentInsertBefore, currentSectionTarget, filePath, fromLineIndex } = dragState;
  dragState = null;
  cloneEl.remove();
  sourceItem.classList.remove('dragging');
  todoListEl.classList.remove('dragging-active');
  clearDragIndicators();

  // Cross-section drop: append to the target section
  if (currentSectionTarget?.section) {
    await moveTodoToSection(filePath, fromLineIndex, currentSectionTarget.section);
    return;
  }

  if (!currentTarget) return;

  const targetLineIndex = parseInt(currentTarget.dataset.line, 10);
  let toLineIndex;
  if (currentInsertBefore) {
    toLineIndex = targetLineIndex;
  } else {
    const targetFile = vaultFiles.find(f => f.path === filePath);
    if (!targetFile) return;
    const tLines = targetFile.content.split('\n');
    toLineIndex = targetLineIndex + 1;
    while (toLineIndex < tLines.length) {
      const m = tLines[toLineIndex].match(CHECKBOX_RE);
      if (m && m[1].length > 0) toLineIndex++;
      else break;
    }
  }

  await reorderTodoBlock(filePath, fromLineIndex, toLineIndex);
}

function onDragCancel() {
  document.removeEventListener('pointermove', onDragPointerMove);
  document.removeEventListener('pointerup', onDragPointerUp);
  if (dragRafId) { cancelAnimationFrame(dragRafId); dragRafId = null; }
  lastMoveEvent = null;
  if (dragState) {
    dragState.cloneEl.remove();
    dragState.sourceItem.classList.remove('dragging');
    todoListEl.classList.remove('dragging-active');
    clearDragIndicators();
    dragState = null;
  }
}

const ribbonFilesBtn  = document.getElementById('ribbon-files');
const ribbonTagsBtn   = document.getElementById('ribbon-tags');
const sectionFiles    = document.getElementById('section-files');
const sectionTags     = document.getElementById('section-tags');
const sidebarEl       = document.querySelector('.sidebar');

// ── Ribbon panel switching ─────────────────────────────────────────────────
let currentPanel = 'files'; // 'files' | 'tags' | null (collapsed)

function setSidebarPanel(panel) {
  currentPanel = panel;
  if (panel === null) {
    sidebarEl.classList.add('collapsed');
    ribbonFilesBtn.classList.remove('active');
    ribbonTagsBtn.classList.remove('active');
    return;
  }
  sidebarEl.classList.remove('collapsed');
  const showFiles = panel === 'files';
  ribbonFilesBtn.classList.toggle('active', showFiles);
  ribbonTagsBtn.classList.toggle('active', !showFiles);
  sectionFiles.classList.toggle('hidden', !showFiles);
  sectionTags.classList.toggle('hidden', showFiles);
}

ribbonFilesBtn.addEventListener('click', () => {
  setSidebarPanel(currentPanel === 'files' && !sidebarEl.classList.contains('collapsed') ? null : 'files');
});

ribbonTagsBtn.addEventListener('click', () => {
  setSidebarPanel(currentPanel === 'tags' && !sidebarEl.classList.contains('collapsed') ? null : 'tags');
});

// ── Sidebar section collapse ───────────────────────────────────────────────
document.getElementById('section-header-files').addEventListener('click', () => {
  sectionFiles.classList.toggle('collapsed');
});

document.getElementById('section-header-tags').addEventListener('click', () => {
  sectionTags.classList.toggle('collapsed');
});

// ── Markdown helpers ───────────────────────────────────────────────────────
const CHECKBOX_RE = /^(\s*)-\s+\[([ xX])\]\s+(.+)$/;
const STEP_HEADING_RE = /^#{1,6}\s+(Step\s+\d+\b.*)$/i;

function parseTodos(file) {
  return file.content.split('\n').flatMap((line, lineIndex) => {
    const m = line.match(CHECKBOX_RE);
    if (!m) return [];
    const text = m[3].trim();
    return [{
      id: `${file.path}::${lineIndex}`,
      text,
      done: m[2] !== ' ',
      tags: (text.match(/#[\w-]+/g) || []).map(t => t.slice(1)),
      filePath: file.path,
      lineIndex,
      indent: m[1]
    }];
  });
}

function setTodoDone(fileContent, lineIndex, done) {
  const lines = fileContent.split('\n');
  lines[lineIndex] = lines[lineIndex].replace(/\[([ xX])\]/, done ? '[x]' : '[ ]');
  return lines.join('\n');
}

function setTodoText(fileContent, lineIndex, newText) {
  const lines = fileContent.split('\n');
  lines[lineIndex] = lines[lineIndex].replace(CHECKBOX_RE, (_, indent, check, _old) =>
    `${indent}- [${check}] ${newText}`
  );
  return lines.join('\n');
}

function deleteTodoLine(fileContent, lineIndex) {
  const lines = fileContent.split('\n');
  lines.splice(lineIndex, 1);
  return lines.join('\n');
}

function appendTodo(fileContent, text) {
  const lines = fileContent.split('\n');

  // Find a heading named TODO (any level)
  const todoHeadingRe = /^(#{1,6})\s+TODO\s*$/i;
  let todoLineIndex = -1;
  let todoLevel = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(todoHeadingRe);
    if (m) { todoLineIndex = i; todoLevel = m[1].length; break; }
  }

  if (todoLineIndex === -1) {
    // No TODO section — append at end of file
    return fileContent.trimEnd() + '\n- [ ] ' + text + '\n';
  }

  // Find where the TODO section ends (next heading of same or higher level)
  let sectionEnd = lines.length;
  for (let i = todoLineIndex + 1; i < lines.length; i++) {
    const m = lines[i].match(/^(#{1,6})\s/);
    if (m && m[1].length <= todoLevel) { sectionEnd = i; break; }
  }

  // Step back over any trailing blank lines inside the section
  let insertAt = sectionEnd;
  while (insertAt > todoLineIndex + 1 && lines[insertAt - 1].trim() === '') insertAt--;

  lines.splice(insertAt, 0, '- [ ] ' + text);
  return { content: lines.join('\n'), insertAt };
}

function insertStep(fileContent, parentLineIndex, stepText) {
  const lines = fileContent.split('\n');
  let insertAt = parentLineIndex + 1;
  let stepCount = 0;
  while (insertAt < lines.length) {
    const m = lines[insertAt].match(CHECKBOX_RE);
    if (m && m[1].length > 0) { stepCount++; insertAt++; }
    else break;
  }
  lines.splice(insertAt, 0, `  - [ ] Step ${stepCount + 1} — ${stepText}`);
  return { content: lines.join('\n'), insertAt };
}

// ── Recent vaults (localStorage) ──────────────────────────────────────────
function getRecentVaults() {
  try { return JSON.parse(localStorage.getItem('recentVaults') || '[]'); }
  catch { return []; }
}

function addRecentVault(folderPath) {
  const list = getRecentVaults().filter(p => p !== folderPath);
  list.unshift(folderPath);
  localStorage.setItem('recentVaults', JSON.stringify(list.slice(0, 5)));
}

function renderRecentVaults() {
  const listEl = document.getElementById('recent-vaults-list');
  if (!listEl) return;
  const recents = getRecentVaults();
  if (recents.length === 0) {
    listEl.innerHTML = '<div class="recent-empty">No recent vaults</div>';
  } else {
    listEl.innerHTML = recents.map(p => {
      const name = p.split(/[\\/]/).pop();
      return `<div class="recent-vault-item" data-path="${escHtml(p)}">
        <span class="recent-vault-name">${escHtml(name)}</span>
        <span class="recent-vault-path">${escHtml(p)}</span>
      </div>`;
    }).join('');
    listEl.querySelectorAll('.recent-vault-item').forEach(item => {
      item.addEventListener('click', () => openVaultByPath(item.dataset.path));
    });
  }
  listEl.style.display = 'block';
}

// ── Vault operations ───────────────────────────────────────────────────────
async function openVault() {
  const folder = await window.vault.openVault();
  if (!folder) return;
  addRecentVault(folder);
  await openVaultByPath(folder);
}

async function openVaultByPath(folderPath) {
  vaultPath = folderPath;
  const vaultBaseName = folderPath.split(/[\\/]/).pop();
  vaultNameEl.textContent = vaultBaseName;
  titlebarVaultEl.textContent = vaultBaseName;
  await refreshVault();
  enableUI();
}

async function refreshVault() {
  const result = await window.vault.readVault(vaultPath);
  if (result.error) { alert('Error reading vault: ' + result.error); return; }
  vaultFiles = result;
  renderTabs();
  renderSidebar();
  renderTodos();
}

function enableUI() {
  newFileBtn.disabled = false;
}

// ── Status bar ─────────────────────────────────────────────────────────────
function updateStatusBar() {
  if (!vaultPath) {
    statusVaultLabel.textContent = 'No vault open';
    statusTodoCount.textContent = '';
    return;
  }
  statusVaultLabel.textContent = vaultPath.split(/[\\/]/).pop();
  const all = vaultFiles.flatMap(parseTodos);
  const active = all.filter(t => !t.done).length;
  statusTodoCount.textContent = `${active} active · ${all.length} total`;
}

// ── Sidebar rendering ──────────────────────────────────────────────────────
function renderSidebar() {
  const allTodos = vaultFiles.flatMap(parseTodos);

  // File list
  fileListEl.innerHTML = '';

  const allLi = document.createElement('li');
  const allCount = allTodos.filter(t => !t.done).length;
  allLi.innerHTML = `
    <span class="file-icon"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/></svg></span>
    <span class="file-label">All files</span>
    <span class="todo-badge">${allCount}</span>`;
  allLi.classList.toggle('active', getActiveFilePath() === null);
  allLi.addEventListener('click', () => { activeTabId = 'all'; renderTabs(); renderSidebar(); renderTodos(); });
  fileListEl.appendChild(allLi);

  for (const file of vaultFiles) {
    const count = parseTodos(file).filter(t => !t.done).length;
    const li = document.createElement('li');
    li.title = file.relativePath;
    li.innerHTML = `
      <span class="file-icon"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></span>
      <span class="file-label">${escHtml(stripMd(file.name))}</span>
      <span class="todo-badge">${count}</span>`;
    li.classList.toggle('active', file.path === getActiveFilePath());
    li.addEventListener('click', () => openFileTab(file));
    fileListEl.appendChild(li);
  }

  // Tags
  const allTags = [...new Set(allTodos.flatMap(t => t.tags))].sort();
  tagListEl.innerHTML = '';
  if (allTags.length === 0) {
    tagListEl.innerHTML = '<span style="font-size:11px;color:var(--text-muted)">No tags yet</span>';
  } else {
    const clearChip = document.createElement('span');
    clearChip.className = 'tag-chip' + (activeTag === null ? ' active' : '');
    clearChip.textContent = 'All';
    clearChip.addEventListener('click', () => { activeTag = null; renderSidebar(); renderTodos(); });
    tagListEl.appendChild(clearChip);

    for (const tag of allTags) {
      const chip = document.createElement('span');
      chip.className = 'tag-chip' + (activeTag === tag ? ' active' : '');
      chip.textContent = '#' + tag;
      chip.addEventListener('click', () => { activeTag = tag; renderSidebar(); renderTodos(); });
      tagListEl.appendChild(chip);
    }
  }
}

// ── Todo rendering ─────────────────────────────────────────────────────────
function renderTodos() {
  updateStatusBar();

  if (vaultFiles.length === 0) {
    todoListEl.innerHTML = '<div class="empty-state"><p>No <code>.md</code> files found in this vault.</p></div>';
    todoCountEl.textContent = '';
    return;
  }

  const activeFilePath = getActiveFilePath();
  const filesToShow = activeFilePath
    ? vaultFiles.filter(f => f.path === activeFilePath)
    : vaultFiles;

  const q = searchQuery.toLowerCase();
  let shown = 0;
  let html = '';

  for (const file of filesToShow) {
    const todos = parseTodos(file).filter(todo => {
      if (statusFilter === 'active' && todo.done) return false;
      if (statusFilter === 'done' && !todo.done) return false;
      if (activeTag && !todo.tags.includes(activeTag)) return false;
      if (q && !todo.text.toLowerCase().includes(q)) return false;
      return true;
    });

    if (todos.length === 0) continue;
    shown += todos.length;

    const isCollapsed = collapsedGroups.has(file.path);
    html += `<div class="file-group" data-file="${escHtml(file.path)}">`;
    const iconColor = fileIconColors.get(file.path) || 'var(--purple)';
    html += `<div class="file-group-header" data-file="${escHtml(file.path)}">
      <span class="group-arrow${isCollapsed ? ' collapsed' : ''}">
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
      </span>
      <span class="group-icon" data-file="${escHtml(file.path)}" style="color:${iconColor}" title="Change color">◈</span>
      <span class="group-name">${escHtml(stripMd(file.relativePath))}</span>
      <span class="group-count">${todos.length}</span>
      <button class="group-add-btn" data-file="${escHtml(file.path)}" title="Add todo">
        <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      </button>
    </div>`;
    html += `<div class="file-group-todos${isCollapsed ? ' hidden' : ''}">`;

    // Group todos by section for collapsible sections
    const sectionGroups = [];
    let curGroup = null;
    for (const todo of todos) {
      const section = getTodoSectionTitle(todo.lineIndex, file.content);
      if (!curGroup || section !== curGroup.title) {
        curGroup = { title: section, todos: [] };
        sectionGroups.push(curGroup);
      }
      curGroup.todos.push(todo);
    }

    for (const group of sectionGroups) {
      const sectionKey = `${file.path}::${group.title ?? ''}`;
      const isSectionCollapsed = !!group.title && collapsedSections.has(sectionKey);

      if (group.title) {
        html += `<div class="section-group">
          <div class="section-sub-header" data-section-key="${escHtml(sectionKey)}">
            <span class="section-sub-arrow${isSectionCollapsed ? ' collapsed' : ''}">
              <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
            </span>
            ${escHtml(group.title)}
          </div>
          <div class="section-todos${isSectionCollapsed ? ' hidden' : ''}">`;
      }

      for (const node of buildTodoTree(group.todos)) {
        const hasPendingStep = pendingNewStep?.filePath === node.filePath && pendingNewStep?.parentLineIndex === node.lineIndex;
        const linkedSteps = getLinkedSteps(node.text);
        const hasSteps = node.children.length > 0 || hasPendingStep || linkedSteps.length > 0;
        const stepsCollapsed = collapsedSteps.has(node.id) && !hasPendingStep;
        const textNoTags = node.text.replace(/#[\w-]+/g, '').trim();
        const tagsHtml = node.tags.map(t => `<span class="todo-tag">#${escHtml(t)}</span>`).join('');
        const todoColor = todoColors.get(node.id);

        if (hasSteps) html += `<div class="todo-with-steps">`;

        html += `
          <div class="todo-item${node.done ? ' done' : ''}" data-id="${escHtml(node.id)}" data-file="${escHtml(node.filePath)}" data-line="${node.lineIndex}" style="${todoColor ? `border-left-color:${todoColor}` : ''}">
            ${hasSteps ? `<span class="steps-chevron${stepsCollapsed ? ' collapsed' : ''}" data-parent-id="${escHtml(node.id)}" title="${stepsCollapsed ? 'Expand' : 'Collapse'} steps"><svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg></span>` : ''}
            <input type="checkbox" class="todo-checkbox" ${node.done ? 'checked' : ''} />
            <div class="todo-body">
              <div class="todo-text">${renderTodoText(textNoTags)}</div>
              ${tagsHtml ? `<div class="todo-tags">${tagsHtml}</div>` : ''}
            </div>
            <div class="todo-actions">
              <button class="btn-icon add-step-btn" data-file="${escHtml(node.filePath)}" data-line="${node.lineIndex}" data-parent-id="${escHtml(node.id)}" title="Add step">↳</button>
              <button class="btn-icon edit-btn" title="Edit">✎</button>
              <button class="btn-icon more-btn" title="Color / Move">⋯</button>
              <button class="btn-icon danger delete-btn" title="Delete">✕</button>
            </div>
          </div>`;

        if (hasSteps) {
          html += `<div class="todo-steps${stepsCollapsed ? ' hidden' : ''}">`;
          for (const child of node.children) {
            const childText = child.text.replace(/#[\w-]+/g, '').trim();
            const childTags = child.tags.map(t => `<span class="todo-tag">#${escHtml(t)}</span>`).join('');
            const childColor = todoColors.get(child.id);
            html += `
              <div class="todo-item todo-step${child.done ? ' done' : ''}" data-id="${escHtml(child.id)}" data-file="${escHtml(child.filePath)}" data-line="${child.lineIndex}" data-parent-id="${escHtml(node.id)}" style="${childColor ? `border-left-color:${childColor}` : ''}">
                <input type="checkbox" class="todo-checkbox" ${child.done ? 'checked' : ''} />
                <div class="todo-body">
                  <div class="todo-text">${renderTodoText(childText)}</div>
                  ${childTags ? `<div class="todo-tags">${childTags}</div>` : ''}
                </div>
                <div class="todo-actions">
                  <button class="btn-icon edit-btn" title="Edit">✎</button>
                  <button class="btn-icon more-btn" title="Color / Move">⋯</button>
                  <button class="btn-icon danger delete-btn" title="Delete">✕</button>
                </div>
              </div>`;
          }
          for (const step of linkedSteps) {
            html += `
              <div class="todo-item todo-step todo-linked-step${step.done ? ' done' : ''}" data-id="${escHtml(step.id)}" data-step-file="${escHtml(step.filePath)}" data-step-line="${step.lineIndex}">
                <input type="checkbox" class="todo-checkbox linked-step-checkbox" ${step.done ? 'checked' : ''} />
                <div class="todo-body">
                  <div class="todo-text">${escHtml(step.text)}</div>
                </div>
              </div>`;
          }

          if (hasPendingStep) {
            const stepN = node.children.length + 1;
            html += `
              <div class="todo-item todo-step new-todo-row">
                <input type="checkbox" class="todo-checkbox" disabled />
                <div class="todo-body new-step-body">
                  <span class="step-prefix-label">Step ${stepN} —</span>
                  <input type="text" class="todo-text-edit new-step-inline" placeholder="description… Enter to save · Esc to cancel" />
                </div>
              </div>`;
          }
          html += `</div></div>`;
        }
      }

      if (group.title) {
        html += `</div></div>`;
      }
    }

    if (pendingNewTodo && pendingNewTodo.filePath === file.path) {
      html += `
        <div class="todo-item new-todo-row">
          <input type="checkbox" class="todo-checkbox" disabled />
          <div class="todo-body">
            <input type="text" class="todo-text-edit new-todo-inline" placeholder="New todo… Enter to save · Esc to cancel" />
          </div>
          <div class="todo-actions todo-actions-visible">
            <button class="btn-icon new-todo-more-btn" data-file="${escHtml(file.path)}" title="Choose section">⋯</button>
          </div>
        </div>`;
    }

    html += '</div></div>';
  }

  if (html === '') {
    todoListEl.innerHTML = '<div class="empty-state"><p>No todos match the current filter.</p></div>';
  } else {
    todoListEl.innerHTML = html;
    attachTodoHandlers();
  }

  todoCountEl.textContent = `${shown} todo${shown !== 1 ? 's' : ''}`;
}

function attachTodoHandlers() {
  todoListEl.querySelectorAll('.file-group-header').forEach(header => {
    // ◈ icon → color picker
    header.querySelector('.group-icon').addEventListener('click', e => {
      e.stopPropagation();
      showDropdown(e.currentTarget, 'icon', { filePath: e.currentTarget.dataset.file });
    });

    // + button → open inline new-todo input
    header.querySelector('.group-add-btn').addEventListener('click', e => {
      e.stopPropagation();
      const filePath = e.currentTarget.dataset.file;
      collapsedGroups.delete(filePath); // expand if collapsed
      pendingNewTodo = { filePath };
      renderTodos();
      const input = todoListEl.querySelector('.new-todo-inline');
      if (input) input.focus();
    });

    // rest of header → collapse toggle
    header.addEventListener('click', e => {
      if (e.target.closest('.group-icon') || e.target.closest('.group-add-btn')) return;
      const filePath = header.dataset.file;
      const todosEl = header.nextElementSibling;
      const arrow = header.querySelector('.group-arrow');
      if (!todosEl || !arrow) return;
      if (collapsedGroups.has(filePath)) {
        collapsedGroups.delete(filePath);
        arrow.classList.remove('collapsed');
        todosEl.classList.remove('hidden');
      } else {
        collapsedGroups.add(filePath);
        arrow.classList.add('collapsed');
        todosEl.classList.add('hidden');
      }
    });
  });

  // Linked guide step checkboxes (state in localStorage, guide file unchanged)
  todoListEl.querySelectorAll('.linked-step-checkbox').forEach(cb => {
    cb.addEventListener('change', e => {
      const item = cb.closest('.todo-linked-step');
      setStepDone(item.dataset.stepFile, parseInt(item.dataset.stepLine, 10), e.target.checked);
      if (e.target.checked) {
        const stepsEl = item.closest('.todo-steps');
        const allDone = stepsEl && [...stepsEl.querySelectorAll('.todo-checkbox')].filter(c => !c.disabled).every(c => c.checked);
        if (allDone) {
          const parentId = stepsEl.closest('.todo-with-steps')?.querySelector('.todo-item:not(.todo-step)')?.dataset.id;
          if (parentId) collapsedSteps.add(parentId);
        }
      }
      renderTodos();
    });
  });

  // Add step button — inserts indented step below the parent todo
  todoListEl.querySelectorAll('.add-step-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const filePath = btn.dataset.file;
      const parentLineIndex = parseInt(btn.dataset.line, 10);
      collapsedSteps.delete(btn.dataset.parentId); // expand if collapsed
      pendingNewStep = { filePath, parentLineIndex };
      renderTodos();
      const input = todoListEl.querySelector('.new-step-inline');
      if (input) input.focus();
    });
  });

  // Inline new-step input
  const stepInput = todoListEl.querySelector('.new-step-inline');
  if (stepInput) {
    const commitStep = async () => {
      if (!pendingNewStep) return;
      const text = stepInput.value.trim();
      if (text) {
        const file = vaultFiles.find(f => f.path === pendingNewStep.filePath);
        if (file) {
          const { content, insertAt } = insertStep(file.content, pendingNewStep.parentLineIndex, text);
          shiftColorKeys(file.path, insertAt, 1);
          file.content = content;
          await save(file);
        }
      }
      pendingNewStep = null;
      renderSidebar();
      renderTodos();
    };
    stepInput.addEventListener('keydown', async e => {
      if (e.key === 'Enter') { e.preventDefault(); await commitStep(); }
      if (e.key === 'Escape') { pendingNewStep = null; renderTodos(); }
    });
    stepInput.addEventListener('blur', () => {
      setTimeout(async () => { if (pendingNewStep) await commitStep(); }, 200);
    });
  }

  // Steps chevron — toggle collapse without full re-render
  todoListEl.querySelectorAll('.steps-chevron').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const parentId = btn.dataset.parentId;
      const stepsEl = btn.closest('.todo-with-steps')?.querySelector('.todo-steps');
      if (collapsedSteps.has(parentId)) {
        collapsedSteps.delete(parentId);
        btn.classList.remove('collapsed');
        if (stepsEl) stepsEl.classList.remove('hidden');
      } else {
        collapsedSteps.add(parentId);
        btn.classList.add('collapsed');
        if (stepsEl) stepsEl.classList.add('hidden');
      }
    });
  });

  // Step items — checkbox uses toggleStep (auto-collapses when all done)
  todoListEl.querySelectorAll('.todo-step:not(.todo-linked-step)').forEach(item => {
    const filePath = item.dataset.file;
    const lineIndex = parseInt(item.dataset.line, 10);
    const parentId = item.dataset.parentId;

    item.querySelector('.todo-checkbox').addEventListener('change', async e => {
      await toggleStep(filePath, lineIndex, e.target.checked, parentId);
    });
    item.querySelector('.edit-btn').addEventListener('click', () => startEditTodo(item, filePath, lineIndex));
    item.querySelector('.more-btn').addEventListener('click', e => {
      e.stopPropagation();
      showDropdown(e.currentTarget, 'todo', { todoId: item.dataset.id, filePath, lineIndex });
    });
    item.querySelector('.delete-btn').addEventListener('click', async () => deleteTodo(filePath, lineIndex));
    item.querySelectorAll('.wiki-link').forEach(linkEl => {
      linkEl.addEventListener('click', e => { e.stopPropagation(); window.vault.openObsidianFile(vaultPath, linkEl.dataset.link); });
    });
  });

  // Section collapse toggles
  todoListEl.querySelectorAll('.section-sub-header').forEach(header => {
    header.addEventListener('click', () => {
      const key = header.dataset.sectionKey;
      const todosEl = header.nextElementSibling;
      const arrow = header.querySelector('.section-sub-arrow');
      if (collapsedSections.has(key)) {
        collapsedSections.delete(key);
        arrow.classList.remove('collapsed');
        todosEl.classList.remove('hidden');
      } else {
        collapsedSections.add(key);
        arrow.classList.add('collapsed');
        todosEl.classList.add('hidden');
      }
    });
  });

  // Inline new-todo input
  const inlineInput = todoListEl.querySelector('.new-todo-inline');
  if (inlineInput) {
    const commitNewTodo = async () => {
      if (!pendingNewTodo) return;
      const text = inlineInput.value.trim();
      if (text) {
        const file = vaultFiles.find(f => f.path === pendingNewTodo.filePath);
        if (file) {
          if (pendingNewTodo.targetSection) {
            const { content, insertAt } = appendTodo(file.content, text);
            shiftColorKeys(file.path, insertAt, 1);
            file.content = content;
            await save(file);
            // reload content then move to chosen section
            const fresh = vaultFiles.find(f => f.path === pendingNewTodo.filePath);
            const todos = parseTodos(fresh);
            const newTodo = todos[todos.length - 1]; // last appended
            if (newTodo) await moveTodoToSection(fresh.path, newTodo.lineIndex, pendingNewTodo.targetSection);
          } else {
            const { content, insertAt } = appendTodo(file.content, text);
            shiftColorKeys(file.path, insertAt, 1);
            file.content = content;
            await save(file);
          }
        }
      }
      pendingNewTodo = null;
      renderSidebar();
      renderTodos();
    };
    inlineInput.addEventListener('keydown', async e => {
      if (e.key === 'Enter') { e.preventDefault(); await commitNewTodo(); }
      if (e.key === 'Escape') { pendingNewTodo = null; renderTodos(); }
    });
    inlineInput.addEventListener('blur', () => {
      // Delay so ⋯ button clicks register before blur fires
      setTimeout(async () => { if (pendingNewTodo) await commitNewTodo(); }, 200);
    });

    // ⋯ on the new-todo row → section picker only (no color)
    const moreBtn = todoListEl.querySelector('.new-todo-more-btn');
    if (moreBtn) {
      moreBtn.addEventListener('click', e => {
        e.stopPropagation();
        if (pendingNewTodo) pendingNewTodo.savedText = inlineInput.value;
        showDropdown(e.currentTarget, 'new-section', { filePath: moreBtn.dataset.file });
      });
    }
  }

  // Regular todo items (skip new-todo-row and steps — steps have their own handlers above)
  todoListEl.querySelectorAll('.todo-item:not(.new-todo-row):not(.todo-step)').forEach(item => {
    const filePath = item.dataset.file;
    const lineIndex = parseInt(item.dataset.line, 10);

    item.querySelector('.todo-checkbox').addEventListener('change', async e => {
      await toggleTodo(filePath, lineIndex, e.target.checked);
    });

    item.querySelector('.edit-btn').addEventListener('click', () => {
      startEditTodo(item, filePath, lineIndex);
    });

    item.querySelector('.more-btn').addEventListener('click', e => {
      e.stopPropagation();
      showDropdown(e.currentTarget, 'todo', { todoId: item.dataset.id, filePath, lineIndex });
    });

    item.querySelector('.delete-btn').addEventListener('click', async () => {
      await deleteTodo(filePath, lineIndex);
    });

    item.querySelectorAll('.wiki-link').forEach(linkEl => {
      linkEl.addEventListener('click', e => {
        e.stopPropagation();
        window.vault.openObsidianFile(vaultPath, linkEl.dataset.link);
      });
    });

    item.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      if (e.target.closest('button, input, a, .wiki-link, .steps-chevron')) return;
      initDrag(e, item, filePath, lineIndex);
    });
  });
}

// ── Todo mutations ─────────────────────────────────────────────────────────
async function toggleTodo(filePath, lineIndex, done) {
  const file = vaultFiles.find(f => f.path === filePath);
  if (!file) return;
  file.content = setTodoDone(file.content, lineIndex, done);
  await save(file);
  renderSidebar();
  renderTodos();
}

async function toggleStep(filePath, lineIndex, done, parentId) {
  const file = vaultFiles.find(f => f.path === filePath);
  if (!file) return;
  file.content = setTodoDone(file.content, lineIndex, done);
  await save(file);
  if (parentId) {
    const tree = buildTodoTree(parseTodos(file));
    const parentNode = tree.find(n => n.id === parentId);
    if (parentNode && parentNode.children.length > 0 && parentNode.children.every(c => c.done)) {
      collapsedSteps.add(parentId);
    }
  }
  renderSidebar();
  renderTodos();
}

async function deleteTodo(filePath, lineIndex) {
  const file = vaultFiles.find(f => f.path === filePath);
  if (!file) return;
  shiftColorKeys(filePath, lineIndex, -1);
  file.content = deleteTodoLine(file.content, lineIndex);
  await save(file);
  renderSidebar();
  renderTodos();
}

function startEditTodo(item, filePath, lineIndex) {
  const textEl = item.querySelector('.todo-text');
  if (!textEl) return; // already in edit mode
  const currentText = textEl.textContent;
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'todo-text-edit';
  input.value = currentText;
  textEl.replaceWith(input);
  input.focus();

  const finish = async () => {
    const newText = input.value.trim();
    if (newText && newText !== currentText) {
      const file = vaultFiles.find(f => f.path === filePath);
      if (file) {
        const todo = parseTodos(file).find(t => t.lineIndex === lineIndex);
        const plainText = newText.replace(/#[\w-]+/g, '').trim();
        const allTags = [
          ...new Set([
            ...(todo ? todo.tags : []),
            ...(newText.match(/#[\w-]+/g) || []).map(t => t.slice(1))
          ])
        ];
        const fullText = plainText + allTags.map(t => ' #' + t).join('');
        file.content = setTodoText(file.content, lineIndex, fullText);
        await save(file);
      }
    }
    renderSidebar();
    renderTodos();
  };

  input.addEventListener('blur', finish);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
    if (e.key === 'Escape') { renderTodos(); }
  });
}

let isSaving = false;

async function save(file) {
  isSaving = true;
  try {
    const result = await window.vault.writeFile(file.path, file.content);
    if (result.error) alert('Save error: ' + result.error);
  } finally {
    isSaving = false;
  }
}

// ── New file ───────────────────────────────────────────────────────────────
async function createNewFile() {
  const name = prompt('New file name (without .md):');
  if (!name || !name.trim()) return;
  const result = await window.vault.createFile(vaultPath, name.trim());
  if (result.error) { alert('Error: ' + result.error); return; }
  vaultFiles.push({ name: result.name, relativePath: result.relativePath, path: result.path, content: `# ${name.trim()}\n\n` });
  renderSidebar();
  renderTodos();
}

// ── Utility ────────────────────────────────────────────────────────────────
function stripMd(name) {
  return name.replace(/\.md$/i, '');
}

function getTodoSectionTitle(lineIndex, fileContent) {
  const lines = fileContent.split('\n');
  let section = null;
  for (let i = 0; i < lineIndex; i++) {
    const m = lines[i].match(/^#{1,6}\s+(.+)$/);
    if (m) section = m[1].trim();
  }
  return section;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderTodoText(text) {
  const parts = text.split(/(\[\[[^\]]+\]\])/g);
  return parts.map(part => {
    const m = part.match(/^\[\[([^\]]+)\]\]$/);
    if (m) {
      const link = m[1].trim();
      return `<span class="wiki-link" data-link="${escHtml(link)}" title="Open in Obsidian: ${escHtml(link)}">${escHtml(link)}</span>`;
    }
    return escHtml(part);
  }).join('');
}

// ── Auto-refresh on window focus (picks up Obsidian / external edits) ─────
window.addEventListener('focus', () => {
  if (vaultPath && !pendingNewTodo && !pendingNewStep && !isSaving && !dragState) refreshVault();
});

// ── Event listeners ────────────────────────────────────────────────────────
openVaultBtn.addEventListener('click', openVault);
if (openVaultBtn2) openVaultBtn2.addEventListener('click', openVault);
newFileBtn.addEventListener('click', createNewFile);
searchInput.addEventListener('input', e => { searchQuery = e.target.value; renderTodos(); });
statusFilterEl.addEventListener('change', e => { statusFilter = e.target.value; renderTodos(); });

const openRecentBtn = document.getElementById('open-recent-btn');
if (openRecentBtn) {
  openRecentBtn.addEventListener('click', () => {
    const listEl = document.getElementById('recent-vaults-list');
    if (listEl && listEl.style.display === 'block') {
      listEl.style.display = 'none';
    } else {
      renderRecentVaults();
    }
  });
}
