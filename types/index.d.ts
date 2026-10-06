export type Totals = {
  turns: number
  sumItps: number
  sumOtps: number
  sumLat: number
  latTurns: number
  sumGen: number
  genTurns: number
  model: string
}

/** A newer commit found upstream, and where the offer to install it stands. */
export type Update = {
  sha: string
  /** The commit's date, ISO 8601. */
  date: string
  subject: string
  phase: 'available' | 'updating' | 'done' | 'failed'
  /** How the installed copy updates: a pull in the clone, or the claude CLI. */
  kind: 'folder' | 'github'
  /** The clone (folder) or marketplace checkout (github). */
  dir: string
  /** The first line of what went wrong, when phase is 'failed'. */
  error?: string
  /**
   * How the new code gets loaded once updated (folder installs): the mod ran
   * /reload-plugins itself, left it in the empty prompt, or the person runs it.
   */
  reload?: 'ran' | 'prompt' | 'manual'
}

declare module 'claude-code' {
  interface PluginState {
    'tps-status': { totals: Totals; update: Update | null }
  }
}
