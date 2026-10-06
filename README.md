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
- Optional: the [GitHub CLI](https://cli.github.com) (`gh`), signed in, for update checks

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

Clone the repo, open the folder in Claude Code and run `/install`. It validates the mod, adds the folder as the `claude-tps-status` marketplace, installs `tps-status` at the user scope, and offers to remove the old `statusLine` script entry if it finds one. The installed copy runs straight from your clone, so changes you pull load with `/reload-plugins` or in the next session; there is nothing to reinstall. The line appears once a turn finishes.

### Updates

When a session starts, an installed copy asks GitHub through `gh` for the newest commit on the branch it follows (your clone's current branch, or the marketplace's). If the installed copy doesn't have that commit, a band above the prompt shows it — short SHA, commit date and subject — with three buttons:

- **Update** installs it.
  - *Installed from a local clone* (`/install`): runs `git pull --ff-only` in the clone, then runs `/reload-plugins` itself so the new code loads with nothing for you to do. If it can't run the command, it puts `/reload-plugins` in your prompt (when the prompt is empty) for you to press Enter, or asks you to run it. Restart Claude Code if anything still looks stale.
  - *Installed from GitHub* (`/plugin install … --marketplace teddymaef/claude-tps-status`): runs `claude plugin marketplace update claude-tps-status` and `claude plugin update tps-status@claude-tps-status`. Restart Claude Code to use the new version.
- **Ignore this version** remembers that commit (SHA and date) and doesn't offer it again. A later commit is offered as usual.
- **Later** hides the band for now; the update is offered again next session.

If an update fails (for example the pull can't fast-forward because of local changes), the band says so and shows the command to run by hand.

The check itself never interrupts: if `gh` is missing or signed out, or any command fails, it gives up silently. Once it finds you up to date, it waits six hours before checking again. Copies loaded with `--plugin-dir` never check.

### Uninstall

```bash
claude plugin uninstall tps-status@claude-tps-status
```

## How It Works

The mod is a hooks module (`hooks/register.tsx`) that Claude Code loads in process:

- `turn.step` wraps each model request of the main conversation and times it: when the request is sent, when the first streamed chunk arrives, and when the stream ends, together with the output tokens the response reports.
- `turn.complete` takes the turn's token usage and wall-clock duration, adds the turn to the session totals and saves them in `$.state` (session state the host keeps, so the averages survive a reload of the mod).
- A `ui.render` hook on the footer's `SessionMode` component appends the formatted line to the mode labels at the right of the footer. If another mode label is showing (for example `focus`), the two are joined by ` & `.

Because it hooks the session's own turns, the figures always belong to the session you're looking at, even with several sessions open in the same project.

A `session.start` hook runs the update check described under [Updates](#updates) in the background, and a `ui.render` hook on `AbovePrompt` draws the update band; the pure helpers live in `hooks/update.ts`.

## Development

```bash
git clone https://github.com/teddymaef/claude-tps-status.git
cd claude-tps-status

claude plugin validate .   # check the manifest and hooks module
claude plugin test .       # run the tests in hooks/*.test.ts
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
