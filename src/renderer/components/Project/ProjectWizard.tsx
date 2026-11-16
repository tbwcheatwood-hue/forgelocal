import { useMemo, useState } from 'react'
import {
  inferStackFromDescription,
  planNeedsQuestions,
  type ProjectStack
} from '@shared/projectGen'
import { useAppStore } from '../../stores/appStore'

const STACKS: { id: ProjectStack; label: string; blurb: string }[] = [
  { id: 'static-web', label: 'Static web', blurb: 'HTML / CSS / JS page' },
  { id: 'vanilla-spa', label: 'Vanilla SPA', blurb: 'Hash-routed client app' },
  { id: 'node-cli', label: 'Node CLI', blurb: 'package.json + bin entry' }
]

export function ProjectWizard() {
  const show = useAppStore((s) => s.showProjectWizard)
  const busy = useAppStore((s) => s.projectGenBusy)
  const plan = useAppStore((s) => s.projectPlan)
  const lmStatus = useAppStore((s) => s.lmStatus)
  const close = useAppStore((s) => s.closeProjectWizard)
  const planAiProject = useAppStore((s) => s.planAiProject)
  const materializeAiProject = useAppStore((s) => s.materializeAiProject)
  const setError = useAppStore((s) => s.setError)

  const [description, setDescription] = useState('')
  const [stack, setStack] = useState<ProjectStack>('static-web')
  const [stackTouched, setStackTouched] = useState(false)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [preferTemplate, setPreferTemplate] = useState(false)
  const [step, setStep] = useState<'describe' | 'questions' | 'review'>('describe')

  const connected = lmStatus?.status === 'connected'

  const effectiveStack = useMemo(() => {
    if (stackTouched) return stack
    return description.trim() ? inferStackFromDescription(description) : stack
  }, [description, stack, stackTouched])

  if (!show) return null

  const reset = () => {
    setDescription('')
    setAnswers({})
    setPreferTemplate(false)
    setStep('describe')
    setStackTouched(false)
  }

  const onClose = () => {
    reset()
    close()
  }

  const onPlan = async (opts?: { preferTemplate?: boolean; withAnswers?: boolean }) => {
    const useTemplate = opts?.preferTemplate ?? preferTemplate
    const result = await planAiProject({
      description,
      stackHint: effectiveStack,
      preferTemplate: useTemplate,
      answers: opts?.withAnswers ? answers : undefined
    })
    if (!result) return
    if (planNeedsQuestions(result) && !opts?.withAnswers) {
      setStep('questions')
      return
    }
    setStep('review')
  }

  const onCreate = async () => {
    if (!plan || !plan.files.length) {
      setError('Plan has no files yet.')
      return
    }
    const ok = await materializeAiProject(plan)
    if (ok) reset()
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal project-wizard"
        role="dialog"
        aria-label="New AI project"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <strong>New AI project</strong>
          <button className="btn ghost" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="modal-body">
          <p className="project-wizard-lead">
            Describe what you want. ForgeLocal plans with your local model when available, or ships
            an honest offline template you can refine in chat.
          </p>

          {step === 'describe' && (
            <>
              <label className="field">
                <span>Goal</span>
                <textarea
                  rows={5}
                  value={description}
                  placeholder="e.g. A tiny static landing page for my CLI tool with a dark theme and a download button"
                  onChange={(e) => setDescription(e.target.value)}
                />
              </label>

              <div className="project-stack-grid" role="radiogroup" aria-label="Stack">
                {STACKS.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className={`project-stack-card ${effectiveStack === s.id ? 'active' : ''}`}
                    onClick={() => {
                      setStack(s.id)
                      setStackTouched(true)
                    }}
                  >
                    <strong>{s.label}</strong>
                    <span>{s.blurb}</span>
                  </button>
                ))}
              </div>

              <label className="field checkbox-row">
                <input
                  type="checkbox"
                  checked={preferTemplate}
                  onChange={(e) => setPreferTemplate(e.target.checked)}
                />
                <span>Skip AI — use offline template only</span>
              </label>

              <div className="project-wizard-hint">
                <span className={`status-dot ${lmStatus?.status ?? 'unknown'}`} />
                {preferTemplate
                  ? 'Template mode — no model call.'
                  : connected
                    ? 'LM Studio connected — AI plan preferred.'
                    : 'Model offline — will fall back to template if planning fails.'}
              </div>
            </>
          )}

          {step === 'questions' && plan?.questions && (
            <div className="project-questions">
              <p>The planner needs a few answers before writing files:</p>
              {plan.questions.map((q) => (
                <label key={q.id} className="field">
                  <span>{q.prompt}</span>
                  {q.options?.length ? (
                    <select
                      value={answers[q.id] ?? ''}
                      onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                    >
                      <option value="">Choose…</option>
                      {q.options.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      value={answers[q.id] ?? ''}
                      onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                    />
                  )}
                </label>
              ))}
            </div>
          )}

          {step === 'review' && plan && (
            <div className="project-review">
              <div className="project-review-head">
                <div>
                  <div className="project-review-name">{plan.name}</div>
                  <div className="project-review-summary">{plan.summary}</div>
                </div>
                <span className="project-source-pill">{plan.source}</span>
              </div>
              {plan.warnings?.length ? (
                <ul className="project-warnings">
                  {plan.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              ) : null}
              {plan.features.length > 0 && (
                <div className="project-features">
                  {plan.features.map((f) => (
                    <span key={f}>{f}</span>
                  ))}
                </div>
              )}
              <div className="label">Files ({plan.files.length})</div>
              <ul className="project-file-list">
                {plan.files.map((f) => (
                  <li key={f.path}>
                    <code>{f.path}</code>
                    {f.description ? <span>{f.description}</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <div className="modal-footer">
          {step !== 'describe' && (
            <button
              className="btn ghost"
              disabled={busy}
              onClick={() =>
                setStep(
                  step === 'review' && (plan?.questions?.length ?? 0) > 0 ? 'questions' : 'describe'
                )
              }
            >
              Back
            </button>
          )}
          <div className="spacer" />
          {step === 'describe' && (
            <button
              className="btn primary"
              disabled={busy || !description.trim()}
              onClick={() => void onPlan()}
            >
              {busy ? 'Planning…' : 'Plan project'}
            </button>
          )}
          {step === 'questions' && (
            <button
              className="btn primary"
              disabled={busy}
              onClick={() => void onPlan({ withAnswers: true })}
            >
              {busy ? 'Planning…' : 'Continue with answers'}
            </button>
          )}
          {step === 'review' && (
            <button
              className="btn primary"
              disabled={busy || !plan?.files.length}
              onClick={() => void onCreate()}
            >
              {busy ? 'Creating…' : 'Create & open'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
