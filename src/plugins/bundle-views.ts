import type { BundleInfo } from '@deepseek-ai/dsh-plugin-manager/types'
import type { InstalledDshPlugin } from './types.js'

/** Separate downloadable catalog entries from installed or selected bundles. */
export function installedBundleViews(bundles: readonly BundleInfo[]): InstalledDshPlugin[] {
  return bundles
    .filter(bundle => bundle.availability !== 'missing' || bundle.installed || bundle.enabled)
    .map(bundle => ({
      name: bundle.name, version: bundle.version ?? '', source: bundle.source ?? (bundle.installed ? 'profile' : 'DSH'),
      ...(bundle.description === undefined ? {} : { description: bundle.description }),
      enabled: bundle.enabled, removable: bundle.removable,
      ...(bundle.readOnlyReason === undefined ? {} : { readOnlyReason: bundle.readOnlyReason }),
      ...(bundle.availability === 'missing' ? { missing: true } : {}),
      ...(bundle.error === undefined ? {} : { error: bundle.error.diagnostic ?? bundle.error.code }),
      includesWebClient: bundle.rows.some(row => row.moduleName.includes('client-ui')),
    }))
}
