#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { DEFAULTS, ProjectConfig, merge } from "./lib/config.mjs";
import { parseArgs, runCommands, usage } from "./lib/cli.mjs";
import { checkConfig } from "./lib/check.mjs";
import { CONFIG_FILE, DEFAULT_WORK_DIR, ExitCode, NetworkType, Swift } from "./lib/constants.mjs";
import { detectProject } from "./lib/detect.mjs";
import { gitRoot, readJson, writeJson } from "./lib/files.mjs";

const USAGE = "setup.mjs questions | detect | init [--force] | write --answers <file> [--force] | check   (all take --root <dir>)";

const QUESTIONS = [
  "Workspace or project file (path from the repo root).",
  "Per app: name, profile scheme, bundle ID, executable (process) name, entry file (@main App or AppDelegate), source folders.",
  "Profile (Release-like) and debug configuration names, exactly as Xcode lists them.",
  "Simulator UDID (the one the user is signed in to) and, if any, device UDID.",
  "Navigation entry points for screen markers: file, exact anchor line, call to insert on the next line.",
  "Launch anchor for root screens opened at launch: file and exact line (for example `init() {` of the App struct).",
  `Network layer: ${Object.values(NetworkType).join(" | ")}. Delegate type and access, or the Session init line to swap. Token refresh paths.`,
  "Debug-only tools to turn off during profiling (network inspectors): file and exact start line.",
  "Security, jailbreak or anti-debug gates in Release, and the compile flag that disables each (build setting, no file change).",
  "Deployment floor (for example 15.0).",
  "Rules: project code rule files, the approved perf-test exception or none, ask before private hooks (yes or no).",
  `Work folder (default ${DEFAULT_WORK_DIR}, gitignored).`,
];

const splitList = (text) => text.split(",").map((item) => item.trim()).filter(Boolean);

class Prompter {
  constructor() {
    this.rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  }

  async text(prompt, fallback = "") {
    const hint = fallback ? ` [${fallback}]` : "";
    return (await this.rl.question(`${prompt}${hint}: `)).trim() || fallback;
  }

  async yes(prompt, fallback = false) {
    return (await this.text(`${prompt} (y/n)`, fallback ? "y" : "n")).toLowerCase().startsWith("y");
  }

  async list(prompt, fallback = "") {
    return splitList(await this.text(prompt, fallback));
  }

  close() {
    this.rl.close();
  }
}

async function askApps(ask, found) {
  const apps = [];
  const entry = found.code.appEntry?.[0]?.file ?? "";
  do {
    const app = {
      name: await ask.text("App label", "App"),
      scheme: await ask.text("Profile scheme"),
      bundleId: await ask.text("Bundle ID"),
      processName: await ask.text("Executable (process) name in the .app bundle"),
      entryFile: await ask.text("App entry file", entry),
    };
    app.sourceDirs = await ask.list("Source folders, comma separated", path.dirname(app.entryFile || "."));
    apps.push(app);
  } while (await ask.yes("Add another app"));
  return apps;
}

async function askMarkers(ask, found, mainApp) {
  const markers = {
    subsystem: await ask.text("Log subsystem for markers", DEFAULTS.markers.subsystem),
    appMarkerDir: await ask.text("Folder for PerfMarkers.swift, inside the app target", path.join(path.dirname(mainApp.entryFile || "."), "Perf")),
    navigation: [],
    launch: null,
  };
  let guess = found.code.navigation?.[0];
  while (await ask.yes("Add a navigation entry point for screen markers", markers.navigation.length === 0)) {
    markers.navigation.push({
      file: await ask.text("File", guess?.file),
      anchor: await ask.text("Exact anchor line; the marker goes on the next line", guess?.text),
      call: await ask.text("Call to insert", Swift.screenRequestedCall),
    });
    guess = undefined;
  }
  if (await ask.yes("Add a launch anchor for a root screen opened at launch", true)) {
    markers.launch = {
      file: await ask.text("File", mainApp.entryFile),
      anchor: await ask.text("Exact anchor line", "init() {"),
      name: await ask.text("Marker name", "Launch"),
    };
  }
  return markers;
}

async function askNetwork(ask, found) {
  const detected = found.code.urlSessionDelegate ? NetworkType.urlSessionDelegate : found.code.alamofire ? NetworkType.alamofire : NetworkType.other;
  const network = { type: await ask.text(`Network layer: ${Object.values(NetworkType).join(" | ")}`, detected) };
  if (network.type === NetworkType.urlSessionDelegate) {
    const hit = found.code.urlSessionDelegate?.[0];
    network.delegateType = await ask.text("Delegate type name", hit?.text.match(/class\s+(\w+)/)?.[1]);
    network.delegateAccess = (await ask.yes("Is the delegate in a framework, so the method must be public")) ? "public" : "";
    network.metricsDir = await ask.text("Folder for the metrics extension, same target as the delegate", hit ? path.dirname(hit.file) : "");
  } else if (network.type === NetworkType.alamofire) {
    network.metricsDir = await ask.text("Folder for the event monitor, same target as the Session");
    network.monitorRegistration = {
      file: await ask.text("File with the Session init"),
      line: await ask.text("Exact Session init line to swap"),
      with: await ask.text("Replacement line that adds eventMonitors: [PerfNetMonitor()]"),
    };
  }
  network.authPaths = await ask.list("Token refresh path patterns, comma separated, empty if none");
  return network;
}

