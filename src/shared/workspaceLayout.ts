/**
 * Dockable workspace layout: zones, panel placement, resize, persist/reset.
 */

export type WorkspaceZone = 'left' | 'center' | 'right' | 'bottom'

export type WorkspacePanelId = 'explorer' | 'chat' | 'editor' | 'preview' | 'console'

export interface WorkspacePanelState {
  id: WorkspacePanelId
  zone: WorkspaceZone
  /** Order within the zone (lower = earlier). */
  order: number
  /** Flex weight when zone is a column/row of peers (1–8). */
  flex: number
  minimized: boolean
}

export interface WorkspaceLayout {
  version: 1
  panels: WorkspacePanelState[]
  /** Column widths in CSS px for left / center / right (center flexes when 0). */
  columnWidths: { left: number; right: number }
  /** Bottom row height in px when console (or other bottom panels) visible. */
  bottomHeight: number
  maximized: WorkspacePanelId | null
}

export const WORKSPACE_PANEL_LABELS: Record<WorkspacePanelId, string> = {
  explorer: 'Explorer',
  chat: 'AI chat',
  editor: 'Editor',
  preview: 'Preview',
  console: 'Console'
}

export const DEFAULT_WORKSPACE_LAYOUT: WorkspaceLayout = {
  version: 1,
  maximized: null,
  columnWidths: { left: 248, right: 340 },
  bottomHeight: 180,
  panels: [
    { id: 'explorer', zone: 'left', order: 0, flex: 1, minimized: false },
    { id: 'editor', zone: 'center', order: 0, flex: 2, minimized: false },
    { id: 'preview', zone: 'center', order: 1, flex: 2, minimized: false },
    { id: 'chat', zone: 'right', order: 0, flex: 1, minimized: false },
    { id: 'console', zone: 'bottom', order: 0, flex: 1, minimized: false }
  ]
}

const PANEL_IDS: WorkspacePanelId[] = ['explorer', 'chat', 'editor', 'preview', 'console']
const ZONES: WorkspaceZone[] = ['left', 'center', 'right', 'bottom']

export function normalizeWorkspaceLayout(input?: Partial<WorkspaceLayout> | null): WorkspaceLayout {
  const base = structuredClone(DEFAULT_WORKSPACE_LAYOUT)
  if (!input || typeof input !== 'object') return base

  const columnWidths = {
    left: clamp(Number(input.columnWidths?.left ?? base.columnWidths.left), 140, 480),
    right: clamp(Number(input.columnWidths?.right ?? base.columnWidths.right), 220, 560)
  }
  const bottomHeight = clamp(Number(input.bottomHeight ?? base.bottomHeight), 80, 420)
  const maximized = input.maximized && PANEL_IDS.includes(input.maximized) ? input.maximized : null

  const byId = new Map<WorkspacePanelId, WorkspacePanelState>()
  for (const p of base.panels) byId.set(p.id, { ...p })

  if (Array.isArray(input.panels)) {
    for (const raw of input.panels) {
      if (!raw || typeof raw !== 'object') continue
      const id = (raw as WorkspacePanelState).id
      if (!PANEL_IDS.includes(id)) continue
      const zone = ZONES.includes((raw as WorkspacePanelState).zone)
        ? (raw as WorkspacePanelState).zone
        : byId.get(id)!.zone
      byId.set(id, {
        id,
        zone,
        order: Number.isFinite((raw as WorkspacePanelState).order)
          ? Number((raw as WorkspacePanelState).order)
          : byId.get(id)!.order,
        flex: clamp(Number((raw as WorkspacePanelState).flex) || 1, 1, 8),
        minimized: Boolean((raw as WorkspacePanelState).minimized)
      })
    }
  }

  // Ensure every panel exists exactly once
  const panels = PANEL_IDS.map((id) => byId.get(id)!).sort((a, b) => {
    if (a.zone !== b.zone) return ZONES.indexOf(a.zone) - ZONES.indexOf(b.zone)
    return a.order - b.order
  })

  // Re-number orders per zone
  for (const zone of ZONES) {
    const inZone = panels.filter((p) => p.zone === zone)
    inZone.forEach((p, i) => {
      p.order = i
    })
  }

  return { version: 1, panels, columnWidths, bottomHeight, maximized }
}

export function resetWorkspaceLayout(): WorkspaceLayout {
  return structuredClone(DEFAULT_WORKSPACE_LAYOUT)
}

export function panelsInZone(layout: WorkspaceLayout, zone: WorkspaceZone): WorkspacePanelState[] {
  return layout.panels.filter((p) => p.zone === zone).sort((a, b) => a.order - b.order)
}

export function movePanelToZone(
  layout: WorkspaceLayout,
  panelId: WorkspacePanelId,
  zone: WorkspaceZone,
  atOrder?: number
): WorkspaceLayout {
  const next = normalizeWorkspaceLayout(layout)
  const panel = next.panels.find((p) => p.id === panelId)
  if (!panel) return next

  const others = next.panels.filter((p) => p.id !== panelId && p.zone === zone)
  const order = atOrder == null ? others.length : clamp(atOrder, 0, others.length)
  panel.zone = zone
  panel.minimized = false
  panel.order = order
  others.forEach((p) => {
    if (p.order >= order) p.order += 1
  })
  next.maximized = next.maximized === panelId ? null : next.maximized
  return normalizeWorkspaceLayout(next)
}

export function setPanelMinimized(
  layout: WorkspaceLayout,
  panelId: WorkspacePanelId,
  minimized: boolean
): WorkspaceLayout {
  const next = normalizeWorkspaceLayout(layout)
  const panel = next.panels.find((p) => p.id === panelId)
  if (!panel) return next
  panel.minimized = minimized
  if (minimized && next.maximized === panelId) next.maximized = null
  return next
}

export function toggleMaximize(
  layout: WorkspaceLayout,
  panelId: WorkspacePanelId
): WorkspaceLayout {
  const next = normalizeWorkspaceLayout(layout)
  next.maximized = next.maximized === panelId ? null : panelId
  const panel = next.panels.find((p) => p.id === panelId)
  if (panel && next.maximized === panelId) panel.minimized = false
  return next
}

export function setColumnWidth(
  layout: WorkspaceLayout,
  side: 'left' | 'right',
  width: number
): WorkspaceLayout {
  const next = normalizeWorkspaceLayout(layout)
  next.columnWidths[side] = clamp(width, side === 'left' ? 140 : 220, side === 'left' ? 480 : 560)
  return next
}

export function setBottomHeight(layout: WorkspaceLayout, height: number): WorkspaceLayout {
  const next = normalizeWorkspaceLayout(layout)
  next.bottomHeight = clamp(height, 80, 420)
  return next
}

/** Stacks that can run in the loopback static preview. */
export function stackSupportsBrowserPreview(stack: string | undefined | null): boolean {
  return stack === 'static-web' || stack === 'vanilla-spa' || !stack
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min
  return Math.min(max, Math.max(min, Math.round(n)))
}
