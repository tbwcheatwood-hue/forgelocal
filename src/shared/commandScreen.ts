/**
 * Companion-style command screening: hard-deny vs needs-confirm.
 * Patterns inspired by LocalForge Companion 0.3.2 exec.js (MIT) — see NOTICE.
 */

import type { CommandScreenResult } from './companion'

const HARD_DENY: RegExp[] = [
  /\bmkfs(\.\w+)?\b/i,
  /\bdd\s+if=/i,
  /:\(\)\s*\{.*\}\s*;\s*:/,
  /\brm\s+-[a-z]*r[a-z]*f?\s+\/["';&|]?(\s|$)/i,
  /\bchmod\s+-R\s+777\s+\/["']?(\s|$)/i,
  />\s*\/dev\/sd/i
]

const NEEDS_CONFIRM: RegExp[] = [
  /\bsudo\b/i,
  /\bsu\s+-?\s*\w*/i,
  /\brm\s+(?=[^|;&]*-[a-z]*[rf])/i,
  /\b(shutdown|reboot|halt|poweroff)\b/i,
  /\bcurl\b[\s\S]*\|\s*(sudo\s+)?(ba|z|fi)?sh\b/i,
  /\bwget\b[\s\S]*\|\s*(sudo\s+)?(ba|z|fi)?sh\b/i,
  /\bnc\b\s+-l/i,
  /\bgit\s+push\s+[^\n]*--force/i,
  /\bdiskutil\b/i,
  /\breg\s+(add|delete)\b/i,
  /\bRemove-Item\b[\s\S]*-Recurse[\s\S]*-Force/i,
  /\bformat\b.*:/i
]

export function screenCommand(cmd: string, opts: { confirm?: boolean } = {}): CommandScreenResult {
  const c = String(cmd || '')
  if (!c.trim()) {
    return { allowed: false, reason: 'Empty command', needsConfirm: false }
  }
  for (const re of HARD_DENY) {
    if (re.test(c)) {
      return {
        allowed: false,
        reason: 'This command is on the hard-deny list and cannot be run.',
        needsConfirm: false
      }
    }
  }
  for (const re of NEEDS_CONFIRM) {
    if (re.test(c)) {
      if (!opts.confirm) {
        return {
          allowed: false,
          reason: 'Potentially destructive command requires explicit confirmation.',
          needsConfirm: true
        }
      }
      return { allowed: true, flagged: true }
    }
  }
  return { allowed: true }
}
