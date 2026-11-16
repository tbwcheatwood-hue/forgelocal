import type { FileNode } from '@shared/types'
import { useAppStore } from '../../stores/appStore'

function Node({ node, depth }: { node: FileNode; depth: number }) {
  const openFile = useAppStore((s) => s.openFile)
  const activePath = useAppStore((s) => s.activePath)
  const selectedContext = useAppStore((s) => s.selectedContext)
  const toggleContext = useAppStore((s) => s.toggleContext)

  if (node.isDirectory) {
    return (
      <div>
        <div className="tree-item" style={{ paddingLeft: 8 + depth * 12 }} aria-label={node.name}>
          <span className="icon">▸</span>
          <span>{node.name}</span>
        </div>
        {node.children?.map((child) => (
          <Node key={child.path} node={child} depth={depth + 1} />
        ))}
      </div>
    )
  }

  const inContext = selectedContext.includes(node.path)

  return (
    <div style={{ display: 'flex', alignItems: 'center', paddingLeft: 8 + depth * 12 }}>
      <button
        className={`tree-item ${activePath === node.path ? 'active' : ''}`}
        onClick={() => openFile(node.path)}
        title={node.relativePath}
        style={{ flex: 1 }}
      >
        <span className="icon">·</span>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{node.name}</span>
      </button>
      <button
        className="btn ghost"
        style={{ padding: '2px 6px', fontSize: 11 }}
        aria-label={inContext ? 'Remove from AI context' : 'Add to AI context'}
        title={inContext ? 'Remove from AI context' : 'Add to AI context'}
        onClick={() => toggleContext(node.path)}
      >
        {inContext ? '✓' : '+'}
      </button>
    </div>
  )
}

export function FileTree() {
  const tree = useAppStore((s) => s.tree)
  const workspaceRoot = useAppStore((s) => s.workspaceRoot)

  if (!workspaceRoot) {
    return <div className="empty-state">Open a project to browse files.</div>
  }
  if (!tree) {
    return <div className="empty-state">Loading file tree…</div>
  }

  return (
    <div role="tree" aria-label="Project files">
      <Node node={tree} depth={0} />
    </div>
  )
}
