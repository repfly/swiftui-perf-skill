#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/lib/common.sh"

usage() {
    cat >&2 <<'EOF'
usage: build.sh profile|debug [--app <name>] [--device] [--setting KEY=VALUE]... [--log <file>]
  profile: the Release-like configuration, security gates off by compile flag, profileBuildSettings
  debug:   the debug configuration (for _printChanges counts and LLDB only)
  --device builds for targets.deviceUdid instead of targets.simulatorUdid
Run it in the background; it prints the .app path when it ends.
EOF
    exit 2
}

kind="${1:-}"
[[ "$kind" == profile || "$kind" == debug ]] || usage
shift
app="" use_device=0 log="" extra=()
while [[ $# -gt 0 ]]; do
    case "$1" in
        --app) app="$2"; shift 2 ;;
        --device) use_device=1; shift ;;
        --setting) extra+=("$2"); shift 2 ;;
        --log) log="$2"; shift 2 ;;
        *) usage ;;
    esac
done

root="$(project_root)"
index="$(app_index "$app")"
scheme="$(cfg_required "apps.$index.scheme")"
work="$root/$(cfg_required workDir)"
derived="$(cfg build.derivedDataPath)"
derived="${derived:-$work/DerivedData}"
log="${log:-$work/build-$kind.log}"

if [[ "$kind" == profile ]]; then
    configuration="$(cfg_required build.profileConfiguration)"
else
    configuration="$(cfg_required build.debugConfiguration)"
fi
if [[ "$use_device" == 1 ]]; then
    udid="$(cfg_required targets.deviceUdid)"
else
    udid="$(cfg_required targets.simulatorUdid)"
fi

container=(-workspace "$root/$(cfg project.workspace)")
if [[ -z "$(cfg project.workspace)" ]]; then
    container=(-project "$root/$(cfg_required project.project)")
fi

settings=()
if [[ "$kind" == profile ]]; then
    flags="$(node -e 'console.log(JSON.parse(process.argv[1]).map((g) => g.flag).filter(Boolean).join(" "))' "$(cfg securityGates)")"
    if [[ -n "$flags" ]]; then
        settings+=("SWIFT_ACTIVE_COMPILATION_CONDITIONS=\$(inherited) $flags")
    fi
    while IFS= read -r setting; do
        [[ -n "$setting" ]] && settings+=("$setting")
    done < <(node -e 'for (const s of JSON.parse(process.argv[1])) console.log(s)' "$(cfg build.profileBuildSettings)")
fi
settings+=("${extra[@]+"${extra[@]}"}")

developer_dir="$(cfg targets.developerDir)"
if [[ -n "$developer_dir" ]]; then
    export DEVELOPER_DIR="$developer_dir"
fi

mkdir -p "$work"
echo "building $scheme '$configuration' for $udid; log: $log" >&2
if ! xcodebuild "${container[@]}" -scheme "$scheme" -configuration "$configuration" \
    -destination "id=$udid" -derivedDataPath "$derived" \
    "${settings[@]+"${settings[@]}"}" build >"$log" 2>&1; then
    tail -20 "$log" >&2
    die "build failed; see $log"
fi

product="$(xcodebuild "${container[@]}" -scheme "$scheme" -configuration "$configuration" \
    -destination "id=$udid" -derivedDataPath "$derived" -showBuildSettings 2>/dev/null \
    | awk -F' = ' '/ TARGET_BUILD_DIR = / {dir=$2} / FULL_PRODUCT_NAME = / {name=$2} END {print dir "/" name}')"
echo "$product"
