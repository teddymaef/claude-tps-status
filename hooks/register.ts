import { update } from 'claude-code'
import type { Register } from 'claude-code'
import type { Totals } from '../types'

// Session averages over main-loop turns, held by the host in $.state so a
// reload of the mod keeps them. Drawn among the footer's mode labels, at the
// right of the row that shows the permission mode.
const totals = { plugin: 'tps-status', key: 'totals' } as const

const EMPTY: Totals = {
  turns: 0, sumItps: 0, sumOtps: 0, sumLat: 0, latTurns: 0, sumGen: 0, genTurns: 0, model: '',
}

// Per-turn timing gathered from the turn's model requests (steps). A reload
// mid-turn loses only that turn's latency and generation speed.
type Pending = { latencyMs?: number; streamMs: number; outTokens: number }
const pending = new Map<string, Pending>()

const fmt = (n: number) => Math.round(n)

export function formatStatus(t: Totals): string | undefined {
  if (t.turns === 0) return undefined
  const otps = t.sumOtps / t.turns
  const gen = t.genTurns ? t.sumGen / t.genTurns : otps
  const latS = t.latTurns ? t.sumLat / t.latTurns / 1000 : 0
  let out = `TPS  ↑ ${fmt(t.sumItps / t.turns)}/s  ↓ ${fmt(otps)}/s  ↯ ${fmt(gen)}/s`
  if (latS > 0) out += `  ⧖ ${latS.toFixed(1)}s`
  if (t.model) out += `  ${t.model}`
  return out
}

export const register: Register = on => {
  // Earlier versions pinned the line with $.ui.status; clear any such pin.
  on('session.start', async ($, e, next) => {
    $.ui.status(undefined)
    return next(e)
  })

  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    const { value } = await $.state.get(totals)
    const line = value && formatStatus(value)
    if (!line) return next(e)
    return next({ ...e, props: { ...e.props, modes: [...e.props.modes, line] } })
  })

  on('turn.step', async function* ($, e, next) {
    const stream = next(e)
    if (e.agentId) return yield* stream

    const sentAt = await $.clock.now()
    let firstAt: number | undefined
    let r = await stream.next()
    while (!r.done) {
      if (firstAt === undefined && r.value.kind !== 'engine') firstAt = await $.clock.now()
      yield r.value
      r = await stream.next()
    }
    const endAt = await $.clock.now()
    const result = r.value

    if (firstAt !== undefined && result.usage) {
      const p = pending.get(e.turnId) ?? { streamMs: 0, outTokens: 0 }
      if (p.latencyMs === undefined) p.latencyMs = firstAt - sentAt
      p.streamMs += endAt - firstAt
      p.outTokens += result.usage.output_tokens
      pending.set(e.turnId, p)
    }
    return result
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId) return result

    const p = pending.get(e.turnId)
    pending.delete(e.turnId)
    const usage = e.usage
    const durS = e.durationMs / 1000
    if (e.isAborted || !usage || durS <= 0) return result

    await update($, totals, prev => {
      const t = { ...(prev ?? EMPTY) }
      t.turns++
      t.sumItps += usage.input_tokens / durS
      t.sumOtps += usage.output_tokens / durS
      if (p?.latencyMs !== undefined) {
        t.sumLat += p.latencyMs
        t.latTurns++
      }
      if (p && p.streamMs > 0) {
        t.sumGen += p.outTokens / (p.streamMs / 1000)
        t.genTurns++
      }
      if (usage.model) t.model = usage.model
      return t
    })
    return result
  })
}
