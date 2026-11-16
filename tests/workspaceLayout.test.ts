import { describe, expect, it } from 'vitest'
import {
  DEFAULT_WORKSPACE_LAYOUT,
  movePanelToZone,
  normalizeWorkspaceLayout,
  panelsInZone,
  resetWorkspaceLayout,
  setBottomHeight,
  setColumnWidth,
  setPanelMinimized,
  stackSupportsBrowserPreview,
  toggleMaximize
} from '../src/shared/workspaceLayout'

describe('normalizeWorkspaceLayout', () => {
  it('returns defaults for empty input', () => {
    const layout = normalizeWorkspaceLayout(null)
    expect(layout.version).toBe(1)
    expect(layout.panels).toHaveLength(5)
    expect(panelsInZone(layout, 'left').map((p) => p.id)).toEqual(['explorer'])
    expect(panelsInZone(layout, 'center').map((p) => p.id)).toEqual(['editor', 'preview'])
    expect(panelsInZone(layout, 'right').map((p) => p.id)).toEqual(['chat'])
    expect(panelsInZone(layout, 'bottom').map((p) => p.id)).toEqual(['console'])
  })

  it('fills missing panels and clamps sizes', () => {
    const layout = normalizeWorkspaceLayout({
      version: 1,
      columnWidths: { left: 9999, right: 10 },
      bottomHeight: 10,
      panels: [{ id: 'chat', zone: 'left', order: 0, flex: 99, minimized: true }],
      maximized: 'nope' as never
    })
    expect(layout.columnWidths.left).toBe(480)
    expect(layout.columnWidths.right).toBe(220)
    expect(layout.bottomHeight).toBe(80)
    expect(layout.maximized).toBeNull()
    expect(layout.panels.find((p) => p.id === 'chat')?.zone).toBe('left')
    expect(layout.panels.find((p) => p.id === 'explorer')).toBeTruthy()
  })
})

describe('move / minimize / maximize', () => {
  it('moves chat to bottom and renumbers', () => {
    const next = movePanelToZone(DEFAULT_WORKSPACE_LAYOUT, 'chat', 'bottom')
    expect(panelsInZone(next, 'right')).toHaveLength(0)
    expect(panelsInZone(next, 'bottom').map((p) => p.id)).toEqual(['console', 'chat'])
  })

  it('minimizes and clears maximize', () => {
    let layout = toggleMaximize(DEFAULT_WORKSPACE_LAYOUT, 'preview')
    expect(layout.maximized).toBe('preview')
    layout = setPanelMinimized(layout, 'preview', true)
    expect(layout.maximized).toBeNull()
    expect(layout.panels.find((p) => p.id === 'preview')?.minimized).toBe(true)
  })

  it('resets to defaults', () => {
    const mutated = setColumnWidth(DEFAULT_WORKSPACE_LAYOUT, 'left', 400)
    expect(resetWorkspaceLayout().columnWidths.left).toBe(
      DEFAULT_WORKSPACE_LAYOUT.columnWidths.left
    )
    expect(mutated.columnWidths.left).toBe(400)
    expect(setBottomHeight(mutated, 200).bottomHeight).toBe(200)
  })
})

describe('stackSupportsBrowserPreview', () => {
  it('allows static stacks only', () => {
    expect(stackSupportsBrowserPreview('static-web')).toBe(true)
    expect(stackSupportsBrowserPreview('vanilla-spa')).toBe(true)
    expect(stackSupportsBrowserPreview('node-cli')).toBe(false)
    expect(stackSupportsBrowserPreview(null)).toBe(true)
  })
})
