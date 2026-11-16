import { useEffect, useMemo } from 'react'
import { DiffEditor, type BeforeMount } from '@monaco-editor/react'
import type { ProposedEdit } from '@shared/types'
import { useAppStore } from '../../stores/appStore'
import { detectLanguage } from '../../lib/language'
import { ensureForgeMonacoTheme } from '../../lib/monacoSetup'

const beforeMount: BeforeMount = (monaco) => {
  ensureForgeMonacoTheme(monaco)
}

function pendingEdits(
  sessionMessages: ReturnType<typeof useAppStore.getState>['session']
): ProposedEdit[] {
  if (!sessionMessages) return []
  return sessionMessages.messages
    .flatMap((m) => m.proposedEdits ?? [])
    .filter((e) => e.status === 'pending')
}

export function GhostLayer() {
  const session = useAppStore((s) => s.session)
  const activePath = useAppStore((s) => s.activePath)
  const decideEdit = useAppStore((s) => s.decideEdit)
  const ghostIndex = useAppStore((s) => s.ghostIndex)
  const setGhostIndex = useAppStore((s) => s.setGhostIndex)

  const edits = useMemo(() => pendingEdits(session), [session])
  const relevant = useMemo(() => {
    if (!activePath) return edits
    const forFile = edits.filter(
      (e) => e.path === activePath || activePath.endsWith(e.relativePath)
    )
    return forFile.length ? forFile : edits
  }, [edits, activePath])

  const edit = relevant[Math.min(ghostIndex, Math.max(0, relevant.length - 1))]

  useEffect(() => {
    if (ghostIndex >= relevant.length) setGhostIndex(Math.max(0, relevant.length - 1))
  }, [ghostIndex, relevant.length, setGhostIndex])

  useEffect(() => {
    if (!edit) return
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'TEXTAREA' || tag === 'INPUT') return
      if (e.key === 'Tab' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault()
        void decideEdit(edit, 'accepted', { skipConfirm: true })
      } else if (e.key === 'Escape') {
        e.preventDefault()
        void decideEdit(edit, 'rejected', { skipConfirm: true })
      } else if (e.key === '[' && relevant.length > 1) {
        e.preventDefault()
        setGhostIndex(Math.max(0, ghostIndex - 1))
      } else if (e.key === ']' && relevant.length > 1) {
        e.preventDefault()
        setGhostIndex(Math.min(relevant.length - 1, ghostIndex + 1))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [edit, decideEdit, ghostIndex, relevant.length, setGhostIndex])

  if (!edit) return null

  return (
    <div className="ghost-layer" role="region" aria-label="Ghost-layer AI proposal">
      <div className="ghost-toolbar">
        <div>
          <strong>Ghost proposal</strong>
          <span className="ghost-path">{edit.relativePath}</span>
          <span className="ghost-hint">
            Tab accept · Esc reject{relevant.length > 1 ? ' · [ ] scrub' : ''}
          </span>
        </div>
        <div className="ghost-actions">
          {relevant.length > 1 && (
            <div className="ghost-scrubber" aria-label="Proposal checkpoint scrubber">
              {relevant.map((e, i) => (
                <button
                  key={e.id}
                  className={`scrub-dot ${i === ghostIndex ? 'active' : ''}`}
                  title={e.relativePath}
                  onClick={() => setGhostIndex(i)}
                />
              ))}
            </div>
          )}
          <button
            className="btn primary"
            onClick={() => void decideEdit(edit, 'accepted', { skipConfirm: true })}
          >
            Accept
          </button>
          <button
            className="btn danger"
            onClick={() => void decideEdit(edit, 'rejected', { skipConfirm: true })}
          >
            Reject
          </button>
        </div>
      </div>
      <div className="ghost-diff">
        <DiffEditor
          height="100%"
          theme="forgelocal-ember"
          language={detectLanguage(edit.relativePath)}
          original={edit.originalContent}
          modified={edit.proposedContent}
          beforeMount={beforeMount}
          options={{
            readOnly: true,
            renderSideBySide: true,
            minimap: { enabled: false },
            fontFamily: 'JetBrains Mono, Cascadia Code, Fira Code, ui-monospace, monospace',
            fontLigatures: true,
            fontSize: 12,
            automaticLayout: true,
            scrollBeyondLastLine: false
          }}
        />
      </div>
      <div className="ghost-tint" aria-hidden="true" />
    </div>
  )
}
