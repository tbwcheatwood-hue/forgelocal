import type { ProposedEdit } from '@shared/types'
import { createDiffPreview } from '../../lib/language'

function colorizeDiff(preview: string) {
  return preview.split('\n').map((line, i) => {
    const cls = line.startsWith('+ ') ? 'add' : line.startsWith('- ') ? 'del' : undefined
    return (
      <span key={i} className={cls}>
        {line}
        {'\n'}
      </span>
    )
  })
}

export function DiffReview({
  edit,
  onDecide
}: {
  edit: ProposedEdit
  onDecide: (edit: ProposedEdit, decision: 'accepted' | 'rejected') => void
}) {
  const preview = createDiffPreview(edit.originalContent, edit.proposedContent)

  return (
    <div className="diff-card" role="region" aria-label={`Proposed edit for ${edit.relativePath}`}>
      <h4>
        Proposed edit · <span className="diff-path">{edit.relativePath}</span>
      </h4>
      <div className="diff-meta">
        {edit.summary} · {edit.status}
      </div>
      <pre className="diff-pre">{colorizeDiff(preview || '(empty diff)')}</pre>
      {edit.status === 'pending' && (
        <div className="diff-actions">
          <button className="btn primary" onClick={() => onDecide(edit, 'accepted')}>
            Accept
          </button>
          <button className="btn danger" onClick={() => onDecide(edit, 'rejected')}>
            Reject
          </button>
        </div>
      )}
    </div>
  )
}
