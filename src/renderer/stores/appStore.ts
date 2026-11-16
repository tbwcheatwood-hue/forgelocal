import { create } from 'zustand'
import { canRunMultiAgent, normalizeAgentTeam, type AgentRole } from '@shared/agents'
import {
  buildUserMessageContent,
  contentToPlainText,
  prepareAttachmentContext,
  type ComposerAttachment
} from '@shared/attachments'
import type {
  CompanionHealth,
  CompanionPairResult,
  DiscoveredProvider,
  GitSnapshot,
  HardwareInventory
} from '@shared/companion'
import type { McpServerConfig, McpServerProbeResult } from '@shared/mcp'
import {
  isProjectGenerationIntent,
  type CheckpointMeta,
  type ProjectPlan,
  type ProjectRecord,
  type ProjectStack
} from '@shared/projectGen'
import type {
  AppSettings,
  CatalogItem,
  ChatMessage,
  ChatSession,
  FileNode,
  LmConnectionResult,
  LmModel,
  OpenFile,
  ProposedEdit
} from '@shared/types'
import { DEFAULT_SETTINGS } from '@shared/types'
import {
  checkPromptSize,
  prepareContextFiles,
  STREAM_UI_MIN_INTERVAL_MS
} from '@shared/messageLimits'
import { applyContextWindowOnModelChange } from '@shared/contextWindow'
import { detectLanguage } from '../lib/language'

interface PendingCommand {
  id: string
  command: string
  reason: string
}

interface AppState {
  settings: AppSettings
  workspaceRoot: string | null
  tree: FileNode | null
  hasGit: boolean
  openFiles: OpenFile[]
  activePath: string | null
  selectedContext: string[]
  composerAttachments: ComposerAttachment[]
  lmStatus: LmConnectionResult | null
  models: LmModel[]
  session: ChatSession | null
  streaming: boolean
  streamBuffer: string
  requestId: string | null
  showAi: boolean
  showTerminal: boolean
  showCatalog: boolean
  showSettings: boolean
  showCanvas: boolean
  showSearch: boolean
  showMcpPanel: boolean
  showAgentsPanel: boolean
  showCompanionPanel: boolean
  showPreview: boolean
  showProjectWizard: boolean
  showProjectPanel: boolean
  projectWizardSeed: string | null
  projectPlan: ProjectPlan | null
  projectGenBusy: boolean
  checkpoints: CheckpointMeta[]
  rememberedProjects: ProjectRecord[]
  searchQuery: string
  terminalLog: string
  pendingCommand: PendingCommand | null
  catalog: CatalogItem[]
  catalogQuery: string
  catalogCategory: string
  selectedCatalogId: string | null
  error: string | null
  radialOpen: boolean
  radialPos: { x: number; y: number } | null
  selectionText: string
  syntaxDimming: boolean
  ghostIndex: number
  canvasFocusPath: string | null
  mcpQuery: string
  mcpLoading: boolean
  mcpProbes: Record<string, McpServerProbeResult>
  activeAgentName: string | null
  companionHealth: CompanionHealth | null
  hardware: HardwareInventory | null
  discoveredProviders: DiscoveredProvider[]
  gitSnapshot: GitSnapshot | null
  previewUrl: string | null
  previewRoot: string | null

