import { useAppStore } from '../../stores/appStore'

export function StatusBar() {
  const workspaceRoot = useAppStore((s) => s.workspaceRoot)
  const hasGit = useAppStore((s) => s.hasGit)
  const lmStatus = useAppStore((s) => s.lmStatus)
  const settings = useAppStore((s) => s.settings)
  const openFiles = useAppStore((s) => s.openFiles)
  const dirty = openFiles.filter((f) => f.dirty).length

  return (
    <footer className="statusbar" role="contentinfo">
      <span>{workspaceRoot ? 'Workspace ready' : 'No workspace'}</span>
      {hasGit && settings.enabledTools['vcs-git-status'] !== false && <span>git</span>}
      <span>{settings.provider.model || 'no model'}</span>
      <span>{lmStatus?.status ?? 'lm:unknown'}</span>
      <span style={{ marginLeft: 'auto' }}>{dirty ? `${dirty} unsaved` : 'clean'}</span>
    </footer>
  )
}
