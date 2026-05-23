const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('vault', {
  openVault: () => ipcRenderer.invoke('open-vault'),
  readVault: (folderPath) => ipcRenderer.invoke('read-vault', folderPath),
  writeFile: (filePath, content) => ipcRenderer.invoke('write-file', filePath, content),
  createFile: (folderPath, fileName) => ipcRenderer.invoke('create-file', folderPath, fileName),
  openObsidianFile: (vaultPath, fileName) => ipcRenderer.invoke('open-obsidian-file', vaultPath, fileName)
});
