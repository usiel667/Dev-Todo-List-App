'use strict';

// ── State ──────────────────────────────────────────────────────────────────
let vaultPath = null;
let vaultFiles = [];          // [{ name, relativePath, path, content }]
let selectedFilePath = null;  // null = show all files
let activeTag = null;
let statusFilter = 'all';
let searchQuery = '';

// ── DOM refs ───────────────────────────────────────────────────────────────
const openVaultBtn     = document.getElementById('open-vault-btn');
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
  lines[lineIndex] = lines[lineIndex].replace(
    /\[([ xX])\]/,
    done ? '[x]' : '[ ]'
  );
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
  const trimmed = fileContent.trimEnd();
  return trimmed + '\n- [ ] ' + text + '\n';
}

// ── Vault operations ───────────────────────────────────────────────────────
async function openVault() {
  const folder = await window.vault.openVault();
  if (!folder) return;
  vaultPath = folder;
  vaultNameEl.textContent = folder.split(/[\\/]/).pop();
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

// ── Sidebar rendering ──────────────────────────────────────────────────────
function renderSidebar() {
  // File list
  const allTodos = vaultFiles.flatMap(parseTodos);

  fileListEl.innerHTML = '';
  // "All files" entry
  const allLi = document.createElement('li');
  const allCount = allTodos.filter(t => !t.done).length;
  allLi.innerHTML = `<span>All files</span><span class="todo-badge">${allCount}</span>`;
  allLi.classList.toggle('active', selectedFilePath === null);
  allLi.addEventListener('click', () => { selectedFilePath = null; renderSidebar(); renderTodos(); });
  fileListEl.appendChild(allLi);

  for (const file of vaultFiles) {
    const count = parseTodos(file).filter(t => !t.done).length;
    const li = document.createElement('li');
    li.title = file.relativePath;
    li.innerHTML = `<span>${file.name}</span><span class="todo-badge">${count}</span>`;
    li.classList.toggle('active', file.path === selectedFilePath);
    li.addEventListener('click', () => { selectedFilePath = file.path; renderSidebar(); renderTodos(); });
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
    return;
  }
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

// ── Todo rendering ─────────────────────────────────────────────────────────
function renderTodos() {
  if (vaultFiles.length === 0) {
    todoListEl.innerHTML = '<div class="empty-state"><p>No <code>.md</code> files found in this vault.</p></div>';
    todoCountEl.textContent = '';
    return;
  }

  const filesToShow = selectedFilePath
    ? vaultFiles.filter(f => f.path === selectedFilePath)
    : vaultFiles;

  const q = searchQuery.toLowerCase();

  let total = 0;
  let shown = 0;
  let html = '';

  for (const file of filesToShow) {
    const todos = parseTodos(file).filter(todo => {
      total++;
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
        // Preserve tags from the original line but replace plain text portion
        const todo = parseTodos(file).find(t => t.lineIndex === lineIndex);
        const existingTagStr = todo ? todo.tags.map(t => ' #' + t).join('') : '';
        const newTagStr = (newText.match(/#[\w-]+/g) || []).map(t => ' ' + t).join('');
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
newFileBtn.addEventListener('click', createNewFile);
addTodoBtn.addEventListener('click', addTodo);
newTodoInput.addEventListener('keydown', e => { if (e.key === 'Enter') addTodo(); });
searchInput.addEventListener('input', e => { searchQuery = e.target.value; renderTodos(); });
statusFilterEl.addEventListener('change', e => { statusFilter = e.target.value; renderTodos(); });
