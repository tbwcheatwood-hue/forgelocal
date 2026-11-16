import path from 'path'
import { screenCommand } from '../../shared/commandScreen'

const UNSAFE_COMMAND_PATTERNS = [
  /\brm\s+(-[a-zA-Z]*f[a-zA-Z]*\s+)?\/(?:\s|$)/,
  /\bmkfs\b/,
  /\bdd\s+if=/,
  />\s*\/dev\/sd/,
  /\bcurl\b[\s\S]*\|\s*(ba)?sh\b/,
  /\bwget\b[\s\S]*\|\s*(ba)?sh\b/,
  /\bsudo\b/,
  /\bchmod\s+777\b/,
  /:\(\)\s*\{\s*:\|:&\s*\};:/
]

export function normalizePath(p: string): string {
  return path.resolve(p)
}

export function isPathInsideWorkspace(targetPath: string, workspaceRoot: string): boolean {
  const root = normalizePath(workspaceRoot)
  const target = normalizePath(targetPath)
  const relative = path.relative(root, target)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

export function assertSafeWorkspacePath(
  targetPath: string,
  workspaceRoot: string | null,
  allowOutside: boolean
): { ok: true; path: string } | { ok: false; error: string; requiresApproval: boolean } {
  if (!workspaceRoot) {
    return { ok: false, error: 'No workspace open', requiresApproval: false }
  }
  const resolved = normalizePath(targetPath)
  if (isPathInsideWorkspace(resolved, workspaceRoot)) {
    return { ok: true, path: resolved }
  }
  if (allowOutside) {
    return { ok: true, path: resolved }
  }
  return {
    ok: false,
    error: `Path is outside the workspace: ${resolved}`,
    requiresApproval: true
  }
}

/**
 * Legacy boolean API used by existing callers.
 * Prefer screenCommand for hard-deny vs needs-confirm.
 */
export function validateCommandSafety(command: string): {
  safe: boolean
  reason?: string
  needsConfirm?: boolean
} {
  const screened = screenCommand(command, { confirm: false })
  if (screened.allowed) return { safe: true }
  // Keep legacy "unsafe" for hard denies; needsConfirm surfaces separately.
  if (screened.needsConfirm) {
    return { safe: false, reason: screened.reason, needsConfirm: true }
  }
  // Also run legacy patterns for backwards-compatible messages in tests.
  for (const pattern of UNSAFE_COMMAND_PATTERNS) {
    if (pattern.test(command.trim())) {
      return {
        safe: false,
        reason: screened.reason || `Command matched an unsafe pattern and was blocked: ${pattern}`
      }
    }
  }
  return { safe: false, reason: screened.reason }
}

export { screenCommand }

export function redactSecrets(text: string): string {
  return text
    .replace(/(api[_-]?key|token|secret|password)\s*[:=]\s*["']?[^\s"']+/gi, '$1=[REDACTED]')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, 'Bearer [REDACTED]')
}

export function safeRelative(from: string, to: string): string {
  return path.relative(from, to).split(path.sep).join('/')
}
