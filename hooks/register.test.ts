import { test, expect, mock } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, RenderElement } from 'claude-code'

const usage = {
  input_tokens: 50,
  output_tokens: 200,
  cache_read_input_tokens: 0,
  cache_creation_input_tokens: 0,
  model: 'claude-opus-5-5',
}

// Stands in for the engine beneath the plugin's footer hook (registered before
// the test's first call on $); `draw` renders the footer's mode labels through
// the plugin and returns the labels that reached the engine.
function footer(on: On) {
  let drawn: readonly string[] = []
  on('ui.render', { component: 'SessionMode' }, ($, e) => {
    drawn = e.props.modes
    const { Text } = $.ui.resolve(e)
    return h(Text, null, drawn.join(' & ')) as RenderElement
  })
  return async ($: Engine, modes: string[] = []) => {
    await $.ui.render({ component: 'SessionMode', surface: 'terminal', requestId: 'footer', props: { modes } })
    return drawn
  }
}

test('shows throughput beside the mode labels after a main-loop turn', async ($, on) => {
  const draw = footer(on)
  const clock = mock.clock(on, { now: 0 })
  // The "model": 1 s to the first token, then 2 s of streaming.
  on('turn.step', async function* ($, e) {
    await clock.sleep(1000)
    yield { kind: 'text', index: 0, text: 'hello' }
    await clock.sleep(2000)
    yield { kind: 'stop', stopReason: 'end_turn', usage }
    return { turnId: e.turnId, index: e.index, answer: 'hello', toolUses: [], stopReason: 'end_turn', usage }
  })
  on('turn.complete', ($, e) => ({ text: e.answer }))

  const step = (async () => {
    const s = $.turn.step({ turnId: 't1', index: 0, model: 'claude-opus-5-5', messageCount: 1 })
    for await (const _ of s) {
      // drain
    }
  })()
  await clock.advance(1000)
  await clock.advance(2000)
  await step

  await $.turn.complete({
    turnId: 't1', answer: 'hello', durationMs: 4000, isAborted: false, reason: 'answer', usage,
  })

  expect(await draw($, ['focus'])).toEqual([
    'focus',
    'TPS  ↑ 13/s  ↓ 50/s  ↯ 100/s  ⧖ 1.0s  claude-opus-5-5',
  ])
})

test('adds nothing before the first turn, and ignores subagent turns', async ($, on) => {
  const draw = footer(on)
  on('turn.complete', ($, e) => ({ text: e.answer }))
  await $.turn.complete({
    turnId: 't2', agentId: 'a1', answer: '', durationMs: 1000, isAborted: false, reason: 'answer', usage,
  })
  expect(await draw($)).toEqual([])
})
