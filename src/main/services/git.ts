import { execFile } from 'child_process'
import fs from 'fs/promises'
import path from 'path'
import type { GitSnapshot } from '../../shared/companion'

function runGit(
  cwd: string,
  args: string[],
  timeoutMs = 8000
): Promise<{ code: number; out: string; err: string }> {
  return new Promise((resolve) => {
    execFile(
      'git',
      args,
      { cwd, timeout: timeoutMs, env: { ...process.env, GIT_TERMINAL_PROMPT: '0', PAGER: 'cat' } },
      (err, stdout, stderr) => {
        resolve({
          code: err ? 1 : 0,
          out: String(stdout || ''),
          err: String(stderr || '')
        })
      }
    )
  })
}

export async function collectGitSnapshot(workspaceRoot: string | null): Promise<GitSnapshot> {
  if (!workspaceRoot) {
    return {
      ok: false,
      hasRepo: false,
      statusLines: [],
      recentLog: [],
      message: 'No project open.'
    }
  }
  try {
    await fs.stat(path.join(workspaceRoot, '.git'))
  } catch {
    return {
      ok: true,
      hasRepo: false,
      statusLines: [],
      recentLog: [],
      message: 'No git repository in this workspace.'
    }
  }

  const [branchRes, statusRes, logRes, aheadRes] = await Promise.all([
    runGit(workspaceRoot, ['rev-parse', '--abbrev-ref', 'HEAD']),
    runGit(workspaceRoot, ['status', '--short', '--branch']),
    runGit(workspaceRoot, ['log', '-5', '--oneline']),
    runGit(workspaceRoot, ['rev-list', '--left-right', '--count', '@{upstream}...HEAD']).catch(
      () => ({ code: 1, out: '', err: '' })
    )
  ])

  const branch = branchRes.out.trim() || undefined
  const statusLines = statusRes.out
    .split('\n')
    .map((l) => l.trimEnd())
    .filter(Boolean)
  const dirty = statusLines.some((l) => !l.startsWith('##'))
  let ahead = 0
  let behind = 0
  if (aheadRes.code === 0 && aheadRes.out.trim()) {
    const [b, a] = aheadRes.out.trim().split(/\s+/).map(Number)
    behind = Number.isFinite(b) ? b : 0
    ahead = Number.isFinite(a) ? a : 0
  }

  return {
    ok: true,
    hasRepo: true,
    branch,
    dirty,
    ahead,
    behind,
    statusLines,
    recentLog: logRes.out
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean),
    message: dirty ? 'Working tree has changes' : 'Working tree clean'
  }
}
