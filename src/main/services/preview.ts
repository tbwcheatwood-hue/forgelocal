import http from 'http'
import fs from 'fs/promises'
import path from 'path'
import { randomBytes } from 'crypto'
import { PREVIEW_CSP } from '../../shared/networkAccess'
import { isPathInsideWorkspace } from './security'

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
}

interface Session {
  token: string
  workspaceRoot: string
  previewDir: string
  exp: number
  server: http.Server
  port: number
}

/**
 * Loopback-only static preview inspired by LocalForge Companion preview.js.
 * Serves authorized workspace files on 127.0.0.1 only (no LAN bind).
 * Response CSP is open so generated apps can fetch APIs / CDN / websockets;
 * path jail + token URL remain the isolation boundary.
 */
export class PreviewService {
  private session: Session | null = null

  async start(
    workspaceRoot: string | null,
    previewDir = '.'
  ): Promise<
    { ok: true; url: string; token: string; root: string } | { ok: false; message: string }
  > {
    if (!workspaceRoot) {
      return { ok: false, message: 'Open a project before starting preview.' }
    }
    const absPreview = path.resolve(workspaceRoot, previewDir || '.')
    if (!isPathInsideWorkspace(absPreview, workspaceRoot)) {
      return { ok: false, message: 'Preview directory must stay inside the workspace.' }
    }

    await this.stop()

    const token = randomBytes(16).toString('hex')
    const server = http.createServer(async (req, res) => {
      try {
        const url = new URL(req.url || '/', 'http://127.0.0.1')
        const parts = url.pathname.split('/').filter(Boolean)
        if (parts[0] !== 'preview' || parts[1] !== token) {
          res.writeHead(403, { 'Content-Type': 'text/plain' })
          res.end('Forbidden')
          return
        }
        if (this.session && this.session.exp < Date.now()) {
          res.writeHead(410, { 'Content-Type': 'text/plain' })
          res.end('Preview token expired')
          return
        }
        const rel = decodeURIComponent(parts.slice(2).join('/') || 'index.html')
        const filePath = path.resolve(absPreview, rel)
        if (!isPathInsideWorkspace(filePath, workspaceRoot)) {
          res.writeHead(400, { 'Content-Type': 'text/plain' })
          res.end('Path escape blocked')
          return
        }
        await serveStatic(res, filePath)
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain' })
        res.end(err instanceof Error ? err.message : 'Preview error')
      }
    })

    const port = await new Promise<number>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address()
        if (!addr || typeof addr === 'string') reject(new Error('No preview port'))
        else resolve(addr.port)
      })
    })

    this.session = {
      token,
      workspaceRoot,
      previewDir: absPreview,
      exp: Date.now() + 3600_000,
      server,
      port
    }

    return {
      ok: true,
      url: `http://127.0.0.1:${port}/preview/${token}/`,
      token,
      root: absPreview
    }
  }

  async stop(): Promise<void> {
    const s = this.session
    this.session = null
    if (!s) return
    await new Promise<void>((resolve) => s.server.close(() => resolve()))
  }

  status(): { active: boolean; url?: string; root?: string } {
    if (!this.session || this.session.exp < Date.now()) {
      return { active: false }
    }
    return {
      active: true,
      url: `http://127.0.0.1:${this.session.port}/preview/${this.session.token}/`,
      root: this.session.previewDir
    }
  }
}

async function serveStatic(
  res: http.ServerResponse,
  filePath: string,
  depthGuard = 0
): Promise<void> {
  const st = await fs.stat(filePath).catch(() => null)
  if (st?.isDirectory()) {
    return serveStatic(res, path.join(filePath, 'index.html'), depthGuard + 1)
  }
  if (!st && depthGuard === 0) {
    return serveStatic(res, `${filePath}.html`, 1)
  }
  if (!st) {
    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end('Preview: not found')
    return
  }
  const data = await fs.readFile(filePath)
  const ext = path.extname(filePath).toLowerCase()
  const headers: Record<string, string> = {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': 'no-store'
  }
  // HTML gets a network-open CSP + frame-ancestors so the IDE iframe can embed
  // the app and the app can fetch APIs / CDN / websockets.
  if (ext === '.html' || ext === '.htm') {
    headers['Content-Security-Policy'] = PREVIEW_CSP
  }
  res.writeHead(200, headers)
  res.end(data)
}
