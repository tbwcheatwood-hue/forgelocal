import type { ProposedEdit } from '@shared/types'
import { createDiffPreview } from '../../lib/language'

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
        Proposed edit · {edit.relativePath}{' '}
        <span style={{ color: 'var(--text-faint)', fontWeight: 400 }}>({edit.status})</span>
      </h4>
      <div style={{ color: 'var(--text-dim)', fontSize: 12, marginBottom: 6 }}>{edit.summary}</div>
      <pre className="diff-pre">{preview || '(empty diff)'}</pre>
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
