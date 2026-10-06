# claude-tps-status

A [Claude Code](https://claude.com/claude-code) mod that shows the current session's token throughput at the right of the prompt footer, among the mode labels (beside labels like `focus`).

```
TPS  ↑ 38/s  ↓ 104/s  ↯ 336/s  ⧖ 2.0s  claude-opus-5-5
```

| Field | Meaning |
|-------|---------|
| `↑ N/s` | Uncached input tokens per second of turn time (prompt-cache reads are not counted) |
| `↓ N/s` | Output tokens per second of turn time |
| `↯ N/s` | Generation speed: output tokens per second while the response was streaming |
| `⧖ Ns` | Latency from sending a turn's first request to the first streamed token; hidden until measured |
| model name | The model that answered the most recent turn |

Every figure is an average over the session's completed turns. Only the main conversation counts: subagent turns and interrupted turns are left out. The line appears after the first turn finishes and starts over with each new session.

## Requirements

- Claude Code with function-hook mods (built and tested on 2.1.291; the mod API is early access and may change between releases)
- Terminal or the desktop app's Code tab: those are the surfaces that draw the footer's mode labels

## Installation

In Claude Code, run:

```
/plugin install tps-status --marketplace teddymaef/claude-tps-status
```

Answer `y` to add the marketplace, then pick a scope (user scope loads it in every session). The mod is active right away; no restart is needed.

From a shell, the equivalent is:

```bash
claude plugin marketplace add teddymaef/claude-tps-status
claude plugin install tps-status@claude-tps-status
```

If you previously used the status-line script from this repo, remove the `statusLine` entry from `~/.claude/settings.json` so the figures are not shown twice.

### From a local clone

Clone the repo, open the folder in Claude Code and run `/install`. It validates the mod, adds the folder as the `claude-tps-status` marketplace, installs `tps-status` at the user scope, and offers to remove the old `statusLine` script entry if it finds one. Running `/install` again after pulling changes refreshes the installed copy. Restart Claude Code if the line does not appear.

### Uninstall

```bash
claude plugin uninstall tps-status@claude-tps-status
```

## How It Works

The mod is a hooks module (`hooks/register.ts`) that Claude Code loads in process:

- `turn.step` wraps each model request of the main conversation and times it: when the request is sent, when the first streamed chunk arrives, and when the stream ends, together with the output tokens the response reports.
- `turn.complete` takes the turn's token usage and wall-clock duration, adds the turn to the session totals and saves them in `$.state` (session state the host keeps, so the averages survive a reload of the mod).
- A `ui.render` hook on the footer's `SessionMode` component appends the formatted line to the mode labels at the right of the footer. If another mode label is showing (for example `focus`), the two are joined by ` & `.

Because it hooks the session's own turns, the figures always belong to the session you're looking at, even with several sessions open in the same project.

## Development

```bash
git clone https://github.com/teddymaef/claude-tps-status.git
cd claude-tps-status

claude plugin validate .   # check the manifest and hooks module
claude plugin test .       # run hooks/register.test.ts
claude --plugin-dir .      # start a session with the mod loaded from this folder
```

Once a session has loaded the mod from this folder, Claude Code writes its API typings to `.claude-plugin/types/` (git-ignored), and from then on `npx -p typescript tsc -p .` type-checks the module and tests (the committed `tsconfig.json` extends those typings, so it does not work on a fresh clone until the mod has loaded once).

## Alternative: status-line script

`tps-status.sh` is the original version: a `statusLine` command that derives the same figures from the session transcript (`~/.claude/projects/<project-slug>/*.jsonl`). It needs macOS and `jq` 1.6 or later (`brew install jq`). To use it instead of the mod, open this folder in Claude Code and run `/install-script`, which points `statusLine` in `~/.claude/settings.json` at the script; restart Claude Code afterwards.

It is less accurate than the mod: it reads whichever transcript in the project changed last, so with two sessions open in one project it can show the other session's numbers, and its timings come from transcript timestamps rather than the stream itself. Its state lives in `/tmp/tps-status-<md5hash>.state`; delete those files to reset its averages.

## License

MIT License — see [LICENSE](LICENSE) file for details.

## Acknowledgements

Inspired by [TomzxCode/tps-viewer](https://github.com/TomzxCode/tps-viewer) — a standalone TPS visualization tool for Claude Code.
