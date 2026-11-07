#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/lib/common.sh"

readonly DEFAULT_INSTRUMENTS=("Time Profiler" "Hangs" "os_signpost")
readonly DEFAULT_LIMIT=60s
readonly START_TIMEOUT_TICKS=120
readonly STOP_TIMEOUT_SECONDS=60

usage() {
    cat >&2 <<'EOF'
usage:
  record.sh launch --out <file.trace> [--seconds 15] [--app <name>] [--device <udid>] [--instrument <name>]... [-- <launch args>]
      safe default for the simulator: stop stray recordings, record all processes, simctl launch, wait, stop
  record.sh start  --out <file.trace> (--all-processes | --attach <name|pid> | --bundle <id>) [options] [-- <launch args>]
  record.sh stop   --out <file.trace>
  record.sh run    <same options as start>    (foreground, ends at --time-limit)
options: --device <udid> (default targets.simulatorUdid), --instrument <name>..., --template <name>,
         --time-limit 60s, --run-name <name>
defaults: instruments 'Time Profiler', Hangs, os_signpost
--bundle uses xctrace --launch; it can hang at the splash screen on the simulator. Prefer launch mode.
EOF
    exit 2
}

mode="${1:-}"
[[ -n "$mode" ]] || usage
shift

device="" out="" bundle="" attach="" all=0 template="" limit="$DEFAULT_LIMIT" run_name="" seconds=15 app=""
instruments=()
launch_args=()
while [[ $# -gt 0 ]]; do
    case "$1" in
        --device) device="$2"; shift 2 ;;
        --out) out="$2"; shift 2 ;;
        --bundle) bundle="$2"; shift 2 ;;
        --attach) attach="$2"; shift 2 ;;
        --all-processes) all=1; shift ;;
        --instrument) instruments+=("$2"); shift 2 ;;
        --template) template="$2"; shift 2 ;;
        --time-limit) limit="$2"; shift 2 ;;
        --run-name) run_name="$2"; shift 2 ;;
        --seconds) seconds="$2"; shift 2 ;;
        --app) app="$2"; shift 2 ;;
        --) shift; launch_args=("$@"); break ;;
        *) usage ;;
    esac
done
[[ -n "$out" ]] || usage
device="${device:-$(cfg targets.simulatorUdid)}"
state_dir="${out%.trace}.rec"

build_command() {
    [[ -n "$device" ]] || die "no device; pass --device or set targets.simulatorUdid"
    command=(xcrun xctrace record --no-prompt --device "$device" --time-limit "$limit")
    [[ -n "$template" ]] && command+=(--template "$template")
    if [[ ${#instruments[@]} -eq 0 && -z "$template" ]]; then
        instruments=("${DEFAULT_INSTRUMENTS[@]}")
    fi
    for instrument in "${instruments[@]+"${instruments[@]}"}"; do
        command+=(--instrument "$instrument")
    done
    [[ -e "$out" ]] && command+=(--append-run)
    command+=(--output "$out")
    [[ -n "$run_name" ]] && command+=(--run-name "$run_name")
    if [[ -n "$bundle" ]]; then
        command+=(--launch -- "$bundle" "${launch_args[@]+"${launch_args[@]}"}")
    elif [[ -n "$attach" ]]; then
        command+=(--attach "$attach")
    elif [[ "$all" == 1 ]]; then
        command+=(--all-processes)
    else
        usage
    fi
}

ensure_free() {
    if pgrep -f "$XCTRACE_PATTERN" >/dev/null; then
        die "another xctrace recording is running; stop it first (pkill -INT -f '$XCTRACE_PATTERN')"
    fi
}

wait_exit() {
    local pid="$1" waited=0
    while kill -0 "$pid" 2>/dev/null; do
        [[ "$waited" -ge "$STOP_TIMEOUT_SECONDS" ]] && die "xctrace did not exit after ${STOP_TIMEOUT_SECONDS} s; pid $pid"
        sleep 1
        waited=$((waited + 1))
    done
}

report() {
    if [[ -d "$out" ]]; then
        echo "trace: $out"
        [[ -f "$state_dir/app.pid" ]] && echo "app pid: $(cat "$state_dir/app.pid") (use summarize_trace.mjs --pid)"
        return 0
    fi
    tail -20 "$state_dir/xctrace.log" >&2 || true
    die "no trace written; see $state_dir/xctrace.log"
}

start() {
    ensure_free
    build_command
    mkdir -p "$(dirname "$out")" "$state_dir"
    local note="perf.rec.$$.$RANDOM"
    command+=(--notify-tracing-started "$note")
    notifyutil -1 "$note" >/dev/null &
    local waiter=$!
    set -m
    nohup "${command[@]}" >"$state_dir/xctrace.log" 2>&1 </dev/null &
    local pid=$!
    set +m
    echo "$pid" >"$state_dir/pid"
    local ticks=0
    while kill -0 "$waiter" 2>/dev/null; do
        if ! kill -0 "$pid" 2>/dev/null; then
            kill "$waiter" 2>/dev/null || true
            tail -20 "$state_dir/xctrace.log" >&2 || true
            die "xctrace exited before tracing started"
        fi
        if [[ "$ticks" -ge "$START_TIMEOUT_TICKS" ]]; then
            kill "$waiter" 2>/dev/null || true
            die "tracing did not start in $((START_TIMEOUT_TICKS / 2)) s; pid $pid"
        fi
        sleep 0.5
        ticks=$((ticks + 1))
    done
    echo "tracing started; pid $pid; drive the app, then: record.sh stop --out $out"
}

stop() {
    [[ -f "$state_dir/pid" ]] || die "no recording state at $state_dir"
    local pid
    pid="$(cat "$state_dir/pid")"
    if kill -0 "$pid" 2>/dev/null; then
        kill -INT -- "-$pid" 2>/dev/null || kill -INT "$pid"
        wait_exit "$pid"
    fi
    rm -f "$state_dir/pid"
    report
}

run() {
    ensure_free
    build_command
    mkdir -p "$(dirname "$out")" "$state_dir"
    "${command[@]}" >"$state_dir/xctrace.log" 2>&1 </dev/null || true
    report
}

launch() {
    local index bundle_id output app_pid
    index="$(app_index "$app")"
    bundle_id="$(cfg_required "apps.$index.bundleId")"
    stop_stray_recordings
    all=1
    bundle=""
    start
    xcrun simctl terminate "$device" "$bundle_id" 2>/dev/null || true
    output="$(xcrun simctl launch "$device" "$bundle_id" "${LAUNCH_FLAG_ARGS[@]}" "${launch_args[@]+"${launch_args[@]}"}")"
    app_pid="${output##* }"
    echo "$app_pid" >"$state_dir/app.pid"
    echo "launched $bundle_id pid $app_pid; recording ${seconds} s"
    sleep "$seconds"
    stop
}

case "$mode" in
    launch) launch ;;
    start) start ;;
    stop) stop ;;
    run) run ;;
    *) usage ;;
esac
