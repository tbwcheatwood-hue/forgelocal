/**
 * Composer attachments for chat context (images, PDF, docx, text).
 * OpenAI-compatible multimodal parts when the model likely supports vision.
 */

export const ATTACH_MAX_FILE_BYTES = 12 * 1024 * 1024 // 12 MiB per file
export const ATTACH_MAX_TOTAL_BYTES = 28 * 1024 * 1024 // 28 MiB batch
export const ATTACH_MAX_COUNT = 8
export const ATTACH_TEXT_MAX_CHARS = 80_000
export const ATTACH_IMAGE_MAX_BYTES = 8 * 1024 * 1024 // 8 MiB for vision payloads

export type AttachmentKind = 'image' | 'pdf' | 'docx' | 'text' | 'other'

export type ChatContentPart =
  { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }

export type ChatMessageContent = string | ChatContentPart[]

export interface ComposerAttachment {
  id: string
  name: string
  /** Absolute path when ingested from disk; omitted for pure buffers. */
  path?: string
  relativePath?: string
  mimeType: string
  kind: AttachmentKind
  sizeBytes: number
  /** Extracted / readable text for PDF, docx, text files. */
  textExcerpt?: string
  /** data:image/...;base64,... when vision-ready. */
  imageDataUrl?: string
  /** Honest limitation / truncation note (never secrets). */
  warning?: string
}

export interface PreparedAttachmentContext {
  textBlocks: string[]
  imageParts: Array<{ type: 'image_url'; image_url: { url: string } }>
  warnings: string[]
  usedVision: boolean
  skippedImages: string[]
}

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'])
const TEXT_EXT = new Set([
  '.txt',
  '.md',
  '.markdown',
  '.csv',
  '.json',
  '.xml',
  '.html',
  '.htm',
  '.css',
  '.js',
  '.ts',
  '.tsx',
  '.jsx',
  '.py',
  '.rs',
  '.go',
  '.java',
  '.c',
  '.cpp',
  '.h',
  '.yml',
  '.yaml',
  '.toml',
  '.ini',
  '.log',
  '.sh',
  '.sql'
])

export function extensionOf(name: string): string {
  const i = name.lastIndexOf('.')
  return i >= 0 ? name.slice(i).toLowerCase() : ''
}

export function guessMimeType(name: string, fallback = 'application/octet-stream'): string {
  const ext = extensionOf(name)
  const map: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp',
    '.pdf': 'application/pdf',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.json': 'application/json',
    '.csv': 'text/csv',
    '.html': 'text/html',
    '.htm': 'text/html'
  }
  return map[ext] || fallback
}

export function classifyAttachment(name: string, mimeType: string): AttachmentKind {
  const ext = extensionOf(name)
  const mime = (mimeType || '').toLowerCase()
  if (mime.startsWith('image/') || IMAGE_EXT.has(ext)) return 'image'
  if (mime === 'application/pdf' || ext === '.pdf') return 'pdf'
  if (
    ext === '.docx' ||
    mime.includes('wordprocessingml') ||
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    return 'docx'
  }
  if (mime.startsWith('text/') || TEXT_EXT.has(ext)) return 'text'
  return 'other'
}

/** Heuristic — we never invent vision capability; unknown models get text fallback. */
export function modelLikelySupportsVision(modelId: string): boolean {
  const id = modelId.trim().toLowerCase()
  if (!id) return false
  const bare = id.includes('/') ? id.split('/').pop()! : id
  return (
    /llava|vision|gpt-4o|gpt-4\.1|gpt-4-turbo|gpt-5|claude-3|claude-4|gemini|qwen.?vl|pixtral|moondream|minicpm-v|phi-4-multimodal|internvl/.test(
      bare
    ) || /\bvl\b/.test(bare)
  )
}

export function truncateAttachmentText(
  text: string,
  max = ATTACH_TEXT_MAX_CHARS
): {
  text: string
  truncated: boolean
} {
  if (text.length <= max) return { text, truncated: false }
  const notice = `\n\n…[truncated attachment text: ${text.length.toLocaleString()} → ${max.toLocaleString()} chars]\n`
  return { text: text.slice(0, Math.max(0, max - notice.length)) + notice, truncated: true }
}

export function formatAttachmentTextBlock(att: ComposerAttachment): string | null {
  if (!att.textExcerpt?.trim()) return null
  const label = att.relativePath || att.name
  return `--- attachment: ${label} (${att.kind}) ---\n${att.textExcerpt.trim()}`
}

export function prepareAttachmentContext(
  attachments: ComposerAttachment[],
  modelId: string
): PreparedAttachmentContext {
  const vision = modelLikelySupportsVision(modelId)
  const textBlocks: string[] = []
  const imageParts: PreparedAttachmentContext['imageParts'] = []
  const warnings: string[] = []
  const skippedImages: string[] = []

  for (const att of attachments) {
    if (att.warning) warnings.push(`${att.name}: ${att.warning}`)
    const block = formatAttachmentTextBlock(att)
    if (block) textBlocks.push(block)

    if (att.kind === 'image') {
      if (vision && att.imageDataUrl) {
        imageParts.push({ type: 'image_url', image_url: { url: att.imageDataUrl } })
      } else if (att.imageDataUrl && !vision) {
        skippedImages.push(att.name)
        textBlocks.push(
          `--- attachment: ${att.name} (image) ---\n` +
            `[Image attached but the selected model "${modelId || '(none)'}" is not recognized as vision-capable. ` +
            `Switch to a vision model (e.g. llava, gpt-4o) to send pixels, or describe the image in your prompt. ` +
            `No OCR was run — ForgeLocal does not invent image text.]`
        )
      } else if (!att.imageDataUrl) {
        skippedImages.push(att.name)
        textBlocks.push(
          `--- attachment: ${att.name} (image) ---\n[Image could not be encoded for the model.]`
        )
      }
    } else if (att.kind === 'other' && !att.textExcerpt) {
      textBlocks.push(
        `--- attachment: ${att.name} (${att.mimeType || 'unknown'}) ---\n` +
          `[Binary file attached; no text extractor for this type. Convert to PDF/docx/txt or paste relevant text.]`
      )
    }
  }

  return {
    textBlocks,
    imageParts,
    warnings,
    usedVision: imageParts.length > 0,
    skippedImages
  }
}

/** Build the final user message content (string or multimodal parts). */
export function buildUserMessageContent(
  prompt: string,
  prepared: PreparedAttachmentContext
): ChatMessageContent {
  const text = [prompt.trim(), ...prepared.textBlocks].filter(Boolean).join('\n\n')
  if (!prepared.imageParts.length) return text
  return [{ type: 'text', text }, ...prepared.imageParts]
}

export function contentToPlainText(content: ChatMessageContent): string {
  if (typeof content === 'string') return content
  return content
    .map((p) => {
      if (p.type === 'text') return p.text
      return '[image]'
    })
    .join('\n')
}

export function estimateContentTokens(content: ChatMessageContent): number {
  if (typeof content === 'string') return Math.ceil(content.length / 4)
  let n = 0
  for (const p of content) {
    if (p.type === 'text') n += Math.ceil(p.text.length / 4)
    else n += 800 // rough image token stand-in — not a tokenizer
  }
  return n
}

export function validateAttachmentBatch(files: Array<{ name: string; sizeBytes: number }>): {
  ok: boolean
  message?: string
} {
  if (files.length > ATTACH_MAX_COUNT) {
    return {
      ok: false,
      message: `Too many attachments (${files.length}). Maximum is ${ATTACH_MAX_COUNT}.`
    }
  }
  let total = 0
  for (const f of files) {
    if (f.sizeBytes > ATTACH_MAX_FILE_BYTES) {
      return {
        ok: false,
        message: `"${f.name}" is too large (${f.sizeBytes.toLocaleString()} bytes). Max per file is ${ATTACH_MAX_FILE_BYTES.toLocaleString()}.`
      }
    }
    total += f.sizeBytes
  }
  if (total > ATTACH_MAX_TOTAL_BYTES) {
    return {
      ok: false,
      message: `Attachments total ${total.toLocaleString()} bytes exceeds ${ATTACH_MAX_TOTAL_BYTES.toLocaleString()} byte limit.`
    }
  }
  return { ok: true }
}
