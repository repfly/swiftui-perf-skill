#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/lib/common.sh"

readonly OUT_FILE=perf_printchanges.txt
readonly ERR_FILE=perf_printchanges_err.txt
readonly BODY_TAG=BODY
readonly MARK_TAG=MARK

usage() {
    cat >&2 <<'EOF'
usage: printchanges.sh --out <dir> --view <ViewType>... [--mark <File.swift:line:label>]... [--seconds 45] [--app <name>] [--module <name>]
Counts body runs and their reasons with Self._printChanges() through LLDB auto-continue breakpoints.
Needs a debug build installed on targets.simulatorUdid, and printChanges.initFile + initLine in the config
(a line that runs once at app start; stdout is redirected there into the app data container tmp/).
Each hit adds about 100 ms: the counts are valid, the times are not.
EOF
    exit 2
}

out="" seconds=45 app="" module="" views=() marks=()
while [[ $# -gt 0 ]]; do
    case "$1" in
        --out) out="$2"; shift 2 ;;
        --view) views+=("$2"); shift 2 ;;
        --mark) marks+=("$2"); shift 2 ;;
        --seconds) seconds="$2"; shift 2 ;;
        --app) app="$2"; shift 2 ;;
        --module) module="$2"; shift 2 ;;
        *) usage ;;
    esac
done
[[ -n "$out" && ${#views[@]} -gt 0 ]] || usage

index="$(app_index "$app")"
udid="$(cfg_required targets.simulatorUdid)"
bundle_id="$(cfg_required "apps.$index.bundleId")"
module="${module:-$(cfg_required "apps.$index.processName")}"
init_file="$(basename "$(cfg_required printChanges.initFile)")"
init_line="$(cfg_required printChanges.initLine)"

mkdir -p "$out"
xcrun simctl terminate "$udid" "$bundle_id" 2>/dev/null || true
container="$(xcrun simctl get_app_container "$udid" "$bundle_id" data)"
target_out="$container/tmp/$OUT_FILE"
target_err="$container/tmp/$ERR_FILE"
rm -f "$target_out" "$target_err"

breakpoints="$out/printchanges.lldb"
{
    echo "settings set target.process.stop-on-exec false"
    echo "breakpoint set -f $init_file -l $init_line -o true -G true -N perfredirect"
    echo "breakpoint command add perfredirect -o \"expression -l swift -- import Darwin; freopen(\\\"$target_out\\\", \\\"w\\\", stdout); setvbuf(stdout, nil, _IONBF, 0)\""
    for view in "${views[@]}"; do
        echo "breakpoint set -r \"^$module\\.$view\\.body\\.getter\" -G true -N body$view"
        echo "breakpoint command add body$view -o \"expression -l swift -- print(\\\"$BODY_TAG $view\\\", Date().timeIntervalSince1970); Self._printChanges()\""
    done
    for mark in "${marks[@]+"${marks[@]}"}"; do
        IFS=: read -r file line label <<<"$mark"
        echo "breakpoint set -f $file -l $line -G true -N mark$label"
        echo "breakpoint command add mark$label -o \"expression -l swift -- print(\\\"$MARK_TAG $label\\\", Date().timeIntervalSince1970)\""
    done
    echo "breakpoint list"
} >"$breakpoints"

launch="$(xcrun simctl launch -w --stdout="$target_out" --stderr="$target_err" "$udid" "$bundle_id")"
pid="${launch##* }"
echo "launched pid $pid; counting for $seconds s"
( sleep "$seconds"; xcrun simctl terminate "$udid" "$bundle_id" ) &
timer=$!
xcrun lldb --batch -o "process attach -p $pid" -s "$breakpoints" -o "process continue" >"$out/lldb.txt" 2>&1 || true
kill "$timer" 2>/dev/null || true
wait 2>/dev/null || true

cp "$target_out" "$out/stdout.txt" 2>/dev/null || die "no output; check $out/lldb.txt (initFile/initLine must be hit)"
cp "$target_err" "$out/stderr.txt" 2>/dev/null || true
rm -f "$target_out" "$target_err"
grep -E "^($BODY_TAG|$MARK_TAG) " "$out/stdout.txt" | awk '{print $1, $2}' | sort | uniq -c
echo "reasons: grep -A3 '^$BODY_TAG <View>' $out/stdout.txt"
