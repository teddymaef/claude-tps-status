Install the tps-status statusline script into Claude Code.

1. Check that `jq` is installed by running `which jq`. If it is not found, tell the user to run `brew install jq` and stop — do not proceed further.

2. Make the script executable:
   ```bash
   chmod +x "$PWD/tps-status.sh"
   ```

3. Read `~/.claude/settings.json`. If the file does not exist, treat its contents as `{}`. Parse the JSON and set the `statusLine` key to:
   ```json
   {
     "type": "command",
     "command": "<absolute-path-to-tps-status.sh>"
   }
   ```
   where `<absolute-path-to-tps-status.sh>` is `$PWD/tps-status.sh` with `$PWD` expanded to the real current directory path. Preserve all other existing top-level keys. Write the result back to `~/.claude/settings.json`.

4. Print a confirmation message:
   ```
   Installed. The statusline is wired to <absolute-path>. Restart Claude Code to see TPS metrics.
   ```