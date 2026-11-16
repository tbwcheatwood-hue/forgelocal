/** Soft/hard limits so large pastes and chat payloads cannot crash the app. */

export const PROMPT_SOFT_CHARS = 24_000 // ~4k words — warn in UI
export const PROMPT_MAX_CHARS = 100_000 // hard reject; 3k words (~18k) fits comfortably
export const CONTEXT_FILE_MAX_CHARS = 120_000
export const CONTEXT_TOTAL_MAX_CHARS = 250_000
export const STORED_MESSAGE_MAX_CHARS = 60_000
export const STORED_EDIT_CONTENT_MAX_CHARS = 80_000
export const UI_MESSAGE_COLLAPSE_CHARS = 8_000
export const STREAM_UI_MIN_INTERVAL_MS = 50

export interface SizeCheckResult {
  ok: boolean
  truncated: boolean
  text: string
  originalLength: number
  message?: string
}

export function checkPromptSize(prompt: string): SizeCheckResult {
  const originalLength = prompt.length
  if (originalLength <= PROMPT_MAX_CHARS) {
    return {
      ok: true,
      truncated: false,
      text: prompt,
      originalLength,
      message:
        originalLength >= PROMPT_SOFT_CHARS
          ? `Large prompt (${originalLength.toLocaleString()} chars). Sending is allowed; consider trimming for better model quality.`
          : undefined
    }
  }
  return {
    ok: false,
    truncated: false,
    text: prompt.slice(0, PROMPT_MAX_CHARS),
    originalLength,
    message: `Prompt is too large (${originalLength.toLocaleString()} chars). Maximum is ${PROMPT_MAX_CHARS.toLocaleString()} characters (~${Math.floor(PROMPT_MAX_CHARS / 6)} words). Shorten it and try again.`
  }
}

export function truncateText(
  text: string,
  maxChars: number,
  label = 'content'
): { text: string; truncated: boolean } {
  if (text.length <= maxChars) return { text, truncated: false }
  const notice = `\n\n…[truncated ${label}: ${text.length.toLocaleString()} → ${maxChars.toLocaleString()} chars]\n`
  const budget = Math.max(0, maxChars - notice.length)
  return { text: text.slice(0, budget) + notice, truncated: true }
}

export interface PrepareContextOptions {
  /** Optional token budget (chars÷4 heuristic) after reserving max output tokens. */
  contextWindowTokens?: number
  maxOutputTokens?: number
  /** Estimated tokens already used by the prompt/system messages. */
  reservedPromptTokens?: number
}

export function prepareContextFiles<
  T extends { relativePath: string; path: string; content: string }
>(
  files: T[],
  options: PrepareContextOptions = {}
): { files: T[]; truncated: boolean; message?: string } {
  let total = 0
  let truncated = false
  const out: T[] = []

  const tokenBudget =
    typeof options.contextWindowTokens === 'number' && options.contextWindowTokens > 0
      ? Math.max(
          0,
          options.contextWindowTokens -
            Math.max(0, options.maxOutputTokens ?? 0) -
            Math.max(0, options.reservedPromptTokens ?? 0)
        )
      : undefined
  // chars÷4 heuristic → allow about 4 chars per remaining token
  const charBudgetFromTokens =
    tokenBudget != null ? Math.max(0, tokenBudget * 4) : CONTEXT_TOTAL_MAX_CHARS
  const totalCharBudget = Math.min(CONTEXT_TOTAL_MAX_CHARS, charBudgetFromTokens)

  for (const file of files) {
    const remaining = totalCharBudget - total
    if (remaining <= 0) {
      truncated = true
      break
    }
    const cap = Math.min(CONTEXT_FILE_MAX_CHARS, remaining)
    const next = truncateText(file.content, cap, file.relativePath)
    if (next.truncated) truncated = true
    out.push({ ...file, content: next.text })
    total += next.text.length
  }

  if (out.length < files.length) truncated = true

  let message: string | undefined
  if (truncated) {
    message =
      tokenBudget != null
        ? `Context was truncated to fit the ${options.contextWindowTokens!.toLocaleString()}-token window (after reserving output).`
        : `Context was truncated to stay under ${CONTEXT_TOTAL_MAX_CHARS.toLocaleString()} characters so the request stays stable.`
  }

  return { files: out, truncated, message }
}

export function truncateChatSessionForStorage<T extends { messages: unknown[] }>(session: T): T {
  const messages = session.messages.map((msg) => {
    if (!msg || typeof msg !== 'object') return msg
    const next: Record<string, unknown> = { ...(msg as Record<string, unknown>) }
    if (typeof next.content === 'string') {
      next.content = truncateText(next.content, STORED_MESSAGE_MAX_CHARS, 'message').text
    }
    if (Array.isArray(next.proposedEdits)) {
      next.proposedEdits = next.proposedEdits.map((edit) => {
        if (!edit || typeof edit !== 'object') return edit
        const e = { ...(edit as Record<string, unknown>) }
        if (typeof e.originalContent === 'string') {
          e.originalContent = truncateText(
            e.originalContent,
            STORED_EDIT_CONTENT_MAX_CHARS,
            'original'
          ).text
        }
        if (typeof e.proposedContent === 'string') {
          e.proposedContent = truncateText(
            e.proposedContent,
            STORED_EDIT_CONTENT_MAX_CHARS,
            'proposed'
          ).text
        }
        return e
      })
    }
    return next
  })
  return { ...session, messages: messages as T['messages'] }
}

export function estimateWordCount(text: string): number {
  const trimmed = text.trim()
  if (!trimmed) return 0
  return trimmed.split(/\s+/).length
}
