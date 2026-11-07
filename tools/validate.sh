#!/usr/bin/env bash
set -uo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"
failures=0

step() {
    local label="$1"
    shift
    if "$@"; then
        echo "ok: $label"
    else
        echo "FAIL: $label"
        failures=$((failures + 1))
    fi
}

check_each() {
    local checker="$1" pattern="$2" status=0
    while IFS= read -r file; do
        $checker "$file" || { echo "  $file"; status=1; }
    done < <(find . -name "$pattern" -not -path './.git/*' -not -path '*/node_modules/*')
    return "$status"
}

node_check() { node --check "$1"; }
bash_check() { bash -n "$1"; }
json_check() { node -e 'JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))' "$1"; }

step "bash -n on shell scripts" check_each bash_check '*.sh'
step "node --check on .mjs scripts" check_each node_check '*.mjs'
step "JSON files parse" check_each json_check '*.json'
step "marketplace, plugin and SKILL.md fields" node tools/check-manifests.mjs

if command -v claude >/dev/null 2>&1; then
    step "claude plugin validate (marketplace)" claude plugin validate .
    step "claude plugin validate (plugin)" claude plugin validate plugins/swiftui-perf
else
    echo "skip: claude CLI not found (claude plugin validate)"
fi

if [[ "$failures" -gt 0 ]]; then
    echo "$failures check(s) failed"
    exit 1
fi
echo "all checks passed"
