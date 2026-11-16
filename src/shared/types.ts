export type TrustStatus = 'built-in' | 'optional' | 'third-party'

export type CatalogCategory =
  'editors' | 'languages' | 'ai-tools' | 'terminals' | 'vcs' | 'security' | 'productivity'

export interface CatalogItem {
  id: string
  name: string
  description: string
  category: CatalogCategory
  tags: string[]
  trust: TrustStatus
  source: string
  implemented: boolean
  enabledByDefault: boolean
  installGuidance: string
  configSchema?: Record<string, unknown>
}

export interface CatalogFilter {
  query?: string
  category?: CatalogCategory | 'all'
  trust?: TrustStatus | 'all'
  implementedOnly?: boolean
}

export interface ProviderSettings {
  baseUrl: string
  apiKey: string
  model: string
  timeoutMs: number
  stream: boolean
}

export interface AppSettings {
  provider: ProviderSettings
  theme: 'dark' | 'light'
  fontSize: number
  recentProjects: string[]
  enabledTools: Record<string, boolean>
  toolConfigs: Record<string, Record<string, unknown>>
  allowPathsOutsideWorkspace: boolean
}

export interface FileNode {
  name: string
  path: string
  relativePath: string
  isDirectory: boolean
  children?: FileNode[]
}

export interface OpenFile {
  path: string
  relativePath: string
  content: string
  originalContent: string
  language: string
  dirty: boolean
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  createdAt: number
  contextFiles?: string[]
  proposedEdits?: ProposedEdit[]
  error?: string
}

export interface ProposedEdit {
  id: string
  path: string
  relativePath: string
  originalContent: string
  proposedContent: string
  summary: string
  status: 'pending' | 'accepted' | 'rejected'
}

export interface ChatSession {
  id: string
  title: string
  messages: ChatMessage[]
  createdAt: number
  updatedAt: number
  workspacePath?: string
}

export type LmConnectionStatus =
  'unknown' | 'connected' | 'unreachable' | 'stopped' | 'no-model' | 'error'

export interface LmModel {
  id: string
  object: string
  owned_by?: string
}

export interface LmConnectionResult {
  status: LmConnectionStatus
  message: string
  models: LmModel[]
  baseUrl: string
  latencyMs?: number
}

export interface ChatCompletionRequest {
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
  model: string
  stream?: boolean
  temperature?: number
}

export interface StreamChunk {
  type: 'delta' | 'done' | 'error' | 'cancelled'
  content?: string
  error?: string
}

export interface CommandApprovalRequest {
  id: string
  command: string
  cwd: string
  reason: string
}

export interface PathAccessRequest {
  id: string
  path: string
  operation: string
  reason: string
}

export interface SearchResult {
  path: string
  relativePath: string
  line: number
  column: number
  preview: string
}

export const DEFAULT_PROVIDER: ProviderSettings = {
  baseUrl: 'http://localhost:1234/v1',
  apiKey: 'lm-studio',
  model: '',
  timeoutMs: 120000,
  stream: true
}

export const DEFAULT_SETTINGS: AppSettings = {
  provider: { ...DEFAULT_PROVIDER },
  theme: 'dark',
  fontSize: 14,
  recentProjects: [],
  enabledTools: {},
  toolConfigs: {},
  allowPathsOutsideWorkspace: false
}