  bootstrap: () => Promise<void>
  openProject: (path?: string) => Promise<void>
  openFile: (path: string) => Promise<void>
  closeFile: (path: string) => void
  setActive: (path: string) => void
  updateFileContent: (path: string, content: string) => void
  saveActive: () => Promise<void>
  toggleContext: (path: string) => void
  addComposerAttachments: (attachments: ComposerAttachment[]) => void
  removeComposerAttachment: (id: string) => void
  clearComposerAttachments: () => void
  pickComposerAttachments: () => Promise<void>
  ingestDroppedFiles: (files: File[]) => Promise<void>
  refreshLm: () => Promise<void>
  selectModel: (model: string) => Promise<void>
  sendPrompt: (prompt: string) => Promise<void>
  generateTeam: (
    description: string
  ) => Promise<{ ok: true; agents: AgentRole[] } | { ok: false; error: string }>
  cancelPrompt: () => Promise<void>
  decideEdit: (
    edit: ProposedEdit,
    decision: 'accepted' | 'rejected',
    opts?: { skipConfirm?: boolean }
  ) => Promise<void>
  runIntent: (intent: 'extract' | 'optimize' | 'tests' | 'explain') => Promise<void>
  loadCatalog: () => Promise<void>
  setToolEnabled: (id: string, enabled: boolean) => Promise<void>
  updateSettings: (partial: Partial<AppSettings>) => Promise<void>
  runSearch: (query: string) => Promise<void>
  proposeCommand: (command: string, reason: string) => void
  approveCommand: () => Promise<void>
  rejectCommand: () => void
  setShow: (
    key:
      | 'showAi'
      | 'showTerminal'
      | 'showCatalog'
      | 'showSettings'
      | 'showCanvas'
      | 'showSearch'
      | 'showMcpPanel'
      | 'showAgentsPanel'
      | 'showCompanionPanel'
      | 'showPreview'
      | 'showProjectWizard'
      | 'showProjectPanel',
    value: boolean
  ) => void
  setCatalogFilters: (query: string, category: string) => void
  selectCatalog: (id: string | null) => void
  setError: (error: string | null) => void
  setRadialOpen: (open: boolean, pos?: { x: number; y: number } | null) => void
  setSelectionText: (text: string) => void
  setGhostIndex: (index: number) => void
  setCanvasFocusPath: (path: string | null) => void
  setMcpQuery: (query: string) => void
  upsertMcpServer: (input: Partial<McpServerConfig>) => Promise<void>
  removeMcpServer: (id: string) => Promise<void>
  refreshMcpTools: (serverId?: string) => Promise<void>
  refreshCompanion: () => Promise<void>
  pairCompanion: (code: string) => Promise<CompanionPairResult>
  disconnectCompanion: () => Promise<void>
  refreshHardware: () => Promise<void>
  discoverLocalProviders: () => Promise<void>
  applyDiscoveredProvider: (provider: DiscoveredProvider) => Promise<void>
  refreshGit: () => Promise<void>
  startPreview: (previewDir?: string) => Promise<void>
  stopPreview: () => Promise<void>
  openProjectWizard: (seed?: string) => void
  closeProjectWizard: () => void
  clearProjectWizardSeed: () => void
  planAiProject: (input: {
    description: string
    answers?: Record<string, string>
    stackHint?: ProjectStack
    preferTemplate?: boolean
  }) => Promise<ProjectPlan | null>
  materializeAiProject: (
    plan: ProjectPlan,
    opts?: { useDefaultParent?: boolean }
  ) => Promise<boolean>
  refreshCheckpoints: () => Promise<void>
  createProjectCheckpoint: (label?: string) => Promise<void>
  restoreProjectCheckpoint: (id: string) => Promise<void>
  exportOpenProject: () => Promise<void>
  refreshRememberedProjects: () => Promise<void>
}

function emptySession(workspacePath?: string): ChatSession {
  return {
    id: crypto.randomUUID(),
    title: 'New chat',
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    workspacePath
  }
}

function enabledAgentsLabel(agents: AgentRole[]): string {
  const names = agents.filter((a) => a.enabled !== false).map((a) => a.name)
  return names.length ? names.join(' → ') : 'team'
}

