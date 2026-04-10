# claude-tps-status

A statusline script for [Claude Code CLI](https://claude.ai/code) that shows real-time token throughput metrics for the current session.

## What It Shows

```
TPS  ↑ 38/s  ↓ 104/s  ↯ 336/s  ⧖ 2.0s  claude-sonnet-4-6
```

| Field | Meaning |
|-------|---------|
| `↑ N/s` | Input tokens per second |
| `↓ N/s` | Output tokens per second |
| `↯ N/s` | Generation speed (output tokens / streaming span) |
| `⧖ Ns` | Latency to first token; hidden when < 1s |
| model name | Model used in the most recent turn |

## Requirements

- macOS (uses `md5 -q -s` and BSD awk)
- `jq` 1.6 or later (`brew install jq`)

## Installation

```bash
git clone https://github.com/teddymaef/claude-tps-status.git ~/git/claude-tps-status
```

Open the cloned folder in Claude Code and run `/install`. Restart Claude Code when done.

## How It Works

Claude Code writes each conversation turn to a JSONL file under `~/.claude/projects/<project-slug>/`. The script finds the most recent JSONL for the current project, extracts token counts and timestamps with `jq`, deduplicates the duplicate assistant entries Claude records per response, and computes per-turn ITPS/OTPS/latency/generation-speed with `awk`. State persists to `/tmp/tps-status-<hash>.state` so successive runs average only new turns, falling back to stale values when idle.

## Troubleshooting

Run the script manually from your project directory:

```bash
~/git/claude-tps-status/tps-status.sh
```

For verbose output:

```bash
bash -x ~/git/claude-tps-status/tps-status.sh
```

State files live in `/tmp/tps-status-<md5hash>.state` — one per session JSONL. Delete them to reset the displayed averages.