import fs from 'fs/promises'
import fsSync from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import JSZip from 'jszip'
import {
  buildPlanningSystemPrompt,
  buildPlanningUserPrompt,
  buildTemplatePlan,
  inferStackFromDescription,
  normalizePlanPath,
  parseProjectPlan,
  slugifyProjectName,
  type CheckpointMeta,
  type ProjectPlan,
  type ProjectRecord,
  type ProjectStack
} from '../../shared/projectGen'
import type { StreamChunk } from '../../shared/types'
import { FilesystemService } from './filesystem'
import { LmStudioService } from './lmstudio'
import { isPathInsideWorkspace } from './security'
import { SettingsService } from './settings'

const IGNORE_DIRS = new Set([
  'node_modules',
  '.git',
  'out',
  'release',
  'dist',
  '.vite',
  'coverage',
  '__pycache__',
  '.forgelocal'
])

const MAX_CHECKPOINT_FILES = 500
const MAX_EXPORT_BYTES = 80 * 1024 * 1024

export class ProjectGenService {
  constructor(
    private lm: LmStudioService,
    private fileService: FilesystemService,
    private settings: SettingsService
  ) {}

  async planProject(input: {
    requestId: string
    description: string
    answers?: Record<string, string>
    stackHint?: ProjectStack
    preferTemplate?: boolean
    onChunk?: (chunk: StreamChunk) => void
  }): Promise<{ ok: true; plan: ProjectPlan } | { ok: false; error: string; plan?: ProjectPlan }> {
    const description = input.description.trim()
    if (!description) return { ok: false, error: 'Describe the project before planning.' }

    const stack = input.stackHint ?? inferStackFromDescription(description)
    if (input.preferTemplate) {
      return { ok: true, plan: buildTemplatePlan(description, stack) }
    }

    const provider = this.settings.getSettings().provider
    if (!provider.model?.trim()) {
      const plan = buildTemplatePlan(description, stack)
      plan.warnings = [
        ...(plan.warnings ?? []),
        'No model selected — used offline template. Pick a model and re-plan for AI generation.'
      ]
      return { ok: true, plan }
    }

    try {
      let full = ''
      await this.lm.chat(
        input.requestId,
        { ...provider, stream: false },
        {
          model: provider.model,
          stream: false,
          messages: [
            { role: 'system', content: buildPlanningSystemPrompt() },
            {
              role: 'user',
              content: buildPlanningUserPrompt({
                description,
                answers: input.answers
              })
            }
          ]
        },
        (chunk) => {
          if (chunk.type === 'delta' && chunk.content) full += chunk.content
          input.onChunk?.(chunk)
        }
      )

      const parsed = parseProjectPlan(full)
      if (parsed.ok && parsed.plan) {
        // Prefer caller stack hint when model omits/mismatches lightly
        if (input.stackHint) parsed.plan.stack = input.stackHint
        return { ok: true, plan: parsed.plan }
      }

      const fallback = buildTemplatePlan(description, stack)
      fallback.warnings = [
        ...(fallback.warnings ?? []),
        parsed.message ?? 'AI plan unusable — fell back to offline template.'
      ]
      return { ok: true, plan: fallback }
    } catch (err) {
      const fallback = buildTemplatePlan(description, stack)
      fallback.warnings = [
        ...(fallback.warnings ?? []),
        `Planning failed (${err instanceof Error ? err.message : String(err)}) — offline template used.`
      ]
      return { ok: true, plan: fallback }
    }
  }

