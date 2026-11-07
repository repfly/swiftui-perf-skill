import path from "node:path";
import { fileURLToPath } from "node:url";

export const SKILL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const PATCH_DIR = path.join(SKILL_DIR, "references", "marker-patch");

export const CONFIG_FILE = ".swiftui-perf.json";
export const CONFIG_ENV = "SWIFTUI_PERF_CONFIG";
export const DEFAULT_WORK_DIR = ".swiftui-perf";
export const MARKER_STATE_FILE = "markers-state.json";
export const DEFAULT_MEMORY_FILE = ".swiftui-perf-memory.json";

export const MemoryArea = Object.freeze({
  setup: "setup",
  build: "build",
  install: "install",
  login: "login",
  launch: "launch",
  navigation: "navigation",
  markers: "markers",
  network: "network",
  trace: "trace",
  lldb: "lldb",
  backend: "backend",
  other: "other",
});

export const LAUNCH_FLAG = "PerfMarkers";
export const LAUNCH_ARGS = [`-${LAUNCH_FLAG}`, "YES"];

export const NetworkType = Object.freeze({
  urlSessionDelegate: "urlsession-delegate",
  alamofire: "alamofire",
  other: "other",
});

export const Swift = Object.freeze({
  markerType: "PerfMarkers",
  markerShared: "PerfMarkers.shared",
  contentReadyModifier: "perfContentReady",
  screenRequestedCall: "PerfMarkers.shared.screenRequested(screen)",
  beginCall: (name) => `PerfMarkers.shared.begin("${name}")`,
  enabledCheck: `UserDefaults.standard.bool(forKey: "${LAUNCH_FLAG}")`,
  guardLine: (indent, line) => `${indent}if !${Swift.enabledCheck} { ${line} }`,
  indentStep: "    ",
});

export const MARKER_LINE = new RegExp(
  [`${Swift.markerType}\\.`, `\\.${Swift.contentReadyModifier}\\(`, `forKey: "${LAUNCH_FLAG}"\\)`].join("|"),
);
export const MARKER_LINE_GIT = MARKER_LINE.source;
export const GUARDED_LINE = new RegExp(`^(\\s*)if !${Swift.enabledCheck.replace(/[.()]/g, "\\$&")} \\{ (.*) \\}$`);

export const Template = Object.freeze({
  markers: { file: "PerfMarkers.swift", output: () => "PerfMarkers.swift" },
  urlSessionDelegate: { file: "URLSessionDelegate+PerfMetrics.swift", output: (type) => `${type}+PerfMetrics.swift` },
  alamofire: { file: "PerfNetMonitor+Alamofire.swift", output: () => "PerfNetMonitor+Alamofire.swift" },
});

export const Placeholder = Object.freeze({
  subsystem: "__SUBSYSTEM__",
  delegateType: "__DELEGATE_TYPE__",
  access: "__ACCESS__",
});

export const Log = Object.freeze({
  prefix: "PERF ",
  netPrefix: "net ",
  Phase: Object.freeze({ requested: "requested", firstAppear: "firstAppear", contentReady: "contentReady", eventPrefix: "event:" }),
  signpostInterval: "ScreenOpen",
});

export const HttpStatus = Object.freeze({ unauthorized: 401 });

export const ExitCode = Object.freeze({ ok: 0, fail: 1, usage: 2 });
