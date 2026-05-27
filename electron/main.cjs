const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');

const isDev = process.env.NODE_ENV === 'development';

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    title: 'Fenestration Pro',
    backgroundColor: '#f8fafc',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: path.join(__dirname, '../public/icon.png'),
    show: false,
  });

  win.once('ready-to-show', () => win.show());

  if (isDev) {
    win.loadURL('http://localhost:3000');
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

// --- IPC: Save File ---
ipcMain.handle('dialog:saveFile', async (_, content) => {
  const { filePath, canceled } = await dialog.showSaveDialog({
    title: 'Save Project',
    defaultPath: 'project.fenconfig',
    filters: [
      { name: 'Fenestration Project', extensions: ['fenconfig'] },
      { name: 'JSON', extensions: ['json'] },
    ],
  });
  if (canceled || !filePath) return { success: false };
  try {
    fs.writeFileSync(filePath, content, 'utf-8');
    return { success: true, filePath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// --- IPC: Open File ---
ipcMain.handle('dialog:openFile', async () => {
  const { filePaths, canceled } = await dialog.showOpenDialog({
    title: 'Open Project',
    filters: [
      { name: 'Fenestration Project', extensions: ['fenconfig'] },
      { name: 'JSON', extensions: ['json'] },
    ],
    properties: ['openFile'],
  });
  if (canceled || !filePaths.length) return { success: false };
  try {
    const content = fs.readFileSync(filePaths[0], 'utf-8');
    return { success: true, content, filePath: filePaths[0] };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// --- IPC: Export SVG ---
ipcMain.handle('dialog:exportSVG', async (_, svgContent) => {
  const { filePath, canceled } = await dialog.showSaveDialog({
    title: 'Export SVG',
    defaultPath: 'window-diagram.svg',
    filters: [{ name: 'SVG Image', extensions: ['svg'] }],
  });
  if (canceled || !filePath) return { success: false };
  try {
    fs.writeFileSync(filePath, svgContent, 'utf-8');
    shell.openPath(filePath);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// --- IPC: Export PDF (supplier quote) ---
ipcMain.handle('dialog:exportPDF', async (_, htmlContent, defaultName) => {
  const { filePath, canceled } = await dialog.showSaveDialog({
    title: 'Export Quote as PDF',
    defaultPath: defaultName || 'quote.pdf',
    filters: [{ name: 'PDF Document', extensions: ['pdf'] }],
  });
  if (canceled || !filePath) return { success: false };

  // Create a hidden window to render the HTML and print to PDF
  const pdfWin = new BrowserWindow({
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });

  try {
    await pdfWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);
    const pdfBuffer = await pdfWin.webContents.printToPDF({
      pageSize: 'Letter',
      printBackground: true,
      margins: { top: 0.5, bottom: 0.5, left: 0.6, right: 0.6 },
    });
    fs.writeFileSync(filePath, pdfBuffer);
    shell.openPath(filePath);
    return { success: true, filePath };
  } catch (err) {
    return { success: false, error: err.message };
  } finally {
    pdfWin.destroy();
  }
});

// --- IPC: Export CSV ---
ipcMain.handle('dialog:exportCSV', async (_, csvContent, defaultName) => {
  const { filePath, canceled } = await dialog.showSaveDialog({
    title: 'Export Quote as CSV',
    defaultPath: defaultName || 'quote.csv',
    filters: [{ name: 'CSV File', extensions: ['csv'] }],
  });
  if (canceled || !filePath) return { success: false };
  try {
    fs.writeFileSync(filePath, csvContent, 'utf-8');
    shell.openPath(filePath);
    return { success: true, filePath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// --- IPC: Print ---
ipcMain.handle('window:print', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  win.webContents.print({ silent: false, printBackground: true });
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
