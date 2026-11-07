import fs from "node:fs";
import path from "node:path";
import { CONFIG_ENV, CONFIG_FILE, DEFAULT_WORK_DIR, NetworkType } from "./constants.mjs";
import { fail } from "./cli.mjs";

export const DEFAULTS = Object.freeze({
  version: 1,
  workDir: DEFAULT_WORK_DIR,
  project: { workspace: null, project: null },
  apps: [],
  build: { profileConfiguration: "Release", debugConfiguration: "Debug", profileBuildSettings: [], derivedDataPath: null },
  targets: { simulatorUdid: null, deviceUdid: null, developerDir: null },
  markers: { subsystem: "com.example.perf", appMarkerDir: null, navigation: [], launch: null },
  network: { type: NetworkType.other, delegateType: null, delegateAccess: "", metricsDir: null, monitorRegistration: null, authPaths: [] },
  debugTools: [],
  securityGates: [],
  deploymentTarget: null,
  smellScan: { paths: [], exclude: ["*/Pods/*", "*/Carthage/*", "*/.build/*", "*Tests/*", "*/SourcePackages/*"] },
  rules: { codeRules: [], testException: null, privateHooksNeedOk: true },
  printChanges: { initFile: null, initLine: null },
});

const isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

export function merge(base, extra) {
  if (!isPlainObject(base) || !isPlainObject(extra)) return extra === undefined ? base : extra;
  const merged = { ...base };
  for (const [key, value] of Object.entries(extra)) merged[key] = merge(base[key], value);
  return merged;
}

export function findConfig(start = process.cwd()) {
  if (process.env[CONFIG_ENV]) return path.resolve(process.env[CONFIG_ENV]);
  for (let dir = path.resolve(start); ; dir = path.dirname(dir)) {
    const candidate = path.join(dir, CONFIG_FILE);
    if (fs.existsSync(candidate)) return candidate;
    if (path.dirname(dir) === dir) return null;
  }
}

export class ProjectConfig {
  constructor(file, data) {
    this.file = path.resolve(file);
    this.root = path.dirname(this.file);
    Object.assign(this, merge(structuredClone(DEFAULTS), data));
  }

  static load(file = findConfig()) {
    if (!file || !fs.existsSync(file)) fail(`no ${CONFIG_FILE} found; run: node scripts/setup.mjs init`);
    return new ProjectConfig(file, JSON.parse(fs.readFileSync(file, "utf8")));
  }

  get workPath() {
    return path.join(this.root, this.workDir);
  }

  resolve(relative) {
    return path.join(this.root, relative);
  }

  app(name = null) {
    return name ? this.apps.find((app) => app.name === name) ?? null : this.apps[0] ?? null;
  }

  value(dotted) {
    return dotted.split(".").reduce((node, key) => (node == null ? null : node[Array.isArray(node) ? Number(key) : key]), this) ?? null;
  }

  toJSON() {
    const { file, root, ...data } = this;
    return data;
  }
}
