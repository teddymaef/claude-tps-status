#!/usr/bin/env bash

# Derive project folder from CWD (matches Claude Code's naming convention)
PROJECT_SLUG=$(echo "$PWD" | tr '/' '-')
PROJECT_DIR="$HOME/.claude/projects/$PROJECT_SLUG"

[ -d "$PROJECT_DIR" ] || exit 0
JSONL=$(ls -t "$PROJECT_DIR"/*.jsonl 2>/dev/null | head -1)
[ -n "$JSONL" ] || exit 0

# Per-session state: "<last_turn_epoch_s> <last_itps> <last_otps> <last_latency> <last_gen_speed> <last_model>"
STATE_KEY=$(md5 -q -s "$JSONL")
STATE_FILE="/tmp/tps-status-${STATE_KEY}.state"

LAST_TS=0; LAST_ITPS=0; LAST_OTPS=0; LAST_LAT=0; LAST_GEN=0; LAST_MODEL=""
if [ -f "$STATE_FILE" ]; then
    read -r LAST_TS LAST_ITPS LAST_OTPS LAST_LAT LAST_GEN LAST_MODEL < "$STATE_FILE" 2>/dev/null || true
fi

# jq: extract TSV rows (type, epoch_s, input_tokens, output_tokens, cache_read_tokens, model)
# awk: deduplicate identical assistant messages per turn (Claude Code records each
#      response 2-3x with different UUIDs), compute ITPS/OTPS/latency/gen_speed per turn
RESULT=$(jq -r '
  select(.type == "user" or .type == "assistant") |
  [
    .type,
    (.timestamp | split(".")[0] | strptime("%Y-%m-%dT%H:%M:%S") | mktime | floor | tostring),
    ((.message.usage.input_tokens            // 0) | tostring),
    ((.message.usage.output_tokens           // 0) | tostring),
    ((.message.usage.cache_read_input_tokens // 0) | tostring),
    (.message.model // "")
  ] | @tsv
' "$JSONL" 2>/dev/null | awk -v last_ts="${LAST_TS}" '
BEGIN {
    FS="\t"; n=0; si=0; so=0; sl=0; sg=0; ng=0
    u_ts=0; a_first=-1; a_last=0; a_in=0; a_out=0; new_ts=0; seen=""; last_model=""
}
function calc_turn(    dur,gen_span) {
    if (u_ts>0 && a_first>0 && a_last>u_ts) {
        dur=a_last-u_ts
        if (dur>0 && u_ts>last_ts) {
            si+=a_in/dur
            so+=a_out/dur
            sl+=(a_first-u_ts)
            gen_span=a_last-a_first
            if (gen_span>0) { sg+=a_out/gen_span; ng++ }
            n++; new_ts=u_ts
        }
    }
}
$1=="user"      { calc_turn(); u_ts=$2+0; a_in=0; a_out=0; a_first=-1; a_last=$2+0; seen="" }
$1=="assistant" {
    key=$4 ":" $5
    if (index(seen, "|" key "|") == 0) { a_in+=$3+0; a_out+=$4+0; seen=seen "|" key "|" }
    ts=$2+0
    if (a_first<0) a_first=ts
    if (ts>a_last) a_last=ts
    if ($6 != "") last_model=$6
}
END {
    calc_turn()
    if (n>0) printf "%d\t%d\t%d\t%.1f\t%d\t%s\n",
        new_ts, int(si/n+0.5), int(so/n+0.5), sl/n, (ng>0 ? int(sg/ng+0.5) : 0), last_model
}
' 2>/dev/null)

format_output() {
    local itps=$1 otps=$2 lat=${3:-0} gen=${4:-0} model=${5:-""}
    local out="TPS  ↑ ${itps}/s  ↓ ${otps}/s"
    local gs="${gen:-0}"; [ "$gs" -eq 0 ] 2>/dev/null && gs="$otps"
    out="${out}  ↯ ${gs}/s"
    [ "${lat%.*}" -gt 0 ] 2>/dev/null && out="${out}  ⧖ ${lat}s"
    [ -n "$model" ] && out="${out}  ${model}"
    printf '%s' "$out"
}

if [ -n "$RESULT" ]; then
    IFS=$'\t' read -r NEW_TS NEW_ITPS NEW_OTPS NEW_LAT NEW_GEN NEW_MODEL <<< "$RESULT"
    printf '%s %s %s %s %s %s\n' "$NEW_TS" "$NEW_ITPS" "$NEW_OTPS" "$NEW_LAT" "$NEW_GEN" "$NEW_MODEL" > "$STATE_FILE"
    format_output "$NEW_ITPS" "$NEW_OTPS" "$NEW_LAT" "$NEW_GEN" "$NEW_MODEL"
elif [ "${LAST_ITPS:-0}" -gt 0 ] || [ "${LAST_OTPS:-0}" -gt 0 ]; then
    format_output "$LAST_ITPS" "$LAST_OTPS" "$LAST_LAT" "$LAST_GEN" "$LAST_MODEL"
fi
