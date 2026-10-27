import type { TurnProcessView } from '../../domain/turn-process.js'
import type { MessageArguments, WebviewMessageKey } from '../localization.js'
import type { MessageGroup } from '../chat/message-reconciler.js'
import { applyIcon, icon } from '../icons.js'
import { formatWorkDuration } from '../work-duration/format.js'

interface ProcessEntry {
  readonly element: HTMLDetailsElement
  readonly content: HTMLElement
  readonly label: HTMLElement
}

/** Owns only process disclosure UI/state; grouping is a pure domain projection. */
export class TurnProcessComponent {
  private sessionId: string | undefined
  private openByDefault = false
  private readonly entries = new Map<string, ProcessEntry>()

  constructor(private readonly document: Document, private readonly translate: (key: WebviewMessageKey, args?: MessageArguments) => string) {}

  prepare(sessionId: string, views: readonly TurnProcessView[], openByDefault = false): readonly MessageGroup[] {
    if (sessionId !== this.sessionId) {
      this.entries.clear()
      this.sessionId = sessionId
    }
    if (openByDefault !== this.openByDefault) {
      this.openByDefault = openByDefault
      // A transcript density change (standard → detailed/verbose) re-applies
      // the new default to every existing group exactly once. Afterwards the
      // reader's own disclosure choices keep winning, as before.
      for (const entry of this.entries.values()) entry.element.open = openByDefault
    }
    const retained = new Set(views.map((view) => view.key))
    for (const key of this.entries.keys()) if (!retained.has(key)) this.entries.delete(key)
    return views.map((view) => {
      let entry = this.entries.get(view.key)
      if (entry === undefined) {
        entry = this.create(view.key, openByDefault)
        this.entries.set(view.key, entry)
      }
      const text = view.elapsedMs === undefined ? this.translate('turnProcess')
        : this.translate('turnProcessDuration', { duration: formatWorkDuration(view.elapsedMs) })
      if (entry.label.textContent !== text) entry.label.textContent = text
      // Never assign .open during an update: user disclosure choices survive
      // catalog pushes, new turns and loading another page of this history.
      return { element: entry.element, content: entry.content, messageIds: view.messageIds }
    })
  }

  private create(key: string, openByDefault: boolean): ProcessEntry {
    const element = this.document.createElement('details')
    element.className = 'turn-process'
    element.dataset.processKey = key
    element.open = openByDefault
    const summary = this.document.createElement('summary')
    summary.title = this.translate('turnProcessToggle')
    const label = this.document.createElement('span')
    label.className = 'turn-process-label'
    const chevron = this.document.createElement('span')
    chevron.className = 'turn-process-chevron'
    applyIcon(chevron, icon('chevron', 14))
    summary.append(label, chevron)
    const content = this.document.createElement('div')
    content.className = 'turn-process-content'
    element.append(summary, content)
    return { element, content, label }
  }
}
