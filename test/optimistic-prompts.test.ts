import { describe, expect, it } from 'vitest'
import { reconcileOptimisticPrompts, shouldEchoPrompt, type OptimisticBubble } from '../src/domain/optimistic-prompts.js'
import { projectConversation } from '../src/domain/workbench-state.js'
import { projectTurnProcesses } from '../src/domain/turn-process.js'
import { historyEvent } from './helpers/turn-history.js'

const echo = (promptRequestId: string, seq = 10.5): OptimisticBubble => ({
  id: `optimistic-${promptRequestId}`, promptRequestId, seq, time: 100,
  kind: 'message', role: 'user', blocks: [{ kind: 'text', text: 'Explain this code.' }],
})
const user = (requestId: string, seq = 11, prefix: readonly object[] = []) => historyEvent(seq, 'user/message', {
  id: `u-${requestId}`, role: 'user', source: { kind: 'user', rpcId: requestId },
  content: [...prefix, { type: 'text', text: 'Explain this code.' }],
})
const answer = (seq = 12) => historyEvent(seq, 'assistant/message', {
  turn: 1, step: 1, message: { id: 'a1', role: 'assistant', content: [{ type: 'text', text: 'Here is the answer.' }] },
})

describe('submitted question ordering', () => {
  it('leaves rapid follow-ups to the native queue while the first submission is awaiting admission', () => {
    const pending: OptimisticBubble[] = []
    if (shouldEchoPrompt(false, false, pending.length)) pending.push(echo('first'))
    if (shouldEchoPrompt(false, false, pending.length)) pending.push(echo('queued'))
    expect(pending.map(item => item.promptRequestId)).toEqual(['first'])
    const result = reconcileOptimisticPrompts(projectConversation([user('first'), answer()]).messages, pending)
    expect(result.messages.map(item => item.id)).toEqual(['event-11', 'event-12'])
    expect(shouldEchoPrompt(true, false, 0)).toBe(false)
    expect(shouldEchoPrompt(false, true, 0)).toBe(false)
  })
  it.each([
    ['editor selection', [{ type: 'text', text: '[Selection: timer.ts]\n```ts\nif (timer) return\n```' }]],
    ['uploaded file', [{ type: 'file', name: 'timer.ts' }]],
    ['image', [{ type: 'image', name: 'diagram.png' }]],
    ['carry-over context', [{ type: 'text', text: '<context-carry>Earlier work</context-carry>' }]],
  ])('removes the exact echo despite %s altering the durable content', (_kind, prefix) => {
    const durable = projectConversation([user('r1', 11, prefix), answer()]).messages
    const result = reconcileOptimisticPrompts(durable, [echo('r1')])
    expect(result.pending).toEqual([])
    expect(result.messages.map(item => item.role)).toEqual(['user', 'assistant'])
    expect(result.messages[0]?.promptRequestId).toBe('r1')
    expect(projectTurnProcesses(result.messages, false).messages.map(item => item.role)).toEqual(['user', 'assistant'])
  })

  it('keeps a question before its answer if the stream arrives before the user record', () => {
    const history = projectConversation([user('old', 1), answer(2), answer(12)]).messages
    const pending = reconcileOptimisticPrompts(history, [echo('new')])
    expect(pending.messages.map(item => item.id)).toEqual(['event-1', 'event-2', 'optimistic-new', 'event-12'])
    const accepted = reconcileOptimisticPrompts(projectConversation([user('old', 1), answer(2), user('new'), answer(12)]).messages, pending.pending)
    expect(accepted.messages.map(item => item.id)).toEqual(['event-1', 'event-2', 'event-11', 'event-12'])
    expect(accepted.pending).toEqual([])
  })

  it('does not match identical earlier questions or another pending submission', () => {
    const pending = [echo('new1'), echo('new2')]
    const before = reconcileOptimisticPrompts(projectConversation([user('old', 1), answer(2)]).messages, pending)
    expect(before.pending).toEqual(pending)
    const after = reconcileOptimisticPrompts(projectConversation([user('old', 1), answer(2), user('new2')]).messages, pending)
    expect(after.pending.map(item => item.promptRequestId)).toEqual(['new1'])
  })

  it('does not consume an echo for plugin context or history without a request id', () => {
    const context = historyEvent(11, 'user/message', { source: { kind: 'plugin', plugin: 'fixture', rpcId: 'r1' }, content: [{ type: 'text', text: 'Explain this code.' }] })
    const legacy = historyEvent(12, 'user/message', { source: { kind: 'user' }, content: [{ type: 'text', text: 'Explain this code.' }] })
    expect(reconcileOptimisticPrompts(projectConversation([context, legacy]).messages, [echo('r1')]).pending).toHaveLength(1)
  })
})