async function askDebugTools(ask, found) {
  const tools = [];
  for (const [name, hits] of Object.entries(found.networkInspectors)) {
    for (const hit of hits) {
      if (await ask.yes(`Turn off ${name} during profiling: ${hit.file}:${hit.line} \`${hit.text}\``, true)) {
        tools.push({ name, file: hit.file, line: hit.text });
      }
    }
  }
  while (await ask.yes("Add another debug-only tool start line")) {
    tools.push({ name: await ask.text("Name"), file: await ask.text("File"), line: await ask.text("Exact start line") });
  }
  return tools;
}

async function askSecurityGates(ask, found) {
  for (const [name, hits] of Object.entries(found.securityGates)) {
    for (const hit of hits) console.log(`possible gate (${name}): ${hit.file}:${hit.line} ${hit.text}`);
  }
  const gates = [];
  while (await ask.yes("Add a security, jailbreak or anti-debug gate", gates.length === 0 && Object.keys(found.securityGates).length > 0)) {
    gates.push({
      name: await ask.text("Gate name"),
      flag: (await ask.text("Compile flag that disables it, empty if none")) || null,
      where: await ask.text("File that checks the flag"),
    });
  }
  return gates;
}

async function askAll(root) {
  const found = detectProject(root);
  console.log(`Detected:\n${JSON.stringify(found, null, 1)}\n`);
  const ask = new Prompter();
  try {
    const container = await ask.text("Workspace or project file", found.workspaces[0] ?? found.projects[0] ?? "");
    const apps = await askApps(ask, found);
    return {
      project: container.endsWith(".xcworkspace") ? { workspace: container } : { project: container },
      apps,
      build: {
        profileConfiguration: await ask.text("Profile (Release-like) configuration name, exact", DEFAULTS.build.profileConfiguration),
        debugConfiguration: await ask.text("Debug configuration name, exact", DEFAULTS.build.debugConfiguration),
      },
      targets: {
        simulatorUdid: await ask.text("Simulator UDID the user is signed in to", found.bootedSimulators[0]?.udid),
        deviceUdid: (await ask.text("Device UDID, empty if none")) || null,
      },
      markers: await askMarkers(ask, found, apps[0]),
      network: await askNetwork(ask, found),
      debugTools: await askDebugTools(ask, found),
      securityGates: await askSecurityGates(ask, found),
      deploymentTarget: await ask.text("Deployment floor", found.deploymentTargets[0] ?? ""),
      smellScan: { paths: [...new Set(apps.flatMap((app) => app.sourceDirs))] },
      rules: {
        codeRules: await ask.list("Project code rule files, comma separated, empty if none"),
        testException: (await ask.text("Approved perf-test exception, empty if none")) || null,
        privateHooksNeedOk: await ask.yes("Ask before private or underscored debug hooks", true),
      },
      printChanges: { initFile: apps[0].entryFile, initLine: null },
      workDir: await ask.text("Work folder, gitignored", DEFAULT_WORK_DIR),
    };
  } finally {
    ask.close();
  }
}

function withDerivedDefaults(config) {
  if (!config.smellScan.paths.length) config.smellScan.paths = [...new Set(config.apps.flatMap((app) => app.sourceDirs ?? []))];
  config.printChanges.initFile ??= config.apps[0]?.entryFile ?? null;
  return config;
}

function writeConfig(root, answers, force) {
  const file = path.join(root, CONFIG_FILE);
  if (fs.existsSync(file) && !force) throw new Error(`${file} exists; use --force to replace it`);
  const config = withDerivedDefaults(merge(structuredClone(DEFAULTS), answers));
  writeJson(file, config);
  console.log(`wrote ${file}`);
  const ignoreFile = path.join(root, ".gitignore");
  const entry = `${config.workDir.replace(/\/$/, "")}/`;
  const ignored = fs.existsSync(ignoreFile) && fs.readFileSync(ignoreFile, "utf8").split("\n").includes(entry);
  if (!ignored) console.log(`add \`${entry}\` to .gitignore: traces and logs can hold request bodies`);
  return file;
}

function report(config) {
  const { problems, notes } = checkConfig(config);
  notes.forEach((note) => console.log(`note: ${note}`));
  problems.forEach((problem) => console.log(`problem: ${problem}`));
  console.log(problems.length ? `${problems.length} problem(s)` : "config ok");
  return problems.length ? ExitCode.fail : ExitCode.ok;
}

const rootOf = (args) => (args.root ? path.resolve(args.root) : gitRoot());
const spec = { options: ["root", "answers"], flags: ["force"] };

runCommands(
  {
    questions: () => QUESTIONS.forEach((question, index) => console.log(`${String(index + 1).padStart(2)}. ${question}`)),
    detect: (argv) => console.log(JSON.stringify(detectProject(rootOf(parseArgs(argv, spec))), null, 1)),
    init: async (argv) => {
      const args = parseArgs(argv, spec);
      const root = rootOf(args);
      return report(ProjectConfig.load(writeConfig(root, await askAll(root), args.force)));
    },
    write: (argv) => {
      const args = parseArgs(argv, spec);
      if (!args.answers) usage(USAGE);
      return report(ProjectConfig.load(writeConfig(rootOf(args), readJson(args.answers), args.force)));
    },
    check: () => report(ProjectConfig.load()),
  },
  USAGE,
);
