#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/lib/common.sh"

readonly WIDE_MODEL_LIMIT=8
readonly EAGER_STACK_LOOKAHEAD=4
readonly MATCH_WIDTH=200

top=8
paths=()
while [[ $# -gt 0 ]]; do
    case "$1" in
        --top) top="$2"; shift 2 ;;
        -h|--help) echo "usage: smell_scan.sh [--top N] [path ...]   (default: smellScan.paths from the config)" >&2; exit 2 ;;
        *) paths+=("$1"); shift ;;
    esac
done

cd "$(project_root)"
if [[ ${#paths[@]} -eq 0 ]]; then
    while IFS= read -r path; do
        [[ -n "$path" ]] && paths+=("$path")
    done < <(node -e 'for (const p of JSON.parse(process.argv[1] || "[]")) console.log(p)' "$(cfg smellScan.paths)")
fi
[[ ${#paths[@]} -gt 0 ]] || die "no paths; pass paths or set smellScan.paths"

excludes=()
while IFS= read -r pattern; do
    [[ -n "$pattern" ]] && excludes+=(-not -path "$pattern")
done < <(node -e 'for (const p of JSON.parse(process.argv[1] || "[]")) console.log(p)' "$(cfg smellScan.exclude)")

files_list="$(mktemp)"
trap 'rm -f "$files_list"' EXIT
find "${paths[@]}" -name '*.swift' "${excludes[@]+"${excludes[@]}"}" 2>/dev/null >"$files_list"

each_file() {
    tr '\n' '\0' <"$files_list" | xargs -0 "$@" 2>/dev/null || true
}

smells=(
    "singleton-observed|(ObservedObject|StateObject)[^=]*=[[:space:]]*[A-Za-z_]+\.(shared|default)"
    "owned-observedobject|@ObservedObject[[:space:]]+(private[[:space:]]+)?var[[:space:]]+[A-Za-z_]+([[:space:]]*:[[:space:]]*[A-Za-z_]+)?[[:space:]]*=[[:space:]]*[A-Za-z_]+\("
    "manual-objectWillChange|objectWillChange\.send\(\)"
    "anyview|AnyView\(|->[[:space:]]*AnyView|\[AnyView\]"
    "conditional-modifier|\.if\(|\.applyIf\(|\.when\("
    "unstable-id|ForEach\([^)]*\.indices|id:[[:space:]]*\\\\\.self|var id:.*UUID\(\)"
    "forced-id|\.id\((UUID\(\)|refresh|reload)"
    "geometry-reader|GeometryReader"
    "async-image|AsyncImage\(|UIImage\(data:"
    "offscreen-effect|\.shadow\(|\.blur\(|\.mask\("
    "formatter-alloc|(Date|Number)Formatter\(\)"
    "implicit-animation|\.animation\(\.[a-zA-Z]+(\([^)]*\))?\)"
    "decode-on-main|JSONDecoder\(\)\.decode"
    "main-sync|DispatchQueue\.main\.sync"
    "environment-object|\.environmentObject\("
    "timer|Timer\.publish\(|scheduledTimer\(|Timer\.TimerPublisher"
)

echo "# Smell scan"
echo
echo "Scanned $(wc -l <"$files_list" | tr -d ' ') Swift files in: ${paths[*]}"
echo
echo "| Smell | Hits | Files | Top files (hits) |"
echo "|---|---|---|---|"

details=""
for entry in "${smells[@]}"; do
    name="${entry%%|*}"
    regex="${entry#*|}"
    matches="$(each_file grep -nE "$regex")"
    if [[ "$name" == formatter-alloc ]]; then
        matches="$(grep -vE 'static[[:space:]]+(let|var)' <<<"$matches" || true)"
    fi
    if [[ -z "$matches" ]]; then
        echo "| $name | 0 | 0 | |"
        continue
    fi
    hits="$(wc -l <<<"$matches" | tr -d ' ')"
    per_file="$(cut -d: -f1 <<<"$matches" | sort | uniq -c | sort -rn)"
    file_count="$(wc -l <<<"$per_file" | tr -d ' ')"
    top_files="$(head -n 3 <<<"$per_file" | awk '{printf "%s%s (%s)", (NR > 1 ? ", " : ""), $2, $1}')"
    echo "| $name | $hits | $file_count | $top_files |"
    details+=$'\n'"## $name"$'\n\n'"$(head -n "$top" <<<"$matches" | cut -c1-"$MATCH_WIDTH" | sed 's/^/- /')"$'\n'
done

section() {
    echo
    echo "## $1"
    echo
    if [[ -n "$2" ]]; then
        head -n "$top" <<<"$2" | sed 's/^/- /'
    else
        echo "- none"
    fi
}

wide="$(each_file grep -c '@Published' | awk -F: -v limit="$WIDE_MODEL_LIMIT" '$2 > limit {print $2 " " $1}' | sort -rn | awk '{print $2 " (" $1 " @Published)"}')"
section "wide-view-model (more than $WIDE_MODEL_LIMIT @Published per file)" "$wide"

eager="$(each_file grep -nE -A"$EAGER_STACK_LOOKAHEAD" 'ScrollView[[:space:]]*(\(|\{)' \
    | awk '/ScrollView/ {candidate = $0; stack = 0; next} /[^y]VStack/ {stack = 1} /ForEach/ && stack && candidate != "" {print candidate; candidate = ""}' \
    | sed -E 's/^([^:]+):([0-9]+):.*/\1:\2/')"
section "eager-stack candidates (ScrollView, then VStack and ForEach within $EAGER_STACK_LOOKAHEAD lines)" "$eager"

child_models="$(each_file grep -nE '@StateObject[[:space:]]+(private[[:space:]]+)?var[[:space:]]+[A-Za-z_]+[[:space:]]*(:[[:space:]]*[A-Za-z_]+ViewModel|=[[:space:]]*[A-Za-z_]+ViewModel\()' \
    | awk -F: '{
        file = $1; n = split(file, parts, "/"); base = parts[n]; sub(/(View|Screen)?\.swift$/, "", base)
        match($0, /[A-Za-z_]+ViewModel/); model = substr($0, RSTART, RLENGTH); sub(/ViewModel$/, "", model)
        if (base != "" && model != base) print file ":" $2 " owns " model "ViewModel"
    }')"
section "parent-owns-child-view-model (@StateObject of another screen's view model; every child publish re-runs this view)" "$child_models"

timer_published="$(each_file grep -lE 'Timer\.publish\(|scheduledTimer\(|Timer\.TimerPublisher' | while IFS= read -r file; do
    grep -q '@Published' "$file" && echo "$file"
done || true)"
section "timer-into-published (a timer in a file with @Published; a 1 s tick re-runs every observer)" "$timer_published"

echo
echo "# Matches (first $top per smell)"
echo "$details"
