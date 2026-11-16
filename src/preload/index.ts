import { contextBridge, ipcRenderer } from 'electron'
import type { McpServerConfig, McpServerProbeResult } from '../shared/mcp'
import type {
  AppSettings,
  CatalogFilter,
  CatalogItem,
  ChatSession,
  FileNode,
  LmConnectionResult,
  LmModel,
  ProposedEdit,
  SearchResult,
  StreamChunk
} from '../shared/types'

export interface ForgeApi {
  getSettings: () => Promise<AppSettings>
  updateSettings: (partial: Partial<AppSettings>) => Promise<AppSettings>
  openWorkspace: (dirPath?: string) => Promise<{
    root: string
    tree: FileNode
    hasGit: boolean
  } | null>
  getTree: () => Promise<FileNode | null>
  getRecentProjects: () => Promise<string[]>
  readFile: (filePath: string) => Promise<{ path: string; content: string; relativePath: string }>
  writeFile: (filePath: string, content: string) => Promise<{ path: string; relativePath: string }>
  createFile: (
    filePath: string,
    content?: string
  ) => Promise<{ path: string; relativePath: string }>
  deletePath: (filePath: string) => Promise<boolean>
  search: (query: string) => Promise<SearchResult[]>
  testLm: () => Promise<LmConnectionResult>
  listModels: () => Promise<LmModel[]>
  chat: (payload: {
    requestId: string
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
    contextFiles: Array<{ relativePath: string; path: string; content: string }>
  }) => Promise<{ content: string; proposedEdits: ProposedEdit[] }>
  cancelChat: (requestId: string) => Promise<boolean>
  onChatChunk: (cb: (payload: { requestId: string; chunk: StreamChunk }) => void) => () => void
  applyEdit: (edit: ProposedEdit, decision: 'accepted' | 'rejected') => Promise<ProposedEdit>
  listCatalog: () => Promise<CatalogItem[]>
  searchCatalog: (filter?: CatalogFilter) => Promise<CatalogItem[]>
  getCatalogItem: (id: string) => Promise<CatalogItem | undefined>
  refreshCatalog: () => Promise<{ ok: true; count: number } | { ok: false; error: string }>
  setToolEnabled: (id: string, enabled: boolean) => Promise<AppSettings>
  getChatSessions: () => Promise<ChatSession[]>
  saveChatSession: (session: ChatSession) => Promise<ChatSession[]>
  deleteChatSession: (id: string) => Promise<ChatSession[]>
  runApprovedCommand: (payload: {
    command: string
    cwd?: string
  }) => Promise<
    | { ok: true; code: number; stdout: string; stderr: string }
    | { ok: false; error?: string; stdout?: string; stderr?: string }
  >
  onTerminalData: (
    cb: (payload: { stream: 'stdout' | 'stderr'; data: string }) => void
  ) => () => void
  confirm: (message: string, detail?: string) => Promise<boolean>
  openExternal: (url: string) => Promise<void>
  newId: () => Promise<string>
  listMcpServers: () => Promise<McpServerConfig[]>
  upsertMcpServer: (input: Partial<McpServerConfig>) => Promise<AppSettings>
  removeMcpServer: (id: string) => Promise<AppSettings>
  probeMcpServer: (id: string) => Promise<McpServerProbeResult>
  probeAllMcpServers: () => Promise<Record<string, McpServerProbeResult>>
  onMenu: (channel: string, cb: () => void) => () => void
}

const api: ForgeApi = {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (partial) => ipcRenderer.invoke('settings:update', partial),
  openWorkspace: (dirPath) => ipcRenderer.invoke('workspace:open', dirPath),
  getTree: () => ipcRenderer.invoke('workspace:tree'),
  getRecentProjects: () => ipcRenderer.invoke('workspace:recent'),
  readFile: (filePath) => ipcRenderer.invoke('file:read', filePath),
  writeFile: (filePath, content) => ipcRenderer.invoke('file:write', filePath, content),
  createFile: (filePath, content) => ipcRenderer.invoke('file:create', filePath, content),
  deletePath: (filePath) => ipcRenderer.invoke('file:delete', filePath),
  search: (query) => ipcRenderer.invoke('file:search', query),
  testLm: () => ipcRenderer.invoke('lm:test'),
  listModels: () => ipcRenderer.invoke('lm:models'),
  chat: (payload) => ipcRenderer.invoke('lm:chat', payload),
  cancelChat: (requestId) => ipcRenderer.invoke('lm:cancel', requestId),
  onChatChunk: (cb) => {
    const listener = (
      _: Electron.IpcRendererEvent,
      payload: { requestId: string; chunk: StreamChunk }
    ) => cb(payload)
    ipcRenderer.on('lm:chunk', listener)
    return () => ipcRenderer.removeListener('lm:chunk', listener)
  },
  applyEdit: (edit, decision) => ipcRenderer.invoke('edits:apply', edit, decision),
  listCatalog: () => ipcRenderer.invoke('catalog:list'),
  searchCatalog: (filter) => ipcRenderer.invoke('catalog:search', filter),
  getCatalogItem: (id) => ipcRenderer.invoke('catalog:get', id),
  refreshCatalog: () => ipcRenderer.invoke('catalog:refresh'),
  setToolEnabled: (id, enabled) => ipcRenderer.invoke('catalog:setEnabled', id, enabled),
  getChatSessions: () => ipcRenderer.invoke('chat:sessions'),
  saveChatSession: (session) => ipcRenderer.invoke('chat:save', session),
  deleteChatSession: (id) => ipcRenderer.invoke('chat:delete', id),
  runApprovedCommand: (payload) => ipcRenderer.invoke('terminal:runApproved', payload),
  onTerminalData: (cb) => {
    const listener = (
      _: Electron.IpcRendererEvent,
      payload: { stream: 'stdout' | 'stderr'; data: string }
    ) => cb(payload)
    ipcRenderer.on('terminal:data', listener)
    return () => ipcRenderer.removeListener('terminal:data', listener)
  },
  confirm: (message, detail) => ipcRenderer.invoke('dialog:confirm', message, detail),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  newId: () => ipcRenderer.invoke('util:id'),
  listMcpServers: () => ipcRenderer.invoke('mcp:listServers'),
  upsertMcpServer: (input) => ipcRenderer.invoke('mcp:upsertServer', input),
  removeMcpServer: (id) => ipcRenderer.invoke('mcp:removeServer', id),
  probeMcpServer: (id) => ipcRenderer.invoke('mcp:probeServer', id),
  probeAllMcpServers: () => ipcRenderer.invoke('mcp:probeAll'),
  onMenu: (channel, cb) => {
    const map: Record<string, string> = {
      'open-project': 'menu:open-project',
      save: 'menu:save',
      'toggle-ai': 'menu:toggle-ai',
      'toggle-terminal': 'menu:toggle-terminal',
      catalog: 'menu:catalog',
      'lm-help': 'menu:lm-help'
    }
    const ipcChannel = map[channel]
    if (!ipcChannel) return () => undefined
    const listener = () => cb()
    ipcRenderer.on(ipcChannel, listener)
    return () => ipcRenderer.removeListener(ipcChannel, listener)
  }
}

contextBridge.exposeInMainWorld('forge', api)

declare global {
  interface Window {
    forge: ForgeApi
  }
}
