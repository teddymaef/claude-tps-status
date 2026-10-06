import { test, expect, mock } from 'claude-code/testing'
import type { On, RenderElement } from 'claude-code'
import { installRecordOf, installedSha, parseCommit, repoOf, shortDate, sourceFor } from './update'

test('reads owner/repo from a GitHub URL', () => {
  expect(repoOf('https://github.com/teddymaef/claude-tps-status')).toBe('teddymaef/claude-tps-status')
  expect(repoOf('git@github.com:teddymaef/claude-tps-status.git\n')).toBe('teddymaef/claude-tps-status')
  expect(repoOf('https://gitlab.com/a/b')).toBeUndefined()
  expect(repoOf(undefined)).toBeUndefined()
})

test('finds where an installed copy updates from', () => {
  const list = [
    { name: 'local', source: 'directory', path: '/Users/x/git/claude-tps-status', installLocation: '/Users/x/git/claude-tps-status' },
    { name: 'gh', source: 'github', installLocation: '/Users/x/.claude/plugins/marketplaces/gh' },
  ]
  expect(sourceFor(list, '/Users/x/git/claude-tps-status/')).toEqual({ kind: 'folder', marketplace: 'local', dir: '/Users/x/git/claude-tps-status' })
  expect(sourceFor(list, '/Users/x/.claude/plugins/cache/gh/tps-status/0.5.0')).toEqual({ kind: 'github', marketplace: 'gh', dir: '/Users/x/.claude/plugins/marketplaces/gh' })
  expect(sourceFor(list, '/Users/x/.claude/dev-mods/abc/tps-status')).toBeUndefined()
})

test('reads the commit a GitHub install was installed at', () => {
  const root = '/Users/x/.claude/plugins/cache/gh/tps-status/0.5.0'
  expect(installRecordOf(root)).toBe('/Users/x/.claude/plugins/installed_plugins.json')
  expect(installRecordOf('/Users/x/git/claude-tps-status')).toBeUndefined()

  const json = JSON.stringify({
    version: 2,
    plugins: {
      'tps-status@gh': [
        { scope: 'project', installPath: '/Users/x/.claude/plugins/cache/gh/tps-status/0.4.0', gitCommitSha: 'old' },
        { scope: 'user', installPath: root, gitCommitSha: 'abc1234def' },
      ],
    },
  })
  expect(installedSha(json, 'tps-status@gh', `${root}/`)).toBe('abc1234def')
  expect(installedSha(json, 'tps-status@other', root)).toBeUndefined()
  expect(installedSha('{}', 'tps-status@gh', root)).toBeUndefined()
})

test('reads a commit from the GitHub API', () => {
  const json = JSON.stringify({ sha: 'abc1234def', commit: { message: 'Fix it\n\nbody', committer: { date: '2026-10-06T10:40:12Z' } } })
  expect(parseCommit(json)).toEqual({ sha: 'abc1234def', date: '2026-10-06T10:40:12Z', subject: 'Fix it' })
  expect(parseCommit('{}')).toBeUndefined()
  expect(shortDate('2026-10-06T10:40:12Z')).toBe('2026-10-06 10:40 UTC')
})

// The mod's own folder: a local clone added as a marketplace, as /install does.
const ROOT = new URL('..', (import.meta as ImportMeta & { url: string }).url).pathname.replace(/\/$/, '')
const COMMIT = { sha: 'abc1234def', commit: { message: 'Fix it', committer: { date: '2026-10-06T10:40:12Z' } } }

// Stands in for gh, git and the claude CLI; records each command it ran.
function host(on: On, ran: string[]) {
  on('process.run', ($, e) => {
    const cmd = e.argv.join(' ')
    ran.push(cmd)
    const out = (stdout: string, exitCode = 0) => ({ value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })
    if (cmd === 'claude plugin marketplace list --json') return out(JSON.stringify([{ name: 'claude-tps-status', source: 'directory', path: ROOT }]))
    if (cmd === 'git remote get-url origin') return out('git@github.com:teddymaef/claude-tps-status.git')
    if (cmd === 'git rev-parse --abbrev-ref HEAD') return out('main')
    if (cmd === 'gh api repos/teddymaef/claude-tps-status/commits/main') return out(JSON.stringify(COMMIT))
    if (cmd.startsWith('git merge-base')) return out('', 1)
    if (cmd === 'git pull --ff-only') return out('Fast-forward')
    return out('', 1)
  })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('ui.status', () => ({ value: undefined }))
  // The engine's own band: nothing.
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Box } = $.ui.resolve(e)
    return h(Box, null) as RenderElement
  })
}

const band = { plugin: 'tps-status', surface: 'terminal', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 100 } } as const

async function startSession($: { session: { start: (e: { cwd: string; surface: 'terminal'; isInteractive: boolean }) => Promise<unknown> } }, clock: { settle: () => Promise<void> }) {
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  for (let i = 0; i < 20; i++) await clock.settle()
}

test('offers a newer commit, pulls it into the clone and reloads on Update', async ($, on) => {
  const ran: string[] = []
  const commands: string[] = []
  host(on, ran)
  mock.store(on)
  const clock = mock.clock(on, { now: Date.parse('2026-10-06T12:00:00Z') })
  on('command.run', ($, e) => {
    commands.push(e.command)
    return { text: '' }
  })

  await startSession($, clock)
  const ui = await $.ui.mount(band as never)
  expect(await ui.find({ type: 'Text', text: /update available: abc1234 · 2026-10-06 10:40 UTC · Fix it/ })).toBeDefined()

  await ui.press({ key: 'update' })
  expect(ran).toContain('git pull --ff-only')
  expect(commands).toEqual(['reload-plugins'])
  expect(await ui.find({ type: 'Text', text: /updated to abc1234 and reloaded/ })).toBeDefined()
})

test('leaves /reload-plugins in an empty prompt when it cannot run it', async ($, on) => {
  const ran: string[] = []
  const filled: string[] = []
  host(on, ran)
  mock.store(on)
  const clock = mock.clock(on, { now: Date.parse('2026-10-06T12:00:00Z') })
  on('command.run', () => {
    throw new Error('not here')
  })
  on('prompt.read', () => ({ value: { text: '', cursor: 0 } }) as never)
  on('prompt.fill', ($, e) => {
    filled.push(e.text)
    return { isFilled: true }
  })

  await startSession($, clock)
  const ui = await $.ui.mount(band as never)
  await ui.press({ key: 'update' })
  expect(filled).toEqual(['/reload-plugins'])
  expect(await ui.find({ type: 'Text', text: /Press Enter to run \/reload-plugins/ })).toBeDefined()
})

test('Ignore this version stops offering that commit', async ($, on) => {
  const ran: string[] = []
  host(on, ran)
  mock.store(on)
  const clock = mock.clock(on, { now: Date.parse('2026-10-06T12:00:00Z') })

  await startSession($, clock)
  const ui = await $.ui.mount(band as never)
  await ui.press({ key: 'ignore' })
  expect(await ui.find({ text: /update available/ })).toBeUndefined()
  expect(ran).not.toContain('git pull --ff-only')

  await clock.advance(7 * 60 * 60 * 1000)
  await startSession($, clock)
  expect(await ui.find({ text: /update available/ })).toBeUndefined()
})
