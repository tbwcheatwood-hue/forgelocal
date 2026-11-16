import { DEFAULT_AGENT_TEAM, type AgentTeamSettings } from './agents'
import type { ChatMessageContent } from './attachments'
import { DEFAULT_COMPANION_BRIDGE, type CompanionBridgeSettings } from './companion'
import type { McpServerConfig } from './mcp'
import type { ProjectRecord } from './projectGen'

export type TrustStatus = 'built-in' | 'optional' | 'third-party'

export type CatalogCategory =
  'editors' | 'languages' | 'ai-tools' | 'terminals' | 'vcs' | 'security' | 'productivity'

/** Optional one-click stdio preset for the MCP dock (user still confirms add). */
export interface McpSuggestedServer {
  name: string
  command: string
  args: string[]
  note?: string
}

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
  /** When true, enable/use only if a remote cloud model is active. */
  requiresRemote?: boolean
  /** Documentation / upstream URL (shown in catalog detail). */
  homepage?: string
  /** Suggested local stdio server the user can add from the catalog/dock. */
  mcpSuggested?: McpSuggestedServer
  /** Example OpenHands-style mcpServers JSON snippet (display only). */
  sampleConfigJson?: string
  configSchema?: Record<string, unknown>
}

export interface CatalogFilter {
  query?: string
  category?: CatalogCategory | 'all'
  trust?: TrustStatus | 'all'
  implementedOnly?: boolean
}

export type ProviderMode = 'local' | 'remote'

export interface ProviderSettings {
  /** local = LM Studio; remote = user-provided OpenAI-compatible endpoint */
  mode: ProviderMode
  baseUrl: string
  apiKey: string
  model: string
  timeoutMs: number
  stream: boolean
  /** Sampling temperature for non-reasoning chat models (omitted for o-series / gpt-5). */
  temperature?: number
  /** Max generated tokens for /chat/completions (mapped to max_tokens or max_completion_tokens). */
  maxOutputTokens?: number
  /**
   * Optional context window for client-side input+output budget checks.
   * Left unset by default — LM Studio /models does not expose context length.
   */
  contextWindowTokens?: number
}

export interface AppSettings {
  provider: ProviderSettings
  theme: 'dark' | 'light'
  fontSize: number
  recentProjects: string[]
  /** AI-generated projects remembered for the welcome/recent strip (paths + meta). */
  rememberedProjects: ProjectRecord[]
  enabledTools: Record<string, boolean>
  toolConfigs: Record<string, Record<string, unknown>>
  allowPathsOutsideWorkspace: boolean
  /** Local stdio MCP servers (command + args). No remote credentials invented. */
  mcpServers: McpServerConfig[]
  /** Cooperative multi-agent team (LocalAGI-inspired). Explicit opt-in. */
  agentTeam: AgentTeamSettings
  /** Optional LocalForge Companion bridge (pairing / health). Explicit opt-in. */
  companion: CompanionBridgeSettings
  /** Relative preview root inside the workspace (Companion-style static preview). */
  previewDir: string
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
  /** Non-code composer attachments (names only in history — no base64 persisted). */
  attachmentNames?: string[]
  proposedEdits?: ProposedEdit[]
  error?: string
  /** Present when this assistant message came from a multi-agent team run. */
  agentRun?: {
    mode: 'multi'
    turns: Array<{ agentId: string; agentName: string; content: string; error?: string }>
  }
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
  /** Present only when a server actually returns it — never invented client-side. */
  max_model_len?: number
  max_context_length?: number
  context_length?: number
  context_window?: number
  n_ctx?: number
}

export interface LmConnectionResult {
  status: LmConnectionStatus
  message: string
  models: LmModel[]
  baseUrl: string
  latencyMs?: number
}

export interface ChatCompletionRequest {
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: ChatMessageContent }>
  model: string
  stream?: boolean
  temperature?: number
  maxOutputTokens?: number
}

export interface StreamChunk {
  type: 'delta' | 'done' | 'error' | 'cancelled' | 'agent_start' | 'agent_done'
  content?: string
  error?: string
  agentId?: string
  agentName?: string
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
  mode: 'local',
  baseUrl: 'http://localhost:1234/v1',
  apiKey: 'lm-studio',
  model: '',
  timeoutMs: 120000,
  stream: true,
  temperature: 0.2,
  maxOutputTokens: 4096
  // contextWindowTokens intentionally unset — unknown per model from /v1/models
}

export const DEFAULT_REMOTE_PROVIDER: ProviderSettings = {
  mode: 'remote',
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: '',
  timeoutMs: 120000,
  stream: true,
  temperature: 0.2,
  maxOutputTokens: 4096
}

export const DEFAULT_SETTINGS: AppSettings = {
  provider: { ...DEFAULT_PROVIDER },
  theme: 'dark',
  fontSize: 14,
  recentProjects: [],
  rememberedProjects: [],
  enabledTools: {},
  toolConfigs: {},
  allowPathsOutsideWorkspace: false,
  mcpServers: [],
  agentTeam: structuredClone(DEFAULT_AGENT_TEAM),
  companion: structuredClone(DEFAULT_COMPANION_BRIDGE),
  previewDir: '.'
}
