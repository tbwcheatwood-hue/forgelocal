/**
 * Configure Monaco once at app boot so Canvas / Editor / GhostLayer never fall
 * back to the CDN (blocked by CSP) when optional-canvas mounts first.
 */
import { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker'
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker'
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'

loader.config({ monaco })

const g = globalThis as typeof globalThis & {
  MonacoEnvironment?: {
    getWorker: (workerId: string, label: string) => Worker
  }
}

g.MonacoEnvironment = {
  getWorker(_workerId: string, label: string) {
    switch (label) {
      case 'json':
        return new jsonWorker()
      case 'css':
      case 'scss':
      case 'less':
        return new cssWorker()
      case 'html':
      case 'handlebars':
      case 'razor':
        return new htmlWorker()
      case 'typescript':
      case 'javascript':
        return new tsWorker()
      default:
        return new editorWorker()
    }
  }
}

let themeReady = false

export function ensureForgeMonacoTheme(monacoApi: typeof monaco = monaco): void {
  if (themeReady) return
  monacoApi.editor.defineTheme('forgelocal-ember', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '756c62', fontStyle: 'italic' },
      { token: 'string', foreground: '7fafa3' },
      { token: 'keyword', foreground: 'e0a06a' },
      { token: 'number', foreground: 'd4b06a' },
      { token: 'type', foreground: 'c9b8a4' }
    ],
    colors: {
      'editor.background': '#0a0908',
      'editor.foreground': '#f3eee6',
      'editorLineNumber.foreground': '#756c62',
      'editorLineNumber.activeForeground': '#a89f93',
      'editorCursor.foreground': '#e0a06a',
      'editor.selectionBackground': '#e0a06a33',
      'editor.inactiveSelectionBackground': '#e0a06a1a',
      'editor.lineHighlightBackground': '#1a171480',
      'editorIndentGuide.background': '#2a251f',
      'editorIndentGuide.activeBackground': '#3a332c',
      'editorWidget.background': '#12100e',
      'editorWidget.border': '#3a332c',
      'input.background': '#0a0908',
      focusBorder: '#e0a06a',
      'diffEditor.insertedTextBackground': '#7fafa333',
      'diffEditor.removedTextBackground': '#c47d4533',
      'diffEditor.insertedLineBackground': '#7fafa31a',
      'diffEditor.removedLineBackground': '#c47d451a'
    }
  })
  themeReady = true
}

export { monaco }
