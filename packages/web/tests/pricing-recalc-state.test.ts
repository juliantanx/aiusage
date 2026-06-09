import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const pricingPageSource = readFileSync(
  fileURLToPath(new URL('../src/routes/pricing/+page.svelte', import.meta.url)),
  'utf8',
)

function getFunctionSource(name: string): string {
  const start = pricingPageSource.indexOf(`  async function ${name}(`)
  expect(start, `${name} function should exist`).toBeGreaterThanOrEqual(0)

  const nextFunction = pricingPageSource.indexOf('\n  async function ', start + 1)
  const nextSyncFunction = pricingPageSource.indexOf('\n  function ', start + 1)
  const candidates = [nextFunction, nextSyncFunction].filter((index) => index > start)
  const end = candidates.length ? Math.min(...candidates) : pricingPageSource.indexOf('\n  $:', start)
  return pricingPageSource.slice(start, end)
}

function getSyncFunctionSource(name: string): string {
  const start = pricingPageSource.indexOf(`  function ${name}(`)
  expect(start, `${name} function should exist`).toBeGreaterThanOrEqual(0)

  const nextFunction = pricingPageSource.indexOf('\n  function ', start + 1)
  const nextAsyncFunction = pricingPageSource.indexOf('\n  async function ', start + 1)
  const candidates = [nextFunction, nextAsyncFunction].filter((index) => index > start)
  const end = candidates.length ? Math.min(...candidates) : pricingPageSource.indexOf('\n  $:', start)
  return pricingPageSource.slice(start, end)
}

describe('pricing recalculation prompt state', () => {
  it('marks saved price changes as requiring recalculation', () => {
    const source = getFunctionSource('saveEdit')

    expect(source).toContain('const result = await updatePricing')
    expect(source).toContain('applyNeedsRecalcResult(result)')
  })

  it('marks reset price changes as requiring recalculation', () => {
    const source = getFunctionSource('resetModel')

    expect(source).toContain('const result = await deletePricing')
    expect(source).toContain('applyNeedsRecalcResult(result)')
    expect(source).not.toContain('clearNeedsRecalc')
  })

  it('shows recalculated state after a matching recalculation completes', () => {
    expect(pricingPageSource).toContain("if (recalcProgress.state === 'done')")
    expect(pricingPageSource).toContain('doneCoversPendingChange')
    expect(pricingPageSource).toContain('hasServerRecalcRequirement')
    expect(pricingPageSource).toContain('? !needsRecalc')
    expect(pricingPageSource).toContain('markDone()')
    expect(pricingPageSource).toContain("else if (state === 'done' && !pendingRecalc) recalcPanelState = 'done'")
  })

  it('uses local needsRecalc flag for panel state so stale server status does not mask new changes', () => {
    expect(pricingPageSource).toContain('const pendingRecalc = needsRecalc')
    expect(pricingPageSource).not.toContain('recalcProgress.needsRecalc : needsRecalc')
  })

  it('uses reactive declarations for panel title and body so Svelte re-renders on state changes', () => {
    expect(pricingPageSource).toContain('$: recalcTitleText =')
    expect(pricingPageSource).toContain('$: recalcBodyText =')
    expect(pricingPageSource).toContain('{recalcTitleText}')
    expect(pricingPageSource).toContain('{recalcBodyText}')
    expect(pricingPageSource).not.toContain('{recalcPanelTitle()}')
    expect(pricingPageSource).not.toContain('{recalcPanelBody()}')
  })

  it('applies the server recalculation requirement before rendering completion state', () => {
    const serverRequirementSource = getSyncFunctionSource('applyServerRecalcRequirement')
    const statusSource = getSyncFunctionSource('applyRecalcStatus')

    expect(serverRequirementSource).toContain("typeof status.needsRecalc !== 'boolean'")
    expect(serverRequirementSource).toContain('markNeedsRecalc(status.needsRecalcSince ?? Date.now())')
    expect(serverRequirementSource).toContain('needsRecalc = false')
    expect(serverRequirementSource).toContain('return true')
    expect(statusSource).toContain('const hasServerRecalcRequirement = applyServerRecalcRequirement(recalcProgress)')
  })

  it('tracks the current recalculation by server start time', () => {
    const source = getFunctionSource('startRecalcCosts')

    expect(source).toContain('const recalcRequestedAt = Date.now()')
    expect(source).toContain('activeRecalcStartedAt = status.startedAt ?? recalcRequestedAt')
    expect(source).not.toContain('activeRecalcCoversChangeSince')
  })

  it('keeps refreshing recalculation status until the server reports completion', () => {
    const startSource = getFunctionSource('startRecalcCosts')
    const waitSource = getFunctionSource('waitForRecalcCompletion')

    expect(startSource).toContain('await waitForRecalcCompletion(waitToken)')
    expect(waitSource).toContain('await fetchPricingRecalcStatus()')
    expect(waitSource).toContain('applyRecalcStatus(status)')
    expect(waitSource).toContain('if (!isActiveRecalcStatus(status)) return')
  })
})