  async materialize(
    parentDir: string,
    plan: ProjectPlan
  ): Promise<
    | { ok: true; root: string; record: ProjectRecord; filesWritten: number }
    | { ok: false; error: string }
  > {
    if (!plan.files?.length) {
      return { ok: false, error: 'Plan has no files to write. Answer clarifying questions first.' }
    }
    const parent = path.resolve(parentDir)
    try {
      const stat = await fs.stat(parent)
      if (!stat.isDirectory()) return { ok: false, error: 'Parent path is not a directory.' }
    } catch {
      return { ok: false, error: 'Parent directory does not exist.' }
    }

    const slug = slugifyProjectName(plan.name)
    let root = path.join(parent, slug)
    if (fsSync.existsSync(root)) {
      root = path.join(parent, `${slug}-${Date.now().toString(36).slice(-4)}`)
    }

    await fs.mkdir(root, { recursive: true })
    let written = 0
    for (const file of plan.files) {
      const rel = normalizePlanPath(file.path)
      if (!rel) continue
      const abs = path.join(root, rel)
      if (!isPathInsideWorkspace(abs, root)) continue
      await fs.mkdir(path.dirname(abs), { recursive: true })
      await fs.writeFile(abs, file.content ?? '', 'utf8')
      written += 1
    }

    const record: ProjectRecord = {
      id: randomUUID(),
      name: plan.name,
      path: root,
      summary: plan.summary,
      stack: plan.stack,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    await this.writeProjectMeta(root, plan, record)
    this.rememberProject(record)
    return { ok: true, root, record, filesWritten: written }
  }

  async createCheckpoint(
    label?: string
  ): Promise<{ ok: true; meta: CheckpointMeta } | { ok: false; error: string }> {
    const root = this.fileService.workspaceRoot
    if (!root) return { ok: false, error: 'Open a project before creating a checkpoint.' }

    const id = randomUUID()
    const base = path.join(root, '.forgelocal', 'checkpoints', id)
    const filesDir = path.join(base, 'files')
    await fs.mkdir(filesDir, { recursive: true })

    const files = await this.listWorkspaceFiles(root)
    let count = 0
    for (const rel of files) {
      if (count >= MAX_CHECKPOINT_FILES) break
      const src = path.join(root, rel)
      const dest = path.join(filesDir, rel)
      await fs.mkdir(path.dirname(dest), { recursive: true })
      await fs.copyFile(src, dest)
      count += 1
    }

    const meta: CheckpointMeta = {
      id,
      label: (label?.trim() || `Checkpoint ${new Date().toLocaleString()}`).slice(0, 120),
      createdAt: Date.now(),
      fileCount: count,
      workspacePath: root
    }
    await fs.writeFile(path.join(base, 'meta.json'), JSON.stringify(meta, null, 2), 'utf8')
    return { ok: true, meta }
  }

  async listCheckpoints(): Promise<CheckpointMeta[]> {
    const root = this.fileService.workspaceRoot
    if (!root) return []
    const dir = path.join(root, '.forgelocal', 'checkpoints')
    let entries: string[]
    try {
      entries = await fs.readdir(dir)
    } catch {
      return []
    }
    const metas: CheckpointMeta[] = []
    for (const id of entries) {
      try {
        const raw = await fs.readFile(path.join(dir, id, 'meta.json'), 'utf8')
        const meta = JSON.parse(raw) as CheckpointMeta
        if (meta?.id) metas.push(meta)
      } catch {
        // skip corrupt
      }
    }
    return metas.sort((a, b) => b.createdAt - a.createdAt)
  }

  async restoreCheckpoint(
    id: string
  ): Promise<{ ok: true; restored: number } | { ok: false; error: string }> {
    const root = this.fileService.workspaceRoot
    if (!root) return { ok: false, error: 'No workspace open.' }
    const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '')
    if (!safeId || safeId !== id) return { ok: false, error: 'Invalid checkpoint id.' }

    const filesDir = path.join(root, '.forgelocal', 'checkpoints', safeId, 'files')
    try {
      await fs.stat(filesDir)
    } catch {
      return { ok: false, error: 'Checkpoint not found.' }
    }

    const files = await this.listDirFiles(filesDir, filesDir)
    let restored = 0
    for (const rel of files) {
      const src = path.join(filesDir, rel)
      const dest = path.join(root, rel)
      if (!isPathInsideWorkspace(dest, root)) continue
      await fs.mkdir(path.dirname(dest), { recursive: true })
      await fs.copyFile(src, dest)
      restored += 1
    }
    return { ok: true, restored }
  }

  async exportZip(
    destPath: string
  ): Promise<{ ok: true; path: string; bytes: number } | { ok: false; error: string }> {
    const root = this.fileService.workspaceRoot
    if (!root) return { ok: false, error: 'Open a project before exporting.' }

    const files = await this.listWorkspaceFiles(root)
    const zip = new JSZip()
    let total = 0
    for (const rel of files) {
      const abs = path.join(root, rel)
      const buf = await fs.readFile(abs)
      total += buf.byteLength
      if (total > MAX_EXPORT_BYTES) {
        return { ok: false, error: 'Export exceeds 80MB limit for this build.' }
      }
      zip.file(rel, buf)
    }

    const out = path.resolve(destPath)
    if (!out.toLowerCase().endsWith('.zip')) {
      return { ok: false, error: 'Export path must end with .zip' }
    }
    const content = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
    await fs.mkdir(path.dirname(out), { recursive: true })
    await fs.writeFile(out, content)
    return { ok: true, path: out, bytes: content.byteLength }
  }

  listRememberedProjects(): ProjectRecord[] {
    return this.settings.getSettings().rememberedProjects ?? []
  }

  private rememberProject(record: ProjectRecord): void {
    const current = this.listRememberedProjects()
    const next = [record, ...current.filter((p) => p.path !== record.path)].slice(0, 24)
    this.settings.updateSettings({ rememberedProjects: next })
  }

  private async writeProjectMeta(
    root: string,
    plan: ProjectPlan,
    record: ProjectRecord
  ): Promise<void> {
    const dir = path.join(root, '.forgelocal')
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(
      path.join(dir, 'project.json'),
      JSON.stringify(
        {
          ...record,
          summary: plan.summary,
          stack: plan.stack,
          features: plan.features,
          source: plan.source,
          scripts: plan.scripts,
          generatedAt: Date.now()
        },
        null,
        2
      ),
      'utf8'
    )
  }

  private async listWorkspaceFiles(root: string): Promise<string[]> {
    return this.listDirFiles(root, root)
  }

  private async listDirFiles(dir: string, root: string): Promise<string[]> {
    const out: string[] = []
    const walk = async (current: string) => {
      if (out.length >= MAX_CHECKPOINT_FILES) return
      let entries
      try {
        entries = await fs.readdir(current, { withFileTypes: true })
      } catch {
        return
      }
      for (const entry of entries) {
        if (out.length >= MAX_CHECKPOINT_FILES) return
        if (IGNORE_DIRS.has(entry.name)) continue
        // Allow .forgelocal only when walking checkpoint restore source; skip at workspace root
        if (entry.name.startsWith('.') && entry.name !== '.') continue
        const full = path.join(current, entry.name)
        if (entry.isDirectory()) {
          await walk(full)
        } else if (entry.isFile()) {
          out.push(path.relative(root, full).split(path.sep).join('/'))
        }
      }
    }
    await walk(dir)
    return out
  }
}