export const useAppStore = create<AppState>((set, get) => ({
  settings: structuredClone(DEFAULT_SETTINGS),
  workspaceRoot: null,
  tree: null,
  hasGit: false,
  openFiles: [],
  activePath: null,
  selectedContext: [],
  composerAttachments: [],
  lmStatus: null,
  models: [],
  session: null,
  streaming: false,
  streamBuffer: '',
  requestId: null,
  showAi: true,
  showTerminal: true,
  showCatalog: false,
  showSettings: false,
  showCanvas: false,
  showSearch: false,
  showMcpPanel: false,
  showAgentsPanel: false,
  showCompanionPanel: false,
  showPreview: false,
  showProjectWizard: false,
  showProjectPanel: false,
  projectWizardSeed: null,
  projectPlan: null,
  projectGenBusy: false,
  checkpoints: [],
  rememberedProjects: [],
  searchQuery: '',
  terminalLog: '',
  pendingCommand: null,
  catalog: [],
  catalogQuery: '',
  catalogCategory: 'all',
  selectedCatalogId: null,
  error: null,
  radialOpen: false,
  radialPos: null,
  selectionText: '',
  syntaxDimming: false,
  activeAgentName: null,
  companionHealth: null,
  hardware: null,
  discoveredProviders: [],
  gitSnapshot: null,
  previewUrl: null,
  previewRoot: null,
  ghostIndex: 0,
  canvasFocusPath: null,
  mcpQuery: '',
  mcpLoading: false,
  mcpProbes: {},

  bootstrap: async () => {
    let settings = await window.forge.getSettings()
    const catalog = await window.forge.listCatalog()
    // Gift defaults: enable stretch polish tools unless the user already chose otherwise
    const stretchPatch: Record<string, boolean> = {}
    for (const id of [
      'optional-ambient-radial',
      'optional-syntax-dimming',
      'optional-canvas',
      'thirdparty-mcp-dock',
      'builtin-mcp-stdio'
    ] as const) {
      if (settings.enabledTools[id] === undefined) stretchPatch[id] = true
    }
    if (Object.keys(stretchPatch).length) {
      settings = await window.forge.updateSettings({
        enabledTools: { ...settings.enabledTools, ...stretchPatch }
      })
    }
    set({
      settings,
      catalog,
      session: emptySession(),
      syntaxDimming: settings.enabledTools['optional-syntax-dimming'] !== false,
      // Canvas is opt-in via TitleBar — do not steal the editor on boot.
      showCanvas: false
    })
    await get().refreshLm()
    await get().refreshRememberedProjects()
  },

  openProject: async (path?: string) => {
    try {
      const result = await window.forge.openWorkspace(path)
      if (!result) return
      set({
        workspaceRoot: result.root,
        tree: result.tree,
        hasGit: result.hasGit,
        openFiles: [],
        activePath: null,
        selectedContext: [],
        session: emptySession(result.root),
        error: null,
        settings: await window.forge.getSettings(),
        showProjectWizard: false
      })
      await get().refreshCheckpoints()
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) })
    }
  },

  openFile: async (path: string) => {
    try {
      const existing = get().openFiles.find((f) => f.path === path)
      if (existing) {
        set({ activePath: path })
        return
      }
      const file = await window.forge.readFile(path)
      const openFile: OpenFile = {
        path: file.path,
        relativePath: file.relativePath,
        content: file.content,
        originalContent: file.content,
        language: detectLanguage(file.path),
        dirty: false
      }
      set({
        openFiles: [...get().openFiles, openFile],
        activePath: file.path,
        error: null
      })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) })
    }
  },

  closeFile: (path: string) => {
    const files = get().openFiles.filter((f) => f.path !== path)
    const activePath =
      get().activePath === path ? (files[files.length - 1]?.path ?? null) : get().activePath
    set({
      openFiles: files,
      activePath,
      selectedContext: get().selectedContext.filter((p) => p !== path)
    })
  },

  setActive: (path: string) => set({ activePath: path }),

  updateFileContent: (path: string, content: string) => {
    set({
      openFiles: get().openFiles.map((f) =>
        f.path === path ? { ...f, content, dirty: content !== f.originalContent } : f
      )
    })
  },

  saveActive: async () => {
    const { activePath, openFiles } = get()
    const file = openFiles.find((f) => f.path === activePath)
    if (!file || !file.dirty) return
    await window.forge.writeFile(file.path, file.content)
    set({
      openFiles: get().openFiles.map((f) =>
        f.path === file.path ? { ...f, originalContent: f.content, dirty: false } : f
      )
    })
  },

  toggleContext: (path: string) => {
    const selected = get().selectedContext
    set({
      selectedContext: selected.includes(path)
        ? selected.filter((p) => p !== path)
        : [...selected, path]
    })
  },

  addComposerAttachments: (attachments) => {
    const merged = [...get().composerAttachments]
    for (const a of attachments) {
      if (!merged.some((m) => m.id === a.id)) merged.push(a)
    }
    set({ composerAttachments: merged.slice(0, 8) })
  },

  removeComposerAttachment: (id) => {
    set({ composerAttachments: get().composerAttachments.filter((a) => a.id !== id) })
  },

  clearComposerAttachments: () => set({ composerAttachments: [] }),

  pickComposerAttachments: async () => {
    try {
      const result = await window.forge.pickAttachments()
      if (!result.ok) {
        set({ error: result.error })
        return
      }
      if (result.attachments.length) {
        get().addComposerAttachments(result.attachments)
        const warns = result.attachments.map((a) => a.warning).filter(Boolean)
        if (warns.length) set({ error: warns[0] ?? null })
      }
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) })
    }
  },

  ingestDroppedFiles: async (files) => {
    if (!files.length) return
    try {
      const payloads: Array<{ name: string; mimeType?: string; dataBase64: string }> = []
      for (const file of files) {
        const buf = await file.arrayBuffer()
        const bytes = new Uint8Array(buf)
        let binary = ''
        const chunk = 0x8000
        for (let i = 0; i < bytes.length; i += chunk) {
          binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
        }
        payloads.push({
          name: file.name,
          mimeType: file.type || undefined,
          dataBase64: btoa(binary)
        })
      }
      const result = await window.forge.ingestAttachmentBuffers(payloads)
      if (!result.ok) {
        set({ error: result.error })
        return
      }
      get().addComposerAttachments(result.attachments)
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) })
    }
  },

  refreshLm: async () => {
    try {
      const result = await window.forge.testLm()
      set({ lmStatus: result, models: result.models, error: null })
      const settings = get().settings
      if (!settings.provider.model && result.models[0]) {
        await get().selectModel(result.models[0].id)
      }
    } catch (err) {
      set({
        lmStatus: {
          status: 'error',
          message: err instanceof Error ? err.message : String(err),
          models: [],
          baseUrl: get().settings.provider.baseUrl
        }
      })
    }
  },

  selectModel: async (model: string) => {
    const adjusted = applyContextWindowOnModelChange({
      provider: { ...get().settings.provider, model },
      nextModelId: model,
      models: get().models
    })
    const settings = await window.forge.updateSettings({
      provider: adjusted.provider
    })
    set({
      settings,
      error: adjusted.cleared
        ? (adjusted.warning ?? 'Context window cleared after model switch.')
        : get().error
    })
  },

  sendPrompt: async (prompt: string) => {
    const trimmed = prompt.trim()
    if (!trimmed || get().streaming) return

    // Greenfield "build me an app" belongs in the project generator — chat diffs
    // only edit the open workspace and often refuse without attached context.
    if (isProjectGenerationIntent(trimmed)) {
      get().openProjectWizard(trimmed)
      set({
        error: null,
        showAi: true
      })
      return
    }

    const size = checkPromptSize(trimmed)
    if (!size.ok) {
      set({ error: size.message ?? 'Prompt is too large to send safely.' })
      return
    }

    const settings = get().settings
    const team = normalizeAgentTeam(settings.agentTeam)
    const featureOn = settings.enabledTools['optional-multi-agent'] !== false
    const multiGate = canRunMultiAgent({
      teamEnabled: team.enabled,
      featureEnabled: featureOn,
      model: settings.provider.model,
      agents: team.agents
    })
    const useMulti = team.enabled && featureOn
    if (useMulti && !multiGate.ok) {
      set({ error: multiGate.message ?? 'Cannot run multi-agent team.' })
      return
    }

    const attachments = [...get().composerAttachments]
    const preparedAttachments = prepareAttachmentContext(attachments, settings.provider.model)
    const userContent = buildUserMessageContent(size.text, preparedAttachments)
    const displayContent = contentToPlainText(userContent)

    const requestId = await window.forge.newId()
    const session = get().session ?? emptySession(get().workspaceRoot ?? undefined)
    const userMsg: ChatMessage = {
      id: await window.forge.newId(),
      role: 'user',
      content: displayContent,
      createdAt: Date.now(),
      contextFiles: [...get().selectedContext],
      attachmentNames: attachments.map((a) => a.name)
    }

    const openFiles = get().openFiles
    const provider = settings.provider
    const preparedContext = prepareContextFiles(
      openFiles
        .filter((f) => get().selectedContext.includes(f.path))
        .map((f) => ({
          path: f.path,
          relativePath: f.relativePath,
          content: f.content
        })),
      {
        contextWindowTokens: provider.contextWindowTokens,
        maxOutputTokens: provider.maxOutputTokens ?? 4096,
        reservedPromptTokens: Math.ceil(displayContent.length / 4)
      }
    )
    const contextFiles = preparedContext.files

    const assistantId = await window.forge.newId()
    const nextSession: ChatSession = {
      ...session,
      title: session.messages.length ? session.title : size.text.slice(0, 48),
      updatedAt: Date.now(),
      messages: [
        ...session.messages,
        userMsg,
        {
          id: assistantId,
          role: 'assistant',
          content: '',
          createdAt: Date.now()
        }
      ]
    }

    const attachWarn =
      preparedAttachments.warnings[0] ??
      (preparedAttachments.skippedImages.length
        ? `Image(s) not sent as vision: ${preparedAttachments.skippedImages.join(', ')}`
        : null)

    set({
      session: nextSession,
      streaming: true,
      streamBuffer: '',
      requestId,
      activeAgentName: useMulti ? enabledAgentsLabel(team.agents) : null,
      composerAttachments: [],
      error: size.message ?? preparedContext.message ?? attachWarn
    })

    let liveBuffer = ''
    let lastUiFlush = 0
    let pendingBuffer: string | null = null
    let flushTimer: ReturnType<typeof setTimeout> | null = null

    const paintStream = (buffer: string) => {
      set({
        streamBuffer: buffer,
        session: {
          ...get().session!,
          messages: get().session!.messages.map((m) =>
            m.id === assistantId ? { ...m, content: buffer } : m
          )
        }
      })
    }

    const flushStreamUi = (buffer: string, force = false) => {
      const now = Date.now()
      if (!force && now - lastUiFlush < STREAM_UI_MIN_INTERVAL_MS) {
        pendingBuffer = buffer
        if (!flushTimer) {
          flushTimer = setTimeout(() => {
            flushTimer = null
            if (pendingBuffer != null) {
              const latest = pendingBuffer
              pendingBuffer = null
              lastUiFlush = Date.now()
              paintStream(latest)
            }
          }, STREAM_UI_MIN_INTERVAL_MS)
        }
        return
      }
      lastUiFlush = now
      pendingBuffer = null
      paintStream(buffer)
    }

    const unsub = window.forge.onChatChunk(({ requestId: id, chunk }) => {
      if (id !== requestId) return
      if (chunk.type === 'agent_start' && chunk.agentName) {
        set({ activeAgentName: chunk.agentName })
      }
      if (chunk.type === 'agent_done') {
        set({ activeAgentName: chunk.agentName ? `${chunk.agentName} ✓` : null })
      }
      if (chunk.type === 'delta' && chunk.content) {
        liveBuffer += chunk.content
        flushStreamUi(liveBuffer)
      }
    })

    try {
      const history = nextSession.messages
        .filter((m) => m.id !== assistantId)
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => {
          if (m.id === userMsg.id) {
            return {
              role: 'user' as const,
              content: userContent
            }
          }
          return {
            role: m.role as 'user' | 'assistant',
            content: m.content
          }
        })

      let finalContent = ''
      let proposedEdits: ProposedEdit[] = []
      let agentRun: ChatMessage['agentRun']

      if (useMulti) {
        const teamResult = await window.forge.runTeam({
          requestId,
          messages: history,
          contextFiles,
          attachmentText: preparedAttachments.textBlocks.join('\n\n') || undefined
        })
        finalContent = teamResult.content || liveBuffer || get().streamBuffer
        proposedEdits = teamResult.proposedEdits
        agentRun = teamResult.agentRun
      } else {
        const chatResult = await window.forge.chat({
          requestId,
          messages: history,
          contextFiles
        })
        finalContent = chatResult.content || liveBuffer || get().streamBuffer
        proposedEdits = chatResult.proposedEdits
      }

      if (flushTimer) {
        clearTimeout(flushTimer)
        flushTimer = null
      }

      const finalSession: ChatSession = {
        ...get().session!,
        updatedAt: Date.now(),
        messages: get().session!.messages.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                content: finalContent,
                proposedEdits,
                ...(agentRun ? { agentRun } : {})
              }
            : m
        )
      }
      set({
        session: finalSession,
        streamBuffer: finalContent,
        streaming: false,
        requestId: null,
        activeAgentName: null,
        ghostIndex: 0,
        showAi: true,
        error: preparedContext.message ?? null
      })
      try {
        await window.forge.saveChatSession(finalSession)
      } catch (persistErr) {
        set({
          error:
            persistErr instanceof Error
              ? persistErr.message
              : 'Chat completed but history could not be saved.'
        })
      }

      const cmdMatch = finalContent.match(/```(?:bash|sh|shell)\n([\s\S]*?)```/i)
      if (cmdMatch && get().settings.enabledTools['builtin-terminal'] !== false) {
        get().proposeCommand(cmdMatch[1].trim(), 'Suggested by AI response')
      }
    } catch (err) {
      if (flushTimer) {
        clearTimeout(flushTimer)
        flushTimer = null
      }
      const message = err instanceof Error ? err.message : String(err)
      set({
        streaming: false,
        requestId: null,
        activeAgentName: null,
        session: {
          ...get().session!,
          messages: get().session!.messages.map((m) =>
            m.id === assistantId
              ? { ...m, error: message, content: m.content || liveBuffer || message }
              : m
          )
        },
        error: message
      })
    } finally {
      unsub()
    }
  },

  generateTeam: async (description: string) => {
    const requestId = await window.forge.newId()
    return window.forge.generateTeam({ requestId, description })
  },

  cancelPrompt: async () => {
    const id = get().requestId
    if (!id) return
    await window.forge.cancelChat(id)
    set({ streaming: false, requestId: null, activeAgentName: null })
  },

  decideEdit: async (edit, decision, opts) => {
    if (decision === 'accepted' && !opts?.skipConfirm) {
      const ok = await window.forge.confirm(
        'Apply AI edit?',
        `This will overwrite:\n${edit.relativePath}\n\n${edit.summary}`
      )
      if (!ok) return
    }
    const updated = await window.forge.applyEdit(edit, decision)
    const session = get().session
    if (!session) return
    const next: ChatSession = {
      ...session,
      messages: session.messages.map((m) => ({
        ...m,
        proposedEdits: m.proposedEdits?.map((e) => (e.id === edit.id ? updated : e))
      }))
    }
    set({ session: next, ghostIndex: 0 })
    if (decision === 'accepted') {
      const open = get().openFiles.find((f) => f.path === edit.path)
      if (open) {
        set({
          openFiles: get().openFiles.map((f) =>
            f.path === edit.path
              ? {
                  ...f,
                  content: edit.proposedContent,
                  originalContent: edit.proposedContent,
                  dirty: false
                }
              : f
          )
        })
      } else if (edit.path) {
        try {
          await get().openFile(edit.path)
          set({
            openFiles: get().openFiles.map((f) =>
              f.path === edit.path
                ? {
                    ...f,
                    content: edit.proposedContent,
                    originalContent: edit.proposedContent,
                    dirty: false
                  }
                : f
            )
          })
        } catch {
          // file may be new relative path only
        }
      }
      const tree = await window.forge.getTree()
      if (tree) set({ tree })
    }
    await window.forge.saveChatSession(next)
  },

  runIntent: async (intent) => {
    const selection = get().selectionText.trim()
    const active = get().openFiles.find((f) => f.path === get().activePath)
    if (active && !get().selectedContext.includes(active.path)) {
      get().toggleContext(active.path)
    }
    const snippet = selection
      ? `\n\nSelected snippet:\n\`\`\`\n${selection.slice(0, 4000)}\n\`\`\``
      : ''
    const prompts: Record<typeof intent, string> = {
      extract:
        'Extract a clean reusable function/module from the attached context (and snippet if any). Propose the edit as a reviewable file diff.' +
        snippet,
      optimize:
        'Optimize the attached context for clarity and performance without changing behavior. Propose a reviewable diff.' +
        snippet,
      tests:
        'Propose focused unit tests for the attached context / selection as a new or updated test file diff.' +
        snippet,
      explain:
        'Explain the attached context / selection briefly: purpose, key flows, and pitfalls.' +
        snippet
    }
    get().setShow('showAi', true)
    get().setRadialOpen(false)
    await get().sendPrompt(prompts[intent])
  },

  loadCatalog: async () => {
    const catalog = await window.forge.listCatalog()
    set({ catalog })
  },

  setToolEnabled: async (id, enabled) => {
    try {
      const settings = await window.forge.setToolEnabled(id, enabled)
      set({
        settings,
        syntaxDimming: Boolean(settings.enabledTools['optional-syntax-dimming']),
        // Disabling the canvas tool closes canvas; enabling it does not force it open.
        showCanvas: id === 'optional-canvas' && !enabled ? false : get().showCanvas,
        error: null
      })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) })
    }
  },

  updateSettings: async (partial) => {
    const settings = await window.forge.updateSettings(partial)
    set({ settings })
    if (partial.provider) await get().refreshLm()
  },

  runSearch: async (query: string) => {
    set({ searchQuery: query, showSearch: true })
  },

  proposeCommand: (command, reason) => {
    set({
      pendingCommand: { id: crypto.randomUUID(), command, reason },
      showTerminal: true
    })
  },

  approveCommand: async () => {
    const pending = get().pendingCommand
    if (!pending) return
    set({ pendingCommand: null })
    set({
      terminalLog: get().terminalLog + `\n$ ${pending.command}\n`
    })
    const result = await window.forge.runApprovedCommand({
      command: pending.command,
      confirm: true
    })
    if (!result.ok) {
      set({
        terminalLog: get().terminalLog + `(blocked/error) ${result.error ?? 'failed'}\n`,
        error: result.error ?? 'Command failed'
      })
      return
    }
    set({
      terminalLog:
        get().terminalLog +
        (result.stdout || '') +
        (result.stderr || '') +
        `\n[exit ${result.code}]\n`
    })
  },

  rejectCommand: () => set({ pendingCommand: null }),

  setShow: (key, value) => set({ [key]: value } as Partial<AppState>),
  setCatalogFilters: (query, category) => set({ catalogQuery: query, catalogCategory: category }),
  selectCatalog: (id) => set({ selectedCatalogId: id }),
  setError: (error) => set({ error }),
  setRadialOpen: (open, pos = null) => set({ radialOpen: open, radialPos: open ? pos : null }),
  setSelectionText: (text) => set({ selectionText: text }),
  setGhostIndex: (index) => set({ ghostIndex: index }),
  setCanvasFocusPath: (path) => set({ canvasFocusPath: path }),

  setMcpQuery: (query) => set({ mcpQuery: query }),

  upsertMcpServer: async (input) => {
    try {
      const settings = await window.forge.upsertMcpServer(input)
      set({ settings, error: null })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) })
    }
  },

  removeMcpServer: async (id) => {
    try {
      const settings = await window.forge.removeMcpServer(id)
      const probes = { ...get().mcpProbes }
      delete probes[id]
      set({ settings, mcpProbes: probes, error: null })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) })
    }
  },

  refreshCompanion: async () => {
    try {
      const health = await window.forge.companionHealth()
      set({ companionHealth: health, error: health.reachable ? null : health.message })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) })
    }
  },

  pairCompanion: async (code) => {
    const result = await window.forge.companionPair(code)
    if (result.ok) {
      const settings = await window.forge.getSettings()
      set({ settings, error: null })
      await get().refreshCompanion()
    }
    return result
  },

  disconnectCompanion: async () => {
    const settings = await window.forge.companionDisconnect()
    set({ settings, companionHealth: null, error: null })
  },

  refreshHardware: async () => {
    try {
      const hardware = await window.forge.hardwareInventory()
      set({ hardware })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) })
    }
  },

  discoverLocalProviders: async () => {
    try {
      const discoveredProviders = await window.forge.discoverProviders()
      set({ discoveredProviders, error: null })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) })
    }
  },

  applyDiscoveredProvider: async (provider) => {
    if (!provider.reachable || !provider.baseUrl) return
    const isOllama = provider.kind === 'ollama'
    const model = provider.models[0]?.id ?? ''
    const settings = await window.forge.updateSettings({
      provider: {
        ...get().settings.provider,
        mode: 'local',
        baseUrl: isOllama ? `${provider.baseUrl.replace(/\/+$/, '')}/v1` : provider.baseUrl,
        model,
        apiKey: get().settings.provider.apiKey
      }
    })
    set({ settings, error: null })
    await get().refreshLm()
  },

  refreshGit: async () => {
    try {
      const gitSnapshot = await window.forge.gitSnapshot()
      set({ gitSnapshot })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) })
    }
  },

  startPreview: async (previewDir) => {
    const result = await window.forge.previewStart(previewDir)
    if (!result.ok) {
      set({ error: result.message, previewUrl: null, previewRoot: null })
      return
    }
    set({
      previewUrl: result.url,
      previewRoot: result.root,
      showPreview: true,
      error: null,
      settings: await window.forge.getSettings()
    })
  },

  stopPreview: async () => {
    await window.forge.previewStop()
    set({ previewUrl: null, previewRoot: null })
  },

  refreshMcpTools: async (serverId) => {
    set({ mcpLoading: true })
    try {
      if (serverId) {
        const probe = await window.forge.probeMcpServer(serverId)
        set({
          mcpProbes: { ...get().mcpProbes, [serverId]: probe },
          mcpLoading: false,
          error: probe.status === 'error' ? probe.message : null
        })
      } else {
        const probes = await window.forge.probeAllMcpServers()
        set({ mcpProbes: probes, mcpLoading: false, error: null })
      }
    } catch (err) {
      set({
        mcpLoading: false,
        error: err instanceof Error ? err.message : String(err)
      })
    }
  },

  openProjectWizard: (seed) =>
    set({
      showProjectWizard: true,
      projectWizardSeed: seed?.trim() ? seed.trim() : null,
      error: null
    }),
  closeProjectWizard: () => set({ showProjectWizard: false, projectWizardSeed: null }),
  clearProjectWizardSeed: () => set({ projectWizardSeed: null }),

  planAiProject: async (input) => {
    set({ projectGenBusy: true, error: null })
    try {
      const requestId = await window.forge.newId()
      const result = await window.forge.planProject({ requestId, ...input })
      if (!result.ok || !result.plan) {
        set({
          projectGenBusy: false,
          error: result.ok === false ? result.error : 'Planning failed'
        })
        return result.plan ?? null
      }
      set({ projectPlan: result.plan, projectGenBusy: false })
      return result.plan
    } catch (err) {
      set({
        projectGenBusy: false,
        error: err instanceof Error ? err.message : String(err)
      })
      return null
    }
  },

  materializeAiProject: async (plan, opts) => {
    set({ projectGenBusy: true, error: null })
    try {
      let parent: string | null = null
      if (opts?.useDefaultParent) {
        parent = await window.forge.defaultProjectParent()
      } else {
        parent = await window.forge.pickProjectParent()
      }
      if (!parent) {
        set({
          projectGenBusy: false,
          error: opts?.useDefaultParent ? 'Could not resolve default projects folder.' : null
        })
        return false
      }
      const result = await window.forge.materializeProject(parent, plan)
      if (!result.ok) {
        set({ projectGenBusy: false, error: result.error })
        return false
      }
      set({
        workspaceRoot: result.root,
        tree: result.tree,
        hasGit: result.hasGit,
        openFiles: [],
        activePath: null,
        selectedContext: [],
        session: emptySession(result.root),
        projectGenBusy: false,
        showProjectWizard: false,
        projectPlan: plan,
        settings: await window.forge.getSettings(),
        error: null
      })
      await get().refreshCheckpoints()
      await get().refreshRememberedProjects()
      // Open README or index when present
      const prefer = ['README.md', 'index.html', 'package.json', 'app.js']
      const findPrefer = (node: FileNode | null): string | null => {
        if (!node?.children) return null
        for (const name of prefer) {
          const hit = node.children.find((c) => !c.isDirectory && c.name === name)
          if (hit) return hit.path
        }
        const firstFile = node.children.find((c) => !c.isDirectory)
        return firstFile?.path ?? null
      }
      const openPath = findPrefer(result.tree)
      if (openPath) await get().openFile(openPath)
      return true
    } catch (err) {
      set({
        projectGenBusy: false,
        error: err instanceof Error ? err.message : String(err)
      })
      return false
    }
  },

  refreshCheckpoints: async () => {
    try {
      const checkpoints = await window.forge.listCheckpoints()
      set({ checkpoints })
    } catch {
      set({ checkpoints: [] })
    }
  },

  createProjectCheckpoint: async (label) => {
    try {
      const result = await window.forge.createCheckpoint(label)
      if (!result.ok) {
        set({ error: result.error })
        return
      }
      await get().refreshCheckpoints()
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) })
    }
  },

  restoreProjectCheckpoint: async (id) => {
    try {
      const result = await window.forge.restoreCheckpoint(id)
      if (!result.ok) {
        if (result.error !== 'Cancelled') set({ error: result.error })
        return
      }
      if (result.tree) set({ tree: result.tree, openFiles: [], activePath: null })
      await get().refreshCheckpoints()
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) })
    }
  },

  exportOpenProject: async () => {
    try {
      const result = await window.forge.exportProjectZip()
      if (!result.ok) {
        if (result.error !== 'Cancelled') set({ error: result.error })
        return
      }
      set({ error: null })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) })
    }
  },

  refreshRememberedProjects: async () => {
    try {
      const rememberedProjects = await window.forge.rememberedProjects()
      set({ rememberedProjects })
    } catch {
      set({ rememberedProjects: [] })
    }
  }
}))
