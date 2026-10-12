import type { ChatBlock, ChatItem } from './workbench-state.js'

/** Local echo of one submission, anchored after the history visible at send time. */
export interface OptimisticBubble {
  readonly id: string
  readonly promptRequestId: string
  readonly seq: number
  readonly time: number
  readonly kind: 'message'
  readonly role: 'user'
  readonly blocks: readonly ChatBlock[]
}

/** A send awaiting admission is already busy, even before running=true arrives. */
export function shouldEchoPrompt(running: boolean, hostCommand: boolean, pendingCount: number): boolean {
  return !running && !hostCommand && pendingCount === 0
}

/**
 * DSH persists the submitted requestId on the accepted user's source.rpcId.
 * Content is not an identity: attachments add blocks and repeated questions
 * are legitimate independent submissions. Keep pending echoes at their send
 * position even if a stream frame arrives before the durable user record.
 */
export function reconcileOptimisticPrompts(messages: readonly ChatItem[], echoes: readonly OptimisticBubble[]): {
  readonly messages: readonly ChatItem[]
  readonly pending: readonly OptimisticBubble[]
} {
  const accepted = new Set(messages
    .filter((item) => item.kind === 'message' && item.role === 'user')
    .map((item) => item.promptRequestId)
    .filter((id): id is string => id !== undefined))
  const pending = echoes.filter((echo) => !accepted.has(echo.promptRequestId))
  return { messages: [...messages, ...pending].sort((left, right) => left.seq - right.seq), pending }
}
