import { app, BrowserWindow, Menu, shell } from 'electron'
import { join } from 'path'
import { AgentsService } from './services/agents'
import { AttachmentsService } from './services/attachments'
import { CatalogService } from './services/catalog'
import { CompanionService } from './services/companion'
import { FilesystemService } from './services/filesystem'
import { LmStudioService } from './services/lmstudio'
import { McpService } from './services/mcp'
import { PreviewService } from './services/preview'
import { ProjectGenService } from './services/projectGen'
import { SettingsService } from './services/settings'
import { resolveAppIcon } from './iconPath'
import { registerIpc } from './ipc/register'

process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true'

if (process.env.FORGE_DEBUG_PORT) {
  app.commandLine.appendSwitch('remote-debugging-port', process.env.FORGE_DEBUG_PORT)
}

const isDev = !app.isPackaged
let mainWindow: BrowserWindow | null = null

const fileService = new FilesystemService()
const settingsService = new SettingsService()
const lmService = new LmStudioService()
const catalogService = new CatalogService()
const mcpService = new McpService()
const agentsService = new AgentsService(lmService)
const companionService = new CompanionService()
const previewService = new PreviewService()
const attachmentsService = new AttachmentsService()
const projectGenService = new ProjectGenService(lmService, fileService, settingsService)

function createWindow(): void {
  const settings = settingsService.getSettings()
  fileService.setAllowOutside(settings.allowPathsOutsideWorkspace)

  const icon = resolveAppIcon()
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    show: false,
    title: 'ForgeLocal',
    backgroundColor: '#0f1419',
    ...(icon ? { icon } : {}),
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
          label: 'New AI Project…',
          accelerator: 'CmdOrCtrl+Shift+N',
          click: () => mainWindow?.webContents.send('menu:new-ai-project')
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
    catalog: catalogService,
    mcp: mcpService,
    agents: agentsService,
    companion: companionService,
    preview: previewService,
    attachments: attachmentsService,
    projectGen: projectGenService
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
