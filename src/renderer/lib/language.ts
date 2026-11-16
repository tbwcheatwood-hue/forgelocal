export function detectLanguage(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
  const map: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    mjs: 'javascript',
    cjs: 'javascript',
    json: 'json',
    md: 'markdown',
    py: 'python',
    rs: 'rust',
    go: 'go',
    java: 'java',
    c: 'c',
    h: 'c',
    cpp: 'cpp',
    cc: 'cpp',
    hpp: 'cpp',
    cs: 'csharp',
    css: 'css',
    scss: 'scss',
    html: 'html',
    htm: 'html',
    xml: 'xml',
    yml: 'yaml',
    yaml: 'yaml',
    sh: 'shell',
    bash: 'shell',
    zsh: 'shell',
    sql: 'sql',
    toml: 'ini',
    ini: 'ini',
    txt: 'plaintext'
  }
  return map[ext] ?? 'plaintext'
}

export function createDiffPreview(original: string, proposed: string): string {
  const a = original.split(/\r?\n/)
  const b = proposed.split(/\r?\n/)
  const lines: string[] = []
  const max = Math.max(a.length, b.length)
  for (let i = 0; i < max; i++) {
    if (a[i] === b[i]) {
      if (a[i] !== undefined) lines.push(`  ${a[i]}`)
    } else {
      if (a[i] !== undefined) lines.push(`- ${a[i]}`)
      if (b[i] !== undefined) lines.push(`+ ${b[i]}`)
    }
  }
  return lines.slice(0, 200).join('\n')
}
