// Pure helpers for the update check in register.tsx.

/** `owner/repo` from a GitHub URL (https or ssh), else undefined. */
export function repoOf(url: unknown): string | undefined {
  if (typeof url !== 'string') return undefined
  return /github\.com[/:]([^/]+\/[^/]+?)(?:\.git)?\/?\s*$/.exec(url)?.[1]
}

/**
 * The marketplace an installed copy came from, read off its cache folder
 * (`~/.claude/plugins/cache/<marketplace>/<plugin>/<version>`).
 */
export function marketplaceOf(root: string): string | undefined {
  return /\/plugins\/cache\/([^/]+)\/[^/]+\/[^/]+\/?$/.exec(root)?.[1]
}

/**
 * The install record file for a copy run from the plugin cache
 * (`<config>/plugins/cache/…` → `<config>/plugins/installed_plugins.json`).
 */
export function installRecordOf(root: string): string | undefined {
  const m = /^(.*\/plugins)\/cache\/[^/]+\/[^/]+\/[^/]+\/?$/.exec(root)
  return m ? `${m[1]}/installed_plugins.json` : undefined
}

/**
 * The commit a cached copy was installed at, from `installed_plugins.json`:
 * the record for `id` whose install path is `root`. A GitHub marketplace's
 * checkout can move ahead of what is installed, so its HEAD is no guide.
 */
export function installedSha(json: string, id: string, root: string): string | undefined {
  const records = JSON.parse(json)?.plugins?.[id]
  if (!Array.isArray(records)) return undefined
  const sha = records.find(r => typeof r?.installPath === 'string' && trim(r.installPath) === trim(root))?.gitCommitSha
  return typeof sha === 'string' ? sha : undefined
}

export type Marketplace = {
  name?: string
  source?: string
  path?: string
  installLocation?: string
}

export type Source = { kind: 'folder' | 'github'; marketplace: string; dir: string }

const trim = (p: string) => p.replace(/\/+$/, '')

/**
 * Where this copy of the mod updates from, given `claude plugin marketplace
 * list --json` and the mod's root: a local clone added as a marketplace
 * (`/install`), or a GitHub marketplace's checkout. Undefined for a copy
 * loaded any other way (--plugin-dir, a dev-mods folder), which never updates.
 */
export function sourceFor(list: readonly Marketplace[], root: string): Source | undefined {
  const fromCache = marketplaceOf(root)
  const m = list.find(
    m => (m.source === 'directory' && m.path && trim(m.path) === trim(root)) || (fromCache && m.name === fromCache),
  )
  if (!m?.name) return undefined
  if (m.source === 'directory' && m.path) return { kind: 'folder', marketplace: m.name, dir: m.path }
  if (m.source === 'github' && m.installLocation) return { kind: 'github', marketplace: m.name, dir: m.installLocation }
  return undefined
}

/** The fields we show from `gh api repos/<repo>/commits/<ref>`. */
export function parseCommit(json: string): { sha: string; date: string; subject: string } | undefined {
  const c = JSON.parse(json)
  const sha = c?.sha
  const date = c?.commit?.committer?.date ?? c?.commit?.author?.date
  const message = c?.commit?.message
  if (typeof sha !== 'string' || typeof date !== 'string') return undefined
  return { sha, date, subject: typeof message === 'string' ? message.split('\n')[0]! : '' }
}

/** `2026-10-06T10:40:12Z` → `2026-10-06 10:40 UTC`. */
export function shortDate(iso: string): string {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(iso)
  return m ? `${m[1]} ${m[2]} UTC` : iso
}
