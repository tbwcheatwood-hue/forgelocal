import { useAppStore } from '../../stores/appStore'
import { isRemoteMode } from '@shared/providerTools'

export function StatusBar() {
  const workspaceRoot = useAppStore((s) => s.workspaceRoot)
  const hasGit = useAppStore((s) => s.hasGit)
  const lmStatus = useAppStore((s) => s.lmStatus)
  const settings = useAppStore((s) => s.settings)
  const openFiles = useAppStore((s) => s.openFiles)
  const dirty = openFiles.filter((f) => f.dirty).length
  const remote = isRemoteMode(settings.provider)

  return (
    <footer className="statusbar" role="contentinfo">
      <span>{workspaceRoot ? 'workspace' : 'idle'}</span>
      {hasGit && settings.enabledTools['vcs-git-status'] !== false && <span>git</span>}
      {settings.companion?.enabled && (
        <span title={settings.companion.baseUrl}>
          companion{settings.companion.token ? '·paired' : ''}
        </span>
      )}
      <span>{remote ? 'remote' : 'local'}</span>
      <span>{settings.provider.model || 'no model'}</span>
      <span className="status-line">
        <span className={`status-dot ${lmStatus?.status ?? 'unknown'}`} />
        {lmStatus?.status ?? 'unknown'}
      </span>
      <span style={{ marginLeft: 'auto' }}>{dirty ? `${dirty} unsaved` : 'clean'}</span>
    </footer>
  )
}
