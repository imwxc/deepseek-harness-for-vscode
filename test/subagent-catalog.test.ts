import { describe, expect, it } from 'vitest'
import type { SubagentCatalogEntry } from '@deepseek-ai/dsh-subagent/client'
import type { SessionSummary } from '../src/gateway/gateway-wire.js'
import { subagentCatalogRows } from '../src/gateway/subagent-catalog.js'

describe('DSH subagent catalog', () => {
  it('preserves external executions without turning them into local conversations', () => {
    const entries = [
      { id: 'external-1', mode: 'external', label: 'External checker' },
      { id: 'child-1', mode: 'continuable', label: 'Local checker' },
      { id: 'unavailable', mode: 'unknown' },
    ] as SubagentCatalogEntry[]
    const summaries = new Map([['external-1', { projections: { values: { subagentCatalog: [{}] } } } as SessionSummary]])
    expect(subagentCatalogRows(entries, summaries)).toEqual([
      { kind: 'child', id: 'external-1', mode: 'external', label: 'External checker', hasChildren: false, activity: 'inactive' },
      { kind: 'child', id: 'child-1', mode: 'continuable', label: 'Local checker', hasChildren: false, activity: 'inactive' },
      { kind: 'diagnostic', id: 'unavailable', reason: 'unavailable' },
    ])
  })
})
