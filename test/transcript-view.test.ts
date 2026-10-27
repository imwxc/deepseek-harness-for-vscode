import { describe, expect, it } from 'vitest'
import type { ChatItem } from '../src/domain/workbench-state.js'
import { projectTurnProcesses } from '../src/domain/turn-process.js'
import {
  applyTranscriptViewFilters,
  compactToolRows,
  processGroupsOpenByDefault,
  toolCardsOpenByDefault,
  transcriptViewLevel,
  transcriptViewPreferences,
  turnCollapseTiming,
} from '../src/domain/transcript-view.js'

const user = (id: string): ChatItem => ({ id, seq: 0, time: 0, kind: 'message', role: 'user', blocks: [{ kind: 'text', text: id }] })
const assistant = (id: string, turn = 1, reasoning = false): ChatItem => ({
  id, turn, seq: 1, time: 1, kind: 'message', role: 'assistant', streamKey: `${turn}:1`,
  blocks: [...(reasoning ? [{ kind: 'reasoning' as const, text: 'Thinking' }] : []), { kind: 'text' as const, text: id }],
})
const tool = (id: string, turn = 1): ChatItem => ({ id, turn, seq: 2, time: 2, kind: 'tool', status: 'success', title: 'bash', detail: 'npm test' })
const duration = { startedAt: 1000, endedAt: 9100 }
const finished = (item: ChatItem): ChatItem => ({ ...item, workDuration: duration })

describe('transcript view preference parsing', () => {
  it('falls back to defaults for unknown or missing values', () => {
    expect(transcriptViewPreferences(undefined)).toEqual({ level: 'standard', collapseTiming: 'afterTurnEnd', showThinking: true, showToolCalls: true })
    expect(transcriptViewPreferences({})).toEqual({ level: 'standard', collapseTiming: 'afterTurnEnd', showThinking: true, showToolCalls: true })
    expect(transcriptViewPreferences({ transcriptView: 'nope', collapseTiming: 'nope' }).level).toBe('standard')
    expect(transcriptViewPreferences({ transcriptView: 'nope', collapseTiming: 'nope' }).collapseTiming).toBe('afterTurnEnd')
  })

  it('accepts every documented level and timing', () => {
    for (const level of ['compact', 'standard', 'detailed', 'verbose']) {
      expect(transcriptViewLevel(level)).toBe(level)
    }
    expect(turnCollapseTiming('afterTurnEnd')).toBe('afterTurnEnd')
    expect(turnCollapseTiming('nextMessage')).toBe('nextMessage')
  })

  it('treats explicit false as off without inverting other flags', () => {
    const prefs = transcriptViewPreferences({ showThinking: false, showToolCalls: false })
    expect(prefs.showThinking).toBe(false)
    expect(prefs.showToolCalls).toBe(false)
    expect(prefs.level).toBe('standard')
  })

  it('maps levels to disclosure defaults', () => {
    expect(processGroupsOpenByDefault('compact')).toBe(false)
    expect(processGroupsOpenByDefault('standard')).toBe(false)
    expect(processGroupsOpenByDefault('detailed')).toBe(true)
    expect(processGroupsOpenByDefault('verbose')).toBe(true)
    expect(toolCardsOpenByDefault('verbose')).toBe(true)
    expect(toolCardsOpenByDefault('detailed')).toBe(false)
    expect(compactToolRows('compact')).toBe(true)
    expect(compactToolRows('standard')).toBe(false)
  })
})

describe('transcript view filters', () => {
  it('is the identity when everything is visible', () => {
    const items = [user('u'), assistant('a', 1, true), tool('t')]
    expect(applyTranscriptViewFilters(items, transcriptViewPreferences(undefined))).toBe(items)
  })

  it('drops tool items entirely when tool calls are hidden', () => {
    const prefs = transcriptViewPreferences({ showToolCalls: false })
    expect(applyTranscriptViewFilters([user('u'), tool('t'), assistant('a')], prefs))
      .toEqual([user('u'), assistant('a')])
  })

  it('strips reasoning blocks but keeps the message shell and timing', () => {
    const prefs = transcriptViewPreferences({ showThinking: false })
    const mixed = finished(assistant('a', 1, true))
    const filtered = applyTranscriptViewFilters([mixed], prefs)
    expect(filtered[0]?.blocks?.map((block) => block.kind)).toEqual(['text'])
    expect(filtered[0]?.workDuration).toEqual(duration)
  })

  it('removes thinking-only bubbles unless they carry the worked-time footer', () => {
    const prefs = transcriptViewPreferences({ showThinking: false })
    const thinkingOnly = { ...assistant('t', 1), blocks: [{ kind: 'reasoning' as const, text: 'Only' }] }
    expect(applyTranscriptViewFilters([thinkingOnly], prefs)).toEqual([])
    expect(applyTranscriptViewFilters([finished(thinkingOnly)], prefs)).toHaveLength(1)
  })
})

describe('collapse timing', () => {
  it('afterTurnEnd folds the completed turn immediately (default behavior)', () => {
    const items = [user('u'), assistant('think', 1, true), tool('bash'), finished(assistant('answer'))]
    const result = projectTurnProcesses(items, false)
    expect(result.groups[0]?.messageIds).toEqual(['think', 'bash'])
  })

  it('nextMessage keeps the newest completed turn unfolded until a message follows', () => {
    const items = [user('u'), assistant('think', 1, true), tool('bash'), finished(assistant('answer'))]
    const open = projectTurnProcesses(items, false, { collapseTiming: 'nextMessage' })
    expect(open.groups).toEqual([])
    expect(open.messages).toEqual(items)

    const withFollowUp = [...items.slice(0, -1), assistant('answer'), user('next')]
    const folded = projectTurnProcesses(withFollowUp, false, { collapseTiming: 'nextMessage' })
    expect(folded.groups[0]?.messageIds).toEqual(['think', 'bash'])
    expect(folded.messages.at(-1)?.id).toBe('next')
  })

  it('nextMessage still folds older turns while the newest stays open', () => {
    const items = [
      user('u1'), assistant('old-think', 1, true), tool('old-tool'), finished(assistant('old-answer')),
      user('u2'), assistant('new-think', 2, true), tool('new-tool', 2), finished(assistant('new-answer', 2)),
    ]
    const result = projectTurnProcesses(items, false, { collapseTiming: 'nextMessage' })
    expect(result.groups.map((group) => group.key)).toEqual(['turn:1'])
    expect(result.messages.at(-1)?.id).toBe('new-answer')
  })
})
