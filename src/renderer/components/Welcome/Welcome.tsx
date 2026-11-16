import { useState } from 'react'
import { isProjectGenerationIntent } from '@shared/projectGen'
import { useAppStore } from '../../stores/appStore'

export function Welcome() {
  const openProject = useAppStore((s) => s.openProject)
  const openProjectWizard = useAppStore((s) => s.openProjectWizard)
  const recent = useAppStore((s) => s.settings.recentProjects)
  const remembered = useAppStore((s) => s.rememberedProjects)
  const refreshLm = useAppStore((s) => s.refreshLm)
  const lmStatus = useAppStore((s) => s.lmStatus)
  const setShow = useAppStore((s) => s.setShow)
  const sendPrompt = useAppStore((s) => s.sendPrompt)
  const projectGenBusy = useAppStore((s) => s.projectGenBusy)
  const [goal, setGoal] = useState('')

  const canGenerate =
    Boolean(goal.trim()) &&
    !projectGenBusy &&
    (isProjectGenerationIntent(goal) || goal.trim().length >= 12)

  const onGenerate = async () => {
    const text = goal.trim()
    if (!text || projectGenBusy) return
    // Prefer generation phrasing so Send routes into the project generator.
    const prompt = isProjectGenerationIntent(text) ? text : `Build me a new app: ${text}`
    setGoal('')
    await sendPrompt(prompt)
  }

  return (
    <div className="welcome">
      <div className="welcome-atmosphere" aria-hidden="true" />
      <div className="welcome-composition">
        <div className="welcome-brand">
          <span className="brand-mark" aria-hidden="true" />
          <div className="welcome-brand-name">ForgeLocal</div>
        </div>
        <p className="welcome-headline">Local models. Your files. Your approval.</p>
        <p className="welcome-support">
          Describe an app, press Send — ForgeLocal plans, writes a runnable project under
          ~/ForgeLocalProjects, and starts preview when the stack allows.
        </p>

        <div className="welcome-generate" role="form" aria-label="Generate a new app">
          <label className="field">
            <span className="sr-only">Describe your app</span>
            <textarea
              rows={3}
              value={goal}
              placeholder="e.g. Build me a new calculator app with HTML, CSS, and JS"
              onChange={(e) => setGoal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault()
                  void onGenerate()
                }
              }}
              disabled={projectGenBusy}
            />
          </label>
          <div className="welcome-generate-actions">
            <span className="composer-hint">
              {projectGenBusy
                ? 'Generating…'
                : 'Ctrl/⌘ + Enter · offline template if the model is unavailable'}
            </span>
            <button
              className="btn primary"
              type="button"
              disabled={!canGenerate}
              onClick={() => void onGenerate()}
            >
              {projectGenBusy ? 'Working…' : 'Send'}
            </button>
          </div>
        </div>

        <div className="welcome-cta">
          <button className="btn" onClick={() => openProjectWizard()}>
            New AI project…
          </button>
          <button className="btn" onClick={() => openProject()}>
            Open project
          </button>
          <button className="btn" onClick={() => refreshLm()}>
            Test LM Studio
          </button>
          <button className="btn ghost" onClick={() => setShow('showSettings', true)}>
            Settings
          </button>
        </div>
        <div className="welcome-status">
          <div className="label">Connection</div>
          <div className="status-line" title={lmStatus?.message}>
            <span className={`status-dot ${lmStatus?.status ?? 'unknown'}`} />
            <span>{lmStatus?.message ?? 'LM Studio not tested yet'}</span>
          </div>
        </div>
        {remembered.length > 0 && (
          <div className="recent-list" aria-label="Generated projects">
            <div className="label">Generated</div>
            {remembered.slice(0, 5).map((p) => (
              <button key={p.id} onClick={() => openProject(p.path)} title={p.summary}>
                {p.name} — {p.path}
              </button>
            ))}
          </div>
        )}
        {recent.length > 0 && (
          <div className="recent-list" aria-label="Recent projects">
            <div className="label">Recent</div>
            {recent.slice(0, 5).map((p) => (
              <button key={p} onClick={() => openProject(p)}>
                {p}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
