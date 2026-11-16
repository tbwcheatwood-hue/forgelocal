/**
 * AI project generation: NL → optional clarifying questions → plan → files.
 * Works with LM Studio when available; ships offline templates as honest fallback.
 */

export type ProjectStack = 'static-web' | 'node-cli' | 'vanilla-spa'

export interface ClarifyingQuestion {
  id: string
  prompt: string
  options?: string[]
}

export interface PlannedFile {
  path: string
  description: string
  content: string
}

export interface ProjectPlan {
  name: string
  summary: string
  stack: ProjectStack
  features: string[]
  files: PlannedFile[]
  scripts?: { install?: string; build?: string; test?: string; start?: string }
  questions?: ClarifyingQuestion[]
  source: 'ai' | 'template'
  warnings?: string[]
}

export interface GenerationProgress {
  phase: 'idle' | 'planning' | 'questions' | 'ready' | 'writing' | 'done' | 'error'
  message: string
  filesWritten: number
  filesTotal: number
  currentFile?: string
}

export interface CheckpointMeta {
  id: string
  label: string
  createdAt: number
  fileCount: number
  workspacePath: string
}

export interface ProjectRecord {
  id: string
  name: string
  path: string
  summary?: string
  stack?: ProjectStack
  createdAt: number
  updatedAt: number
}

export const DEFAULT_GEN_PROGRESS: GenerationProgress = {
  phase: 'idle',
  message: '',
  filesWritten: 0,
  filesTotal: 0
}

const MAX_PLAN_FILES = 40
const MAX_FILE_CHARS = 120_000

export function slugifyProjectName(name: string): string {
  const s = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  return s || 'forge-project'
}

export function buildPlanningSystemPrompt(): string {
  return `You are ForgeLocal's project planner. Reply with JSON ONLY (no markdown fences) matching:
{"name":"string","summary":"string","stack":"static-web"|"node-cli"|"vanilla-spa","features":["string"],"files":[{"path":"relative/path","description":"string","content":"full file text"}],"scripts":{"install":"npm install","build":"","test":"npm test","start":""},"questions":[{"id":"q1","prompt":"string","options":["a","b"]}]}

Rules:
- Prefer 3–12 files for a working starter (not a monorepo).
- Ask questions ONLY if the goal is ambiguous; otherwise omit questions or use [].
- Paths must be relative, no .., no absolute paths.
- content must be complete usable source, not placeholders like TODO implement everything.
- stack static-web = HTML/CSS/JS; node-cli = package.json + bin; vanilla-spa = index.html + app.js modules.`
}

export function buildPlanningUserPrompt(input: {
  description: string
  answers?: Record<string, string>
}): string {
  const parts = [`Create a small local project for this goal:\n${input.description.trim()}`]
  if (input.answers && Object.keys(input.answers).length) {
    parts.push('Clarifying answers:')
    for (const [k, v] of Object.entries(input.answers)) {
      parts.push(`- ${k}: ${v}`)
    }
  }
  parts.push('Return JSON only.')
  return parts.join('\n')
}

