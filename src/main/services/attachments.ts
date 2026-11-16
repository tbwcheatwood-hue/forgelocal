import { randomUUID } from 'crypto'
import fs from 'fs/promises'
import path from 'path'
import mammoth from 'mammoth'
import { PDFParse } from 'pdf-parse'
import {
  ATTACH_IMAGE_MAX_BYTES,
  ATTACH_MAX_FILE_BYTES,
  classifyAttachment,
  guessMimeType,
  truncateAttachmentText,
  validateAttachmentBatch,
  type ComposerAttachment
} from '../../shared/attachments'
import { assertSafeWorkspacePath, redactSecrets } from './security'

export interface IngestBufferInput {
  name: string
  mimeType?: string
  dataBase64: string
}

export class AttachmentsService {
  async ingestPaths(
    paths: string[],
    workspaceRoot: string | null,
    allowOutside: boolean
  ): Promise<{ ok: true; attachments: ComposerAttachment[] } | { ok: false; error: string }> {
    const sizes: Array<{ name: string; sizeBytes: number }> = []
    const resolved: Array<{ path: string; name: string; sizeBytes: number }> = []

    for (const raw of paths) {
      const safety = assertSafeWorkspacePath(raw, workspaceRoot, allowOutside)
      if (!safety.ok) {
        return {
          ok: false,
          error: safety.requiresApproval
            ? `${safety.error} Enable outside-workspace paths in Settings, or pick a file inside the project.`
            : safety.error
        }
      }
      const st = await fs.stat(safety.path).catch(() => null)
      if (!st || !st.isFile()) {
        return { ok: false, error: `Not a readable file: ${path.basename(raw)}` }
      }
      const name = path.basename(safety.path)
      sizes.push({ name, sizeBytes: st.size })
      resolved.push({ path: safety.path, name, sizeBytes: st.size })
    }

    const batch = validateAttachmentBatch(sizes)
    if (!batch.ok) return { ok: false, error: batch.message ?? 'Invalid attachment batch' }

    const attachments: ComposerAttachment[] = []
    for (const item of resolved) {
      const buf = await fs.readFile(item.path)
      const att = await this.processBuffer({
        name: item.name,
        mimeType: guessMimeType(item.name),
        buffer: buf,
        path: item.path,
        relativePath: workspaceRoot
          ? path.relative(workspaceRoot, item.path).split(path.sep).join('/')
          : item.name
      })
      attachments.push(att)
    }
    return { ok: true, attachments }
  }

  async ingestBuffers(
    files: IngestBufferInput[]
  ): Promise<{ ok: true; attachments: ComposerAttachment[] } | { ok: false; error: string }> {
    const decoded: Array<{ name: string; mimeType: string; buffer: Buffer }> = []
    for (const f of files) {
      const name = (f.name || 'attachment').slice(0, 260)
      let buffer: Buffer
      try {
        buffer = Buffer.from(f.dataBase64, 'base64')
      } catch {
        return { ok: false, error: `Could not decode "${name}".` }
      }
      decoded.push({
        name,
        mimeType: f.mimeType || guessMimeType(name),
        buffer
      })
    }
    const batch = validateAttachmentBatch(
      decoded.map((d) => ({ name: d.name, sizeBytes: d.buffer.length }))
    )
    if (!batch.ok) return { ok: false, error: batch.message ?? 'Invalid attachment batch' }

    const attachments: ComposerAttachment[] = []
    for (const d of decoded) {
      attachments.push(
        await this.processBuffer({
          name: d.name,
          mimeType: d.mimeType,
          buffer: d.buffer
        })
      )
    }
    return { ok: true, attachments }
  }

