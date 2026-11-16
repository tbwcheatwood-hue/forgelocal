import { create } from 'zustand'
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

  bootstrap: () => Promise<void>
  openProject: (path?: string) => Promise<void>
  openFile: (path: string) => Promise<void>
  closeFile: (path: string) => void
  setActive: (path: string) => void
  updateFileContent: (path: string, content: string) => void
  saveActive: () => Promise<void>
  toggleContext: (path: string) => void
  refreshLm: () => Promise<void>
  selectModel: (model: string) => Promise<void>
  sendPrompt: (prompt: string) => Promise<void>
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
      | 'showMcpPanel',
    value: boolean
  ) => void
  setCatalogFilters: (query: string, category: string) => void
  selectCatalog: (id: string | null) => void
  setError: (error: string | null) => void
  setRadialOpen: (open: boolean, pos?: { x: number; y: number } | null) => void
  setSelectionText: (text: string) => void
  setGhostIndex: (index: number) => void
  setCanvasFocusPath: (path: string | null) => void
  popoutIde: () => Promise<void>
  applyPopoutBootstrap: () => Promise<void>
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

export const useAppStore = create<AppState>((set, get) => ({
  settings: structuredClone(DEFAULT_SETTINGS),
  workspaceRoot: null,
  tree: null,
  hasGit: false,
  openFiles: [],
  activePath: null,
  selectedContext: [],
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
  ghostIndex: 0,
  canvasFocusPath: null,

  bootstrap: async () => {
    let settings = await window.forge.getSettings()
    const catalog = await window.forge.listCatalog()
    // Gift defaults: enable stretch polish tools unless the user already chose otherwise
    const stretchPatch: Record<string, boolean> = {}
    for (const id of [
      'optional-ambient-radial',
      'optional-syntax-dimming',
      'optional-canvas'
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
      showCanvas: Boolean(settings.enabledTools['optional-canvas'])
    })
    await get().refreshLm()
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
        settings: await window.forge.getSettings()
      })
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
    const settings = await window.forge.updateSettings({
      provider: { ...get().settings.provider, model }
    })
    set({ settings })
  },

  popoutIde: async () => {
    try {
      const state = get()
      await window.forge.popoutIde({
        workspaceRoot: state.workspaceRoot,
        openFilePaths: state.openFiles.map((f) => f.path),
        activePath: state.activePath,
        selectedContext: [...state.selectedContext]
      })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) })
    }
  },

  applyPopoutBootstrap: async () => {
    try {
      const boot = await window.forge.getPopoutBootstrap()
      if (!boot?.workspaceRoot) return
      await get().openProject(boot.workspaceRoot)
      for (const path of boot.openFilePaths) {
        try {
          await get().openFile(path)
        } catch {
          // skip missing files
        }
      }
      if (boot.activePath) get().setActive(boot.activePath)
      if (boot.selectedContext.length) {
        set({ selectedContext: boot.selectedContext })
      }
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) })
    }
  },

  sendPrompt: async (prompt: string) => {
    const trimmed = prompt.trim()
    if (!trimmed || get().streaming) return

    const requestId = await window.forge.newId()
    const session = get().session ?? emptySession(get().workspaceRoot ?? undefined)
    const userMsg: ChatMessage = {
      id: await window.forge.newId(),
      role: 'user',
      content: trimmed,
      createdAt: Date.now(),
      contextFiles: [...get().selectedContext]
    }

    const openFiles = get().openFiles
    const contextFiles = openFiles
      .filter((f) => get().selectedContext.includes(f.path))
      .map((f) => ({
        path: f.path,
        relativePath: f.relativePath,
        content: f.content
      }))

    const assistantId = await window.forge.newId()
    const nextSession: ChatSession = {
      ...session,
      title: session.messages.length ? session.title : trimmed.slice(0, 48),
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

    set({
      session: nextSession,
      streaming: true,
      streamBuffer: '',
      requestId,
      error: null
    })

    const unsub = window.forge.onChatChunk(({ requestId: id, chunk }) => {
      if (id !== requestId) return
      if (chunk.type === 'delta' && chunk.content) {
        const buffer = get().streamBuffer + chunk.content
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
    })

    try {
      const history = nextSession.messages
        .filter((m) => m.id !== assistantId)
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content
        }))

      const result = await window.forge.chat({
        requestId,
        messages: history,
        contextFiles
      })

      const finalSession: ChatSession = {
        ...get().session!,
        updatedAt: Date.now(),
        messages: get().session!.messages.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                content: result.content || get().streamBuffer,
                proposedEdits: result.proposedEdits
              }
            : m
        )
      }
      set({
        session: finalSession,
        streaming: false,
        requestId: null,
        ghostIndex: 0,
        showAi: true
      })
      await window.forge.saveChatSession(finalSession)

      const cmdMatch = result.content.match(/```(?:bash|sh|shell)\n([\s\S]*?)```/i)
      if (cmdMatch && get().settings.enabledTools['builtin-terminal'] !== false) {
        get().proposeCommand(cmdMatch[1].trim(), 'Suggested by AI response')
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      set({
        streaming: false,
        requestId: null,
        session: {
          ...get().session!,
          messages: get().session!.messages.map((m) =>
            m.id === assistantId ? { ...m, error: message, content: m.content || message } : m
          )
        },
        error: message
      })
    } finally {
      unsub()
    }
  },

  cancelPrompt: async () => {
    const id = get().requestId
    if (!id) return
    await window.forge.cancelChat(id)
    set({ streaming: false, requestId: null })
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
        showCanvas: Boolean(settings.enabledTools['optional-canvas']),
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
    const result = await window.forge.runApprovedCommand({ command: pending.command })
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
  setCanvasFocusPath: (path) => set({ canvasFocusPath: path })
}))

export function isPopoutWindow(): boolean {
  if (typeof window === 'undefined') return false
  return new URLSearchParams(window.location.search).get('popout') === '1'
}
