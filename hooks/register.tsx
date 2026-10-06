import { update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'
import type { Totals, Update } from '../types'
import { parseCommit, repoOf, shortDate, sourceFor } from './update'
import type { Marketplace } from './update'

// Session averages over main-loop turns, held by the host in $.state so a
// reload of the mod keeps them. Drawn among the footer's mode labels, at the
// right of the row that shows the permission mode.
const totals = { plugin: 'tps-status', key: 'totals' } as const
// A newer upstream commit and the offer to install it, drawn above the prompt.
const pendingUpdate = { plugin: 'tps-status', key: 'update' } as const

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

// Update check: when a session starts, ask GitHub (through gh) for the newest
// commit on the branch the installed copy follows. If the copy lacks it and
// the person has not ignored that commit, offer it above the prompt. Any
// failure in the check (no gh, signed out, no network, a CLI error) ends it
// quietly. Up to date, it waits six hours before asking again.
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000
const LAST_CHECK = 'update.lastCheck'
const IGNORED = 'update.ignored'

async function run($: EngineInterface, argv: string[], cwd?: string) {
  const r = await $.process.run(argv, { cwd, timeoutMs: 120_000 })
  return { isOk: r.exitCode === 0, out: r.stdout.trim(), err: r.stderr.trim() }
}

async function findSource($: EngineInterface) {
  const list = await run($, ['claude', 'plugin', 'marketplace', 'list', '--json'])
  if (!list.isOk) return undefined
  return sourceFor(JSON.parse(list.out) as Marketplace[], $.plugin.root)
}

async function checkForUpdate($: EngineInterface): Promise<void> {
  try {
    const now = await $.clock.now()
    if (now - Number((await $.store.get(LAST_CHECK)) ?? 0) < CHECK_EVERY_MS) return
    const src = await findSource($)
    if (!src) return void (await $.store.set(LAST_CHECK, now))

    const remote = await run($, ['git', 'remote', 'get-url', 'origin'], src.dir)
    const branch = await run($, ['git', 'rev-parse', '--abbrev-ref', 'HEAD'], src.dir)
    const repo = repoOf(remote.out)
    if (!remote.isOk || !branch.isOk || !repo || branch.out === 'HEAD') return

    const latest = await run($, ['gh', 'api', `repos/${repo}/commits/${branch.out}`])
    const commit = latest.isOk ? parseCommit(latest.out) : undefined
    if (!commit) return

    // Up to date: the clone already holds that commit.
    const has = await run($, ['git', 'merge-base', '--is-ancestor', commit.sha, 'HEAD'], src.dir)
    const ignored = (await $.store.get(IGNORED)) as { sha?: string } | undefined
    if (has.isOk || ignored?.sha === commit.sha) {
      await $.store.set(LAST_CHECK, now)
      return
    }
    // Left undecided ("Later"), it is offered again next session.
    await $.state.set(pendingUpdate, { ...commit, phase: 'available', kind: src.kind, dir: src.dir })
  } catch {
    // Quiet by design: an update check never gets in the way.
  }
}

async function applyUpdate($: EngineInterface, u: Update): Promise<void> {
  await $.state.set(pendingUpdate, { ...u, phase: 'updating' })
  const fail = (err: string) =>
    $.state.set(pendingUpdate, { ...u, phase: 'failed', error: err.split('\n')[0] || 'unknown error' })
  try {
    if (u.kind === 'folder') {
      const pull = await run($, ['git', 'pull', '--ff-only'], u.dir)
      if (!pull.isOk) return void (await fail(pull.err || pull.out))
    } else {
      const src = await findSource($)
      if (!src) return void (await fail('marketplace not found'))
      const mp = await run($, ['claude', 'plugin', 'marketplace', 'update', src.marketplace])
      if (!mp.isOk) return void (await fail(mp.err || mp.out))
      const up = await run($, ['claude', 'plugin', 'update', `tps-status@${src.marketplace}`])
      if (!up.isOk) return void (await fail(up.err || up.out))
    }
    await $.store.set(LAST_CHECK, await $.clock.now())
    if (u.kind === 'github') return void (await $.state.set(pendingUpdate, { ...u, phase: 'done' }))

    // A folder install loads the pulled code on a plugin reload. Record the
    // outcome first: the reload restarts this module, and $.state outlives it.
    await $.state.set(pendingUpdate, { ...u, phase: 'done', reload: 'ran' })
    try {
      await $.command.run({ command: 'reload-plugins' })
    } catch {
      // Could not run it: leave it in the prompt if that is empty, else ask.
      const box = await $.prompt.read().catch(() => undefined)
      const isFilled = box?.text.trim() === '' && (await $.prompt.fill({ text: '/reload-plugins' })).isFilled
      await $.state.set(pendingUpdate, { ...u, phase: 'done', reload: isFilled ? 'prompt' : 'manual' })
    }
  } catch (err) {
    await fail(String(err))
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    // Earlier versions pinned the line with $.ui.status; clear any such pin.
    $.ui.status(undefined)
    // Runs on its own; the session does not wait for it.
    void checkForUpdate($)
    return next(e)
  })

  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    const { value } = await $.state.get(totals)
    const line = value && formatStatus(value)
    if (!line) return next(e)
    return next({ ...e, props: { ...e.props, modes: [...e.props.modes, line] } })
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const { value: u } = await $.state.get(pendingUpdate)
    if (!u || e.props.hasSurvey) return next(e)

    const { Box, Button, Text } = $.ui.resolve(e)
    const close = () => $.state.set(pendingUpdate, null)
    const commit = `${u.sha.slice(0, 7)} · ${shortDate(u.date)}${u.subject ? ` · ${u.subject}` : ''}`

    if (u.phase === 'available') {
      return (
        <Box flexDirection="column">
          <Text>tps-status update available: {commit}</Text>
          <Box>
            <Button key="update" label="Update" onPress={() => applyUpdate($, u)} />
            <Text> </Text>
            <Button
              key="ignore"
              label="Ignore this version"
              onPress={async () => {
                await $.store.set(IGNORED, { sha: u.sha, date: u.date })
                await close()
              }}
            />
            <Text> </Text>
            <Button key="later" label="Later" onPress={close} />
          </Box>
        </Box>
      )
    }
    if (u.phase === 'updating') {
      return <Text dimColor>Updating tps-status to {u.sha.slice(0, 7)}…</Text>
    }
    const message =
      u.phase === 'failed'
        ? `tps-status update failed: ${u.error}. To update by hand: git -C ${u.dir} pull --ff-only, then /reload-plugins.`
        : u.kind === 'github'
          ? `tps-status updated to ${u.sha.slice(0, 7)}. Restart Claude Code to use it.`
          : u.reload === 'ran'
            ? `tps-status updated to ${u.sha.slice(0, 7)} and reloaded. If anything looks stale, restart Claude Code.`
            : u.reload === 'prompt'
              ? `tps-status updated to ${u.sha.slice(0, 7)}. Press Enter to run /reload-plugins (it is in the prompt), or restart Claude Code.`
              : `tps-status updated to ${u.sha.slice(0, 7)}. Run /reload-plugins, or restart Claude Code, to use it.`
    return (
      <Box flexDirection="column">
        <Text>{message}</Text>
        <Button key="dismiss" label="Dismiss" onPress={close} />
      </Box>
    )
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
