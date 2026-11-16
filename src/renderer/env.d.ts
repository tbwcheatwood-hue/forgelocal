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

declare global {
  interface Window {
    forge: ForgeApi
  }
}

declare module '*?worker' {
  const workerConstructor: {
    new (): Worker
  }
  export default workerConstructor
}

export {}
