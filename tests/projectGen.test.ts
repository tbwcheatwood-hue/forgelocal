import { describe, expect, it } from 'vitest'
import {
  buildTemplatePlan,
  inferStackFromDescription,
  isProjectGenerationIntent,
  normalizePlanPath,
  parseProjectPlan,
  planNeedsQuestions,
  slugifyProjectName
} from '../src/shared/projectGen'

describe('slugifyProjectName', () => {
  it('slugifies names', () => {
    expect(slugifyProjectName('Hello World!')).toBe('hello-world')
    expect(slugifyProjectName('  ')).toBe('forge-project')
  })
})

describe('normalizePlanPath', () => {
  it('rejects traversal and absolute paths', () => {
    expect(normalizePlanPath('../etc/passwd')).toBeNull()
    expect(normalizePlanPath('/tmp/x')).toBeNull()
    expect(normalizePlanPath('C:\\Windows\\x')).toBeNull()
    expect(normalizePlanPath('src/app.js')).toBe('src/app.js')
  })
})

describe('inferStackFromDescription', () => {
  it('detects cli and spa hints', () => {
    expect(inferStackFromDescription('build a CLI tool')).toBe('node-cli')
    expect(inferStackFromDescription('a single-page app')).toBe('vanilla-spa')
    expect(inferStackFromDescription('landing page')).toBe('static-web')
  })
})

describe('parseProjectPlan', () => {
  it('parses fenced JSON plans', () => {
    const raw = `\`\`\`json
{"name":"demo","summary":"Demo app","stack":"static-web","features":["a"],"files":[{"path":"index.html","description":"home","content":"<h1>hi</h1>"}],"questions":[]}
\`\`\``
    const parsed = parseProjectPlan(raw)
    expect(parsed.ok).toBe(true)
    expect(parsed.plan?.name).toBe('demo')
    expect(parsed.plan?.files[0]?.path).toBe('index.html')
    expect(parsed.plan?.source).toBe('ai')
  })

  it('accepts question-only plans', () => {
    const parsed = parseProjectPlan(
      JSON.stringify({
        name: 'q',
        summary: 'need info',
        stack: 'static-web',
        features: [],
        files: [],
        questions: [{ id: 'q1', prompt: 'Dark or light?', options: ['dark', 'light'] }]
      })
    )
    expect(parsed.ok).toBe(true)
    expect(planNeedsQuestions(parsed.plan!)).toBe(true)
  })

  it('rejects empty junk', () => {
    expect(parseProjectPlan('not json').ok).toBe(false)
    expect(parseProjectPlan('{}').ok).toBe(false)
  })
})

describe('buildTemplatePlan', () => {
  it('builds static, spa, and cli starters', () => {
    const web = buildTemplatePlan('Warm landing page', 'static-web')
    expect(web.source).toBe('template')
    expect(web.files.some((f) => f.path === 'index.html')).toBe(true)

    const spa = buildTemplatePlan('Router demo', 'vanilla-spa')
    expect(spa.files.some((f) => f.path === 'app.js')).toBe(true)

    const cli = buildTemplatePlan('My CLI', 'node-cli')
    expect(cli.files.some((f) => f.path === 'bin/cli.js')).toBe(true)
    expect(cli.scripts?.start).toContain('node')
  })
})

describe('isProjectGenerationIntent', () => {
  it('detects greenfield build prompts', () => {
    expect(isProjectGenerationIntent('Build me a new weather dashboard app')).toBe(true)
    expect(isProjectGenerationIntent('Create a new static website from scratch')).toBe(true)
    expect(isProjectGenerationIntent('generate me a node cli tool')).toBe(true)
  })

  it('ignores ordinary edit/debug prompts', () => {
    expect(isProjectGenerationIntent('Fix the bug in app.js')).toBe(false)
    expect(isProjectGenerationIntent('Explain this function')).toBe(false)
    expect(isProjectGenerationIntent('Refactor the auth module')).toBe(false)
  })
})