export function parseProjectPlan(raw: string): {
  ok: boolean
  plan?: ProjectPlan
  message?: string
} {
  const text = (raw ?? '').trim()
  if (!text) return { ok: false, message: 'Empty plan response from the model.' }

  let jsonText = text
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence?.[1]) jsonText = fence[1].trim()
  const brace = jsonText.match(/\{[\s\S]*\}/)
  if (brace) jsonText = brace[0]

  let parsed: unknown
  try {
    parsed = JSON.parse(jsonText)
  } catch {
    return { ok: false, message: 'Could not parse project plan JSON from the model.' }
  }
  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, message: 'Plan JSON must be an object.' }
  }
  const obj = parsed as Record<string, unknown>
  const name = String(obj.name ?? '').trim() || 'Untitled Project'
  const summary = String(obj.summary ?? '').trim() || name
  const stackRaw = String(obj.stack ?? 'static-web')
  const stack: ProjectStack =
    stackRaw === 'node-cli' || stackRaw === 'vanilla-spa' ? stackRaw : 'static-web'

  const features = Array.isArray(obj.features)
    ? obj.features
        .map((f) => String(f).trim())
        .filter(Boolean)
        .slice(0, 20)
    : []

  const filesIn = Array.isArray(obj.files) ? obj.files : []
  const files: PlannedFile[] = []
  for (const item of filesIn.slice(0, MAX_PLAN_FILES)) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const filePath = normalizePlanPath(String(row.path ?? ''))
    if (!filePath) continue
    let content = typeof row.content === 'string' ? row.content : ''
    if (content.length > MAX_FILE_CHARS) {
      content = content.slice(0, MAX_FILE_CHARS) + '\n/* truncated by ForgeLocal plan limit */\n'
    }
    files.push({
      path: filePath,
      description: String(row.description ?? '')
        .trim()
        .slice(0, 280),
      content
    })
  }

  const questions: ClarifyingQuestion[] = []
  if (Array.isArray(obj.questions)) {
    for (const q of obj.questions.slice(0, 5)) {
      if (!q || typeof q !== 'object') continue
      const row = q as Record<string, unknown>
      const prompt = String(row.prompt ?? '').trim()
      if (!prompt) continue
      questions.push({
        id: String(row.id ?? `q${questions.length + 1}`).slice(0, 64),
        prompt: prompt.slice(0, 400),
        options: Array.isArray(row.options)
          ? row.options.map((o) => String(o).slice(0, 120)).slice(0, 6)
          : undefined
      })
    }
  }

  const scriptsObj =
    obj.scripts && typeof obj.scripts === 'object' ? (obj.scripts as Record<string, unknown>) : {}

  if (!files.length && !questions.length) {
    return { ok: false, message: 'Plan contained neither files nor clarifying questions.' }
  }

  return {
    ok: true,
    plan: {
      name: name.slice(0, 80),
      summary: summary.slice(0, 500),
      stack,
      features,
      files,
      scripts: {
        install: typeof scriptsObj.install === 'string' ? scriptsObj.install : undefined,
        build: typeof scriptsObj.build === 'string' ? scriptsObj.build : undefined,
        test: typeof scriptsObj.test === 'string' ? scriptsObj.test : undefined,
        start: typeof scriptsObj.start === 'string' ? scriptsObj.start : undefined
      },
      questions,
      source: 'ai'
    }
  }
}

export function normalizePlanPath(p: string): string | null {
  const trimmed = p.trim().replace(/\\/g, '/')
  if (!trimmed || trimmed.includes('..') || trimmed.startsWith('~')) return null
  if (trimmed.startsWith('/') || /^[a-zA-Z]:/.test(trimmed)) return null
  return trimmed.replace(/^\/+/, '').slice(0, 260)
}

