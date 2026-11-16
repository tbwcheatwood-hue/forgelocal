import { app, BrowserWindow, Menu, shell } from 'electron'
import { join } from 'path'
import { CatalogService } from './services/catalog'
import { FilesystemService } from './services/filesystem'
import { LmStudioService } from './services/lmstudio'
import { SettingsService } from './services/settings'
import { registerIpc } from './ipc/register'

process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true'

const isDev = !app.isPackaged
let mainWindow: BrowserWindow | null = null

const fileService = new FilesystemService()
const settingsService = new SettingsService()
const lmService = new LmStudioService()
const catalogService = new CatalogService()

function createWindow(): void {
  const settings = settingsService.getSettings()
  fileService.setAllowOutside(settings.allowPathsOutsideWorkspace)

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    show: false,
    title: 'ForgeLocal',
    backgroundColor: '#0f1419',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function buildMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Open Project…',
          accelerator: 'CmdOrCtrl+O',
          click: () => mainWindow?.webContents.send('menu:open-project')
        },
        {
          label: 'Save',
          accelerator: 'CmdOrCtrl+S',
          click: () => mainWindow?.webContents.send('menu:save')
        },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Toggle AI Panel',
          accelerator: 'CmdOrCtrl+Shift+A',
          click: () => mainWindow?.webContents.send('menu:toggle-ai')
        },
        {
          label: 'Toggle Terminal',
          accelerator: 'CmdOrCtrl+`',
          click: () => mainWindow?.webContents.send('menu:toggle-terminal')
        },
        {
          label: 'Tools Catalog',
          accelerator: 'CmdOrCtrl+Shift+X',
          click: () => mainWindow?.webContents.send('menu:catalog')
        },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'LM Studio Setup',
          click: () => mainWindow?.webContents.send('menu:lm-help')
        }
      ]
    }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

app.whenReady().then(() => {
  registerIpc({
    fs: fileService,
    settings: settingsService,
    lm: lmService,
    catalog: catalogService
  })
  buildMenu()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