  private async processBuffer(input: {
    name: string
    mimeType: string
    buffer: Buffer
    path?: string
    relativePath?: string
  }): Promise<ComposerAttachment> {
    const kind = classifyAttachment(input.name, input.mimeType)
    const base: ComposerAttachment = {
      id: randomUUID(),
      name: input.name,
      path: input.path,
      relativePath: input.relativePath,
      mimeType: input.mimeType || guessMimeType(input.name),
      kind,
      sizeBytes: input.buffer.length
    }

    if (input.buffer.length > ATTACH_MAX_FILE_BYTES) {
      return {
        ...base,
        warning: `File exceeds ${ATTACH_MAX_FILE_BYTES} byte limit and was not fully processed.`
      }
    }

    try {
      if (kind === 'image') return this.processImage(base, input.buffer)
      if (kind === 'pdf') return await this.processPdf(base, input.buffer)
      if (kind === 'docx') return await this.processDocx(base, input.buffer)
      if (kind === 'text') return this.processText(base, input.buffer)
      // other: try utf-8 sniff (printable / whitespace only)
      const sniff = input.buffer.slice(0, 4096).toString('utf8')
      const looksText =
        !sniff.includes('\u0000') &&
        [...sniff].every((ch) => {
          const c = ch.charCodeAt(0)
          return c === 9 || c === 10 || c === 13 || (c >= 32 && c < 127) || c >= 160
        })
      if (looksText && sniff.trim()) {
        return this.processText({ ...base, kind: 'text' }, input.buffer)
      }
      return {
        ...base,
        warning: 'No text extractor for this file type.'
      }
    } catch (err) {
      return {
        ...base,
        warning: redactSecrets(
          err instanceof Error ? err.message : `Failed to process attachment: ${String(err)}`
        )
      }
    }
  }

  private processImage(base: ComposerAttachment, buffer: Buffer): ComposerAttachment {
    if (buffer.length > ATTACH_IMAGE_MAX_BYTES) {
      return {
        ...base,
        warning: `Image exceeds ${ATTACH_IMAGE_MAX_BYTES.toLocaleString()} bytes for vision payloads.`
      }
    }
    const mime = base.mimeType.startsWith('image/')
      ? base.mimeType
      : guessMimeType(base.name, 'image/png')
    const imageDataUrl = `data:${mime};base64,${buffer.toString('base64')}`
    return { ...base, mimeType: mime, imageDataUrl }
  }

  private async processPdf(base: ComposerAttachment, buffer: Buffer): Promise<ComposerAttachment> {
    const parser = new PDFParse({ data: buffer })
    try {
      const result = await parser.getText()
      const raw = String(result?.text ?? '').trim()
      if (!raw) {
        return {
          ...base,
          warning:
            'PDF had no extractable text (may be scanned/image-only). No OCR is available in this build.'
        }
      }
      const { text, truncated } = truncateAttachmentText(raw)
      return {
        ...base,
        textExcerpt: text,
        warning: truncated ? 'PDF text was truncated to the attachment character limit.' : undefined
      }
    } finally {
      await parser.destroy().catch(() => undefined)
    }
  }

  private async processDocx(base: ComposerAttachment, buffer: Buffer): Promise<ComposerAttachment> {
    const result = await mammoth.extractRawText({ buffer })
    const raw = String(result.value ?? '').trim()
    if (!raw) {
      return { ...base, warning: 'DOCX contained no extractable text.' }
    }
    const { text, truncated } = truncateAttachmentText(raw)
    const messages = (result.messages || [])
      .map((m) => m.message)
      .filter(Boolean)
      .slice(0, 3)
    const warningParts = [
      truncated ? 'DOCX text was truncated to the attachment character limit.' : '',
      ...messages.map((m) => redactSecrets(m))
    ].filter(Boolean)
    return {
      ...base,
      textExcerpt: text,
      warning: warningParts.length ? warningParts.join(' ') : undefined
    }
  }

  private processText(base: ComposerAttachment, buffer: Buffer): ComposerAttachment {
    const raw = buffer.toString('utf8')
    const { text, truncated } = truncateAttachmentText(raw)
    return {
      ...base,
      textExcerpt: text,
      warning: truncated ? 'Text attachment was truncated to the character limit.' : undefined
    }
  }
}
