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

declare module 'claude-code' {
  interface PluginState {
    'tps-status': { totals: Totals }
  }
}
