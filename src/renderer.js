'use strict';

// ── State ──────────────────────────────────────────────────────────────────
let vaultPath = null;
let vaultFiles = [];
let selectedFilePath = null;
let activeTag = null;
let statusFilter = 'all';
let searchQuery = '';
const collapsedGroups  = new Set();
const todoColors       = new Map(); // todo id  → color string
const fileIconColors   = new Map(); // file path → color string

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

const titlebarVaultEl   = document.getElementById('titlebar-vault');
const activeTabNameEl   = document.getElementById('active-tab-name');
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

  if (todoLineIndex < insertAt) {
    lines.splice(todoLineIndex, 1);
    lines.splice(insertAt - 1, 0, todoLine);
  } else {
    lines.splice(insertAt, 0, todoLine);
    lines.splice(todoLineIndex + 1, 1);
  }

  file.content = lines.join('\n');
  await save(file);
  renderSidebar();
  renderTodos();
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
  return lines.join('\n');
}

// ── Vault operations ───────────────────────────────────────────────────────
async function openVault() {
  const folder = await window.vault.openVault();
  if (!folder) return;
  vaultPath = folder;
  const vaultBaseName = folder.split(/[\\/]/).pop();
  vaultNameEl.textContent = vaultBaseName;
  titlebarVaultEl.textContent = vaultBaseName;
  await refreshVault();
  enableUI();
}

async function refreshVault() {
  const result = await window.vault.readVault(vaultPath);
  if (result.error) { alert('Error reading vault: ' + result.error); return; }
  vaultFiles = result;
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
  allLi.classList.toggle('active', selectedFilePath === null);
  allLi.addEventListener('click', () => { selectedFilePath = null; activeTabNameEl.textContent = 'All todos'; renderSidebar(); renderTodos(); });
  fileListEl.appendChild(allLi);

  for (const file of vaultFiles) {
    const count = parseTodos(file).filter(t => !t.done).length;
    const li = document.createElement('li');
    li.title = file.relativePath;
    li.innerHTML = `
      <span class="file-icon"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></span>
      <span class="file-label">${escHtml(file.name)}</span>
      <span class="todo-badge">${count}</span>`;
    li.classList.toggle('active', file.path === selectedFilePath);
    li.addEventListener('click', () => {
      selectedFilePath = file.path;
      activeTabNameEl.textContent = file.name;
      renderSidebar();
      renderTodos();
    });
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

  const filesToShow = selectedFilePath
    ? vaultFiles.filter(f => f.path === selectedFilePath)
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
      <span class="group-name">${escHtml(file.relativePath)}</span>
      <span class="group-count">${todos.length}</span>
      <button class="group-add-btn" data-file="${escHtml(file.path)}" title="Add todo">
        <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      </button>
    </div>`;
    html += `<div class="file-group-todos${isCollapsed ? ' hidden' : ''}">`;

    for (const todo of todos) {
      const textNoTags = todo.text.replace(/#[\w-]+/g, '').trim();
      const tagsHtml = todo.tags.map(t =>
        `<span class="todo-tag">#${escHtml(t)}</span>`
      ).join('');
      const textHtml = renderTodoText(textNoTags);

      const todoColor = todoColors.get(todo.id);
      html += `
        <div class="todo-item${todo.done ? ' done' : ''}" data-id="${escHtml(todo.id)}" data-file="${escHtml(todo.filePath)}" data-line="${todo.lineIndex}" style="${todoColor ? `border-left-color:${todoColor}` : ''}">
          <input type="checkbox" class="todo-checkbox" ${todo.done ? 'checked' : ''} />
          <div class="todo-body">
            <div class="todo-text">${textHtml}</div>
            ${tagsHtml ? `<div class="todo-tags">${tagsHtml}</div>` : ''}
          </div>
          <div class="todo-actions">
            <button class="btn-icon edit-btn" title="Edit">✎</button>
            <button class="btn-icon more-btn" title="Color / Move">⋯</button>
            <button class="btn-icon danger delete-btn" title="Delete">✕</button>
          </div>
        </div>`;
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
            file.content = appendTodo(file.content, text); // write first so line indices are valid
            await save(file);
            // reload content then move to chosen section
            const fresh = vaultFiles.find(f => f.path === pendingNewTodo.filePath);
            const todos = parseTodos(fresh);
            const newTodo = todos[todos.length - 1]; // last appended
            if (newTodo) await moveTodoToSection(fresh.path, newTodo.lineIndex, pendingNewTodo.targetSection);
          } else {
            file.content = appendTodo(file.content, text);
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

  // Regular todo items (skip the new-todo-row)
  todoListEl.querySelectorAll('.todo-item:not(.new-todo-row)').forEach(item => {
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

async function deleteTodo(filePath, lineIndex) {
  const file = vaultFiles.find(f => f.path === filePath);
  if (!file) return;
  file.content = deleteTodoLine(file.content, lineIndex);
  await save(file);
  renderSidebar();
  renderTodos();
}

function startEditTodo(item, filePath, lineIndex) {
  const textEl = item.querySelector('.todo-text');
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

async function save(file) {
  const result = await window.vault.writeFile(file.path, file.content);
  if (result.error) alert('Save error: ' + result.error);
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

// ── Event listeners ────────────────────────────────────────────────────────
openVaultBtn.addEventListener('click', openVault);
if (openVaultBtn2) openVaultBtn2.addEventListener('click', openVault);
newFileBtn.addEventListener('click', createNewFile);
searchInput.addEventListener('input', e => { searchQuery = e.target.value; renderTodos(); });
statusFilterEl.addEventListener('change', e => { statusFilter = e.target.value; renderTodos(); });
