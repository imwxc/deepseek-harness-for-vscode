import type { ChatItem } from './workbench-state.js'

/**
 * Transcript display density, aligned with the official Harness Web GUI's
 * transcriptView selector: compact squeezes process segments (thinking and
 * tool calls) into one-line summaries, standard is the default folding
 * behavior, detailed and verbose expand progressively more process detail.
 */
export type TranscriptViewLevel = 'compact' | 'standard' | 'detailed' | 'verbose'

/**
 * When a completed turn's process (reasoning + tool calls) collapses into its
 * one-line disclosure: immediately after the turn ends, or only once the next
 * message arrives so the freshest answer stays readable in place.
 */
export type TurnCollapseTiming = 'afterTurnEnd' | 'nextMessage'

/** Display-only transcript preferences derived from extension settings. */
export interface TranscriptViewPreferences {
  readonly level: TranscriptViewLevel
  readonly collapseTiming: TurnCollapseTiming
  readonly showThinking: boolean
  readonly showToolCalls: boolean
}

export const DEFAULT_TRANSCRIPT_VIEW: TranscriptViewPreferences = {
  level: 'standard',
  collapseTiming: 'afterTurnEnd',
  showThinking: true,
  showToolCalls: true,
}

/** Parses the transcriptView setting, falling back to the default level. */
export function transcriptViewLevel(value: string | undefined): TranscriptViewLevel {
  return value === 'compact' || value === 'detailed' || value === 'verbose' ? value : 'standard'
}

/** Parses the collapseTiming setting, falling back to afterTurnEnd. */
export function turnCollapseTiming(value: string | undefined): TurnCollapseTiming {
  return value === 'nextMessage' ? 'nextMessage' : 'afterTurnEnd'
}

/**
 * Derives transcript display preferences from the raw settings shape. The
 * webview receives the same HarnessConfiguration the host reads, so both sides
 * normalize through this one function; unknown or missing values fall back to
 * the defaults a fresh installation would see.
 */
export function transcriptViewPreferences(source: {
  readonly transcriptView?: string
  readonly collapseTiming?: string
  readonly showThinking?: boolean
  readonly showToolCalls?: boolean
} | undefined): TranscriptViewPreferences {
  if (source === undefined) return DEFAULT_TRANSCRIPT_VIEW
  return {
    level: transcriptViewLevel(source.transcriptView),
    collapseTiming: turnCollapseTiming(source.collapseTiming),
    showThinking: source.showThinking !== false,
    showToolCalls: source.showToolCalls !== false,
  }
}

/** Completed-turn process disclosures start expanded in detailed and verbose. */
export function processGroupsOpenByDefault(level: TranscriptViewLevel): boolean {
  return level === 'detailed' || level === 'verbose'
}

/** Tool cards start expanded (arguments and results visible) in verbose. */
export function toolCardsOpenByDefault(level: TranscriptViewLevel): boolean {
  return level === 'verbose'
}

/** compact renders each tool call as a one-line summary row without sections. */
export function compactToolRows(level: TranscriptViewLevel): boolean {
  return level === 'compact'
}

/**
 * Presentation-only view over the transcript: drops reasoning blocks and tool
 * items the reader turned off. The durable session log is never rewritten —
 * toggling a setting back on restores the hidden content. A thinking-only
 * assistant bubble that becomes empty disappears unless it still carries the
 * turn's worked-time footer, which the transcript keeps rendering.
 */
export function applyTranscriptViewFilters(
  messages: readonly ChatItem[],
  preferences: TranscriptViewPreferences,
): readonly ChatItem[] {
  if (preferences.showThinking && preferences.showToolCalls) return messages
  return messages.flatMap((item): ChatItem[] => {
    if (!preferences.showToolCalls && item.kind === 'tool') return []
    if (!preferences.showThinking && item.kind === 'message' && item.blocks?.some((block) => block.kind === 'reasoning')) {
      const blocks = item.blocks.filter((block) => block.kind !== 'reasoning')
      if (blocks.length === 0 && item.workDuration === undefined) return []
      return [{ ...item, blocks }]
    }
    return [item]
  })
}
