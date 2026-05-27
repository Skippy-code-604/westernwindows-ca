const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  saveFile: (content) => ipcRenderer.invoke('dialog:saveFile', content),
  openFile: () => ipcRenderer.invoke('dialog:openFile'),
  exportSVG: (svgContent) => ipcRenderer.invoke('dialog:exportSVG', svgContent),
  print: () => ipcRenderer.invoke('window:print'),
});
