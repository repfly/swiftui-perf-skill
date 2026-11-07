#!/usr/bin/env bash

SCRIPTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly SCRIPTS_DIR
readonly LAUNCH_FLAG_ARGS=(-PerfMarkers YES)
readonly XCTRACE_PATTERN='xctrace record'

die() {
    echo "$*" >&2
    exit 1
}

cfg() {
    node "$SCRIPTS_DIR/config.mjs" get "$1" 2>/dev/null || true
}

cfg_required() {
    local value
    value="$(cfg "$1")"
    [[ -n "$value" ]] || die "config value $1 is not set; run setup.mjs check"
    printf '%s\n' "$value"
}

project_root() {
    node "$SCRIPTS_DIR/config.mjs" root
}

app_index() {
    local name="${1:-}" count i
    [[ -z "$name" ]] && { echo 0; return; }
    count="$(node -e 'console.log(JSON.parse(process.argv[1]).length)' "$(cfg apps)")"
    for ((i = 0; i < count; i++)); do
        [[ "$(cfg "apps.$i.name")" == "$name" ]] && { echo "$i"; return; }
    done
    die "no app named $name in the config"
}

stop_stray_recordings() {
    if pgrep -f "$XCTRACE_PATTERN" >/dev/null; then
        echo "stopping stray xctrace recordings" >&2
        pkill -INT -f "$XCTRACE_PATTERN" || true
        sleep 2
    fi
}
