Install the tps-status mod from this folder into Claude Code.

1. Check the folder is the mod: run `claude plugin validate "$PWD"`. If it does not end with `✔ Validation passed`, show the output to the user and stop.

2. Add this folder as a marketplace, at the user scope:
   ```bash
   claude plugin marketplace add "$PWD"
   ```
   If it reports that the marketplace `claude-tps-status` already exists, that is fine: go on to the next step.

3. Install the mod at the user scope:
   ```bash
   claude plugin install tps-status@claude-tps-status
   ```
   If it reports that the plugin is already installed, that is fine too: the installed copy runs straight from this folder, so there is nothing to reinstall.

4. Read `~/.claude/settings.json`. If it has a `statusLine` whose `command` ends in `tps-status.sh` (the older script from this repo), tell the user that it would show the same figures twice and ask whether to remove it. Only on a yes, delete the `statusLine` key, keep every other key, and write the file back.

5. Print a confirmation message:
   ```
   Installed tps-status from <absolute path of this folder>. Run /reload-plugins (or start a new session) to load it; the TPS line appears at the right of the prompt footer once a turn finishes. It runs straight from this folder: pulled changes load the same way, and it offers newer commits from GitHub above the prompt when a session starts.
   ```
