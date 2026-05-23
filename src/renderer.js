'use strict';

// ── State ──────────────────────────────────────────────────────────────────
let vaultPath = null;
let vaultFiles = [];
let selectedFilePath = null;
let activeTag = null;
let statusFilter = 'all';
let searchQuery = '';

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
const targetFileSelect = document.getElementById('target-file-select');
const newTodoInput     = document.getElementById('new-todo-input');
const addTodoBtn       = document.getElementById('add-todo-btn');

const titlebarVaultEl   = document.getElementById('titlebar-vault');
const activeTabNameEl   = document.getElementById('active-tab-name');
const statusVaultLabel  = document.getElementById('status-vault-label');
const statusTodoCount   = document.getElementById('status-todo-count');

const ribbonFilesBtn  = document.getElementById('ribbon-files');
const ribbonTagsBtn   = document.getElementById('ribbon-tags');
const sectionFiles    = document.getElementById('section-files');
const sectionTags     = document.getElementById('section-tags');

// ── Ribbon panel switching ─────────────────────────────────────────────────
ribbonFilesBtn.addEventListener('click', () => {
  ribbonFilesBtn.classList.add('active');
  ribbonTagsBtn.classList.remove('active');
  sectionFiles.classList.remove('hidden');
  sectionTags.classList.add('hidden');
});

ribbonTagsBtn.addEventListener('click', () => {
  ribbonTagsBtn.classList.add('active');
  ribbonFilesBtn.classList.remove('active');
  sectionTags.classList.remove('hidden');
  sectionFiles.classList.add('hidden');
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
  return fileContent.trimEnd() + '\n- [ ] ' + text + '\n';
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
  targetFileSelect.disabled = false;
  newTodoInput.disabled = false;
  addTodoBtn.disabled = false;
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

  // Target file select
  const prev = targetFileSelect.value;
  targetFileSelect.innerHTML = '<option value="">— select file —</option>';
  for (const file of vaultFiles) {
    const opt = document.createElement('option');
    opt.value = file.path;
    opt.textContent = file.name;
    targetFileSelect.appendChild(opt);
  }
  if (prev && vaultFiles.some(f => f.path === prev)) targetFileSelect.value = prev;

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

    html += `<div class="file-group" data-file="${escHtml(file.path)}">`;
    html += `<div class="file-group-header">${escHtml(file.relativePath)}</div>`;

    for (const todo of todos) {
      const textNoTags = todo.text.replace(/#[\w-]+/g, '').trim();
      const tagsHtml = todo.tags.map(t =>
        `<span class="todo-tag">#${escHtml(t)}</span>`
      ).join('');

      html += `
        <div class="todo-item${todo.done ? ' done' : ''}" data-id="${escHtml(todo.id)}" data-file="${escHtml(todo.filePath)}" data-line="${todo.lineIndex}">
          <input type="checkbox" class="todo-checkbox" ${todo.done ? 'checked' : ''} />
          <div class="todo-body">
            <div class="todo-text">${escHtml(textNoTags)}</div>
            ${tagsHtml ? `<div class="todo-tags">${tagsHtml}</div>` : ''}
          </div>
          <div class="todo-actions">
            <button class="btn-icon edit-btn" title="Edit">✎</button>
            <button class="btn-icon danger delete-btn" title="Delete">✕</button>
          </div>
        </div>`;
    }

    html += '</div>';
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
  todoListEl.querySelectorAll('.todo-item').forEach(item => {
    const filePath = item.dataset.file;
    const lineIndex = parseInt(item.dataset.line, 10);

    item.querySelector('.todo-checkbox').addEventListener('change', async e => {
      await toggleTodo(filePath, lineIndex, e.target.checked);
    });

    item.querySelector('.edit-btn').addEventListener('click', () => {
      startEditTodo(item, filePath, lineIndex);
    });

    item.querySelector('.delete-btn').addEventListener('click', async () => {
      await deleteTodo(filePath, lineIndex);
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

async function addTodo() {
  const text = newTodoInput.value.trim();
  const filePath = targetFileSelect.value;
  if (!text || !filePath) return;

  const file = vaultFiles.find(f => f.path === filePath);
  if (!file) return;

  file.content = appendTodo(file.content, text);
  await save(file);
  newTodoInput.value = '';
  renderSidebar();
  renderTodos();
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

// ── Event listeners ────────────────────────────────────────────────────────
openVaultBtn.addEventListener('click', openVault);
if (openVaultBtn2) openVaultBtn2.addEventListener('click', openVault);
newFileBtn.addEventListener('click', createNewFile);
addTodoBtn.addEventListener('click', addTodo);
newTodoInput.addEventListener('keydown', e => { if (e.key === 'Enter') addTodo(); });
searchInput.addEventListener('input', e => { searchQuery = e.target.value; renderTodos(); });
statusFilterEl.addEventListener('change', e => { statusFilter = e.target.value; renderTodos(); });