/** Offline starter when the model is unavailable or returns unusable JSON. */
export function buildTemplatePlan(
  description: string,
  stack: ProjectStack = 'static-web'
): ProjectPlan {
  const name = slugifyProjectName(description.split(/[.!\n]/)[0] || 'forge-app')
  const title = description.trim().slice(0, 60) || 'ForgeLocal App'
  if (stack === 'node-cli') {
    return {
      name,
      summary: `Node CLI starter for: ${title}`,
      stack: 'node-cli',
      features: ['CLI entry', 'package.json', 'basic test'],
      source: 'template',
      warnings: ['Generated from offline template — refine with the AI assistant after open.'],
      scripts: { install: 'npm install', test: 'node --test', start: 'node bin/cli.js' },
      files: [
        {
          path: 'package.json',
          description: 'Package manifest',
          content: JSON.stringify(
            {
              name,
              version: '0.1.0',
              type: 'module',
              bin: { [name]: './bin/cli.js' },
              scripts: { test: 'node --test', start: 'node bin/cli.js' }
            },
            null,
            2
          )
        },
        {
          path: 'bin/cli.js',
          description: 'CLI entry',
          content: `#!/usr/bin/env node
const args = process.argv.slice(2)
console.log(${JSON.stringify(title)})
console.log('args:', args.join(' ') || '(none)')
`
        },
        {
          path: 'README.md',
          description: 'Readme',
          content: `# ${name}\n\n${title}\n\n\`\`\`bash\nnpm start\nnpm test\n\`\`\`\n`
        },
        {
          path: 'test/cli.test.js',
          description: 'Smoke test',
          content: `import test from 'node:test'\nimport assert from 'node:assert/strict'\n\ntest('smoke', () => {\n  assert.equal(1 + 1, 2)\n})\n`
        }
      ]
    }
  }

  if (stack === 'vanilla-spa') {
    return {
      name,
      summary: `Vanilla SPA starter for: ${title}`,
      stack: 'vanilla-spa',
      features: ['SPA shell', 'client routing stub', 'styles'],
      source: 'template',
      warnings: ['Generated from offline template — refine with the AI assistant after open.'],
      scripts: { start: 'npx --yes serve .' },
      files: [
        {
          path: 'index.html',
          description: 'App shell',
          content: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="styles.css" />
</head>
<body>
  <div id="app"></div>
  <script type="module" src="app.js"></script>
</body>
</html>
`
        },
        {
          path: 'app.js',
          description: 'App logic',
          content: `const root = document.getElementById('app')
const state = { route: location.hash.slice(1) || 'home' }

function render() {
  root.innerHTML = \`
    <header><h1>${escapeHtml(title)}</h1>
    <nav>
      <a href="#home">Home</a>
      <a href="#about">About</a>
    </nav></header>
    <main>
      \${state.route === 'about'
        ? '<p>Built with ForgeLocal offline template. Edit app.js to continue.</p>'
        : '<p>${escapeHtml(description.trim().slice(0, 180) || 'Your app starts here.')}</p>'}
    </main>\`
}

window.addEventListener('hashchange', () => {
  state.route = location.hash.slice(1) || 'home'
  render()
})
render()
`
        },
        {
          path: 'styles.css',
          description: 'Styles',
          content: `:root { color-scheme: dark; font-family: system-ui, sans-serif; }
body { margin: 0; background: #12141a; color: #e8e6e3; }
header, main { max-width: 720px; margin: 0 auto; padding: 24px; }
nav a { color: #5eead4; margin-right: 12px; }
`
        },
        {
          path: 'README.md',
          description: 'Readme',
          content: `# ${name}\n\nOpen \`index.html\` via ForgeLocal Preview or a static server.\n`
        }
      ]
    }
  }

  // static-web default
  return {
    name,
    summary: `Static site starter for: ${title}`,
    stack: 'static-web',
    features: ['index.html', 'styles', 'script', 'readme'],
    source: 'template',
    warnings: ['Generated from offline template — refine with the AI assistant after open.'],
    files: [
      {
        path: 'index.html',
        description: 'Landing page',
        content: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="styles.css" />
</head>
<body>
  <main>
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(description.trim().slice(0, 280) || 'Static site created by ForgeLocal.')}</p>
    <button id="action" type="button">Click me</button>
  </main>
  <script src="app.js"></script>
</body>
</html>
`
      },
      {
        path: 'styles.css',
        description: 'Styles',
        content: `body {
  margin: 0;
  min-height: 100vh;
  display: grid;
  place-items: center;
  font-family: "Segoe UI", system-ui, sans-serif;
  background: radial-gradient(circle at top, #2a2118, #0f1419 60%);
  color: #f2ebe3;
}
main { text-align: center; padding: 2rem; }
button {
  margin-top: 1rem;
  padding: 0.6rem 1.1rem;
  border: 0;
  border-radius: 8px;
  background: #e0a06a;
  color: #1a120c;
  font-weight: 600;
  cursor: pointer;
}
`
      },
      {
        path: 'app.js',
        description: 'Client script',
        content: `const btn = document.getElementById('action')
let n = 0
btn?.addEventListener('click', () => {
  n += 1
  btn.textContent = 'Clicked ' + n + (n === 1 ? ' time' : ' times')
})
`
      },
      {
        path: 'README.md',
        description: 'Readme',
        content: `# ${name}\n\n${title}\n\nOpen in ForgeLocal Preview (dock → Preview → Start on \`.\`).\n`
      }
    ]
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function inferStackFromDescription(description: string): ProjectStack {
  const d = description.toLowerCase()
  if (/\bcli\b|command.?line|terminal tool/.test(d)) return 'node-cli'
  if (/\bspa\b|single.?page|router|client.?app/.test(d)) return 'vanilla-spa'
  return 'static-web'
}

export function planNeedsQuestions(plan: ProjectPlan): boolean {
  return (plan.questions?.length ?? 0) > 0 && plan.files.length === 0
}
