const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  saveFile:  (content) => ipcRenderer.invoke('dialog:saveFile', content),
  openFile:  () => ipcRenderer.invoke('dialog:openFile'),
  exportSVG: (svgContent) => ipcRenderer.invoke('dialog:exportSVG', svgContent),
  exportPDF: (htmlContent, defaultName) => ipcRenderer.invoke('dialog:exportPDF', htmlContent, defaultName),
  exportCSV: (csvContent, defaultName) => ipcRenderer.invoke('dialog:exportCSV', csvContent, defaultName),
  exportDXF: (dxfContent, defaultName) => ipcRenderer.invoke('dialog:exportDXF', dxfContent, defaultName),
  print:     () => ipcRenderer.invoke('window:print'),
});
