const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');

if (process.env.NODE_ENV !== 'production') {
  require('electron-reload')(path.join(__dirname, 'src'), {
    electron: path.join(__dirname, 'node_modules', '.bin', 'electron'),
    hardReset: true
  });
}

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    backgroundColor: '#16161e',
    title: 'Dev Todo'
  });

  mainWindow.loadFile('src/index.html');
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

ipcMain.handle('open-vault', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Select Project Vault Folder'
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('read-vault', async (_, folderPath) => {
  try {
    const files = [];
    function scanDir(dir) {
      const items = fs.readdirSync(dir, { withFileTypes: true });
      for (const item of items) {
        if (item.name.startsWith('.')) continue;
        const full = path.join(dir, item.name);
        if (item.isDirectory()) {
          scanDir(full);
        } else if (item.isFile() && item.name.endsWith('.md')) {
          files.push({
            name: item.name,
            relativePath: path.relative(folderPath, full),
            path: full,
            content: fs.readFileSync(full, 'utf-8')
          });
        }
      }
    }
    scanDir(folderPath);
    return files;
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle('write-file', async (_, filePath, content) => {
  try {
    fs.writeFileSync(filePath, content, 'utf-8');
    return { success: true };
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle('open-obsidian-file', async (_, vaultPath, fileName) => {
  const fileNoExt = fileName.replace(/\.md$/, '');
  const url = `obsidian://open?file=${encodeURIComponent(fileNoExt)}`;
  await shell.openExternal(url);
  return { success: true };
});

ipcMain.handle('create-file', async (_, folderPath, fileName) => {
  try {
    const baseName = path.basename(fileName.endsWith('.md') ? fileName : fileName + '.md');
    const filePath = path.join(folderPath, baseName);
    const title = baseName.replace('.md', '');
    fs.writeFileSync(filePath, `# ${title}\n\n`, 'utf-8');
    return { success: true, path: filePath, name: baseName, relativePath: baseName };
  } catch (err) {
    return { error: err.message };
  }
});
