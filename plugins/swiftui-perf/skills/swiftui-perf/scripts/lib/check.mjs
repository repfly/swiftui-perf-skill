import fs from "node:fs";
import { NetworkType } from "./constants.mjs";
import { grepSwift, readLines } from "./files.mjs";
import { countMatches } from "./lines.mjs";
import { CODE_SHAPES } from "./detect.mjs";

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const REQUIRED_APP_KEYS = ["scheme", "bundleId", "processName"];

export function checkConfig(config) {
  const problems = [];
  const notes = [];
  const exists = (relative) => Boolean(relative) && fs.existsSync(config.resolve(relative));

  const requireFile = (label, relative) => {
    if (!relative) problems.push(`${label}: not set`);
    else if (!exists(relative)) problems.push(`${label}: ${relative} not found`);
    return exists(relative);
  };

  const requireAnchor = (label, relative, anchor) => {
    if (!requireFile(label, relative)) return;
    const count = countMatches(readLines(config.resolve(relative)), anchor);
    if (count !== 1) problems.push(`${label}: \`${anchor}\` found ${count} times in ${relative}, need exactly 1`);
  };

  requireFile("project", config.project.workspace ?? config.project.project);
  if (!config.apps.length) problems.push("apps: none");
  for (const app of config.apps) {
    for (const key of REQUIRED_APP_KEYS) if (!app[key]) problems.push(`app ${app.name}: ${key} not set`);
    if (app.entryFile) requireFile(`app ${app.name} entryFile`, app.entryFile);
  }
  if (!config.targets.simulatorUdid) problems.push("targets.simulatorUdid: not set");

  const { markers, network } = config;
  if (!markers.appMarkerDir) problems.push("markers.appMarkerDir: not set");
  markers.navigation.forEach((entry, index) => requireAnchor(`markers.navigation[${index}]`, entry.file, entry.anchor));
  if (!markers.navigation.length) notes.push("no navigation anchors: only manual begin() markers work");
  if (markers.launch) requireAnchor("markers.launch", markers.launch.file, markers.launch.anchor);

  switch (network.type) {
    case NetworkType.urlSessionDelegate: {
      if (!network.delegateType) problems.push("network.delegateType: not set");
      requireFile("network.metricsDir", network.metricsDir);
      const existing = grepSwift(config.root, { metricsCallback: CODE_SHAPES.metricsCallback }).metricsCallback;
      if (existing) problems.push(`didFinishCollecting already exists in ${existing[0].file}; log PERF net lines there instead of the patch`);
      break;
    }
    case NetworkType.alamofire: {
      requireFile("network.metricsDir", network.metricsDir);
      const registration = network.monitorRegistration ?? {};
      requireAnchor("network.monitorRegistration", registration.file, registration.line);
      break;
    }
    case NetworkType.other:
      notes.push("network type other: no PERF net lines; use proxy timing (references/07)");
      break;
    default:
      problems.push(`network.type: unknown value ${network.type}`);
  }

  config.debugTools.forEach((tool, index) => requireAnchor(`debugTools[${index}] ${tool.name}`, tool.file, tool.line));

  for (const gate of config.securityGates) {
    if (!gate.flag) {
      problems.push(`security gate ${gate.name}: no disable flag; ask the user how to profile a Release build`);
      continue;
    }
    const flagCheck = new RegExp(`#if\\s+!?\\(?\\s*${escapeRegExp(gate.flag)}\\b`);
    if (exists(gate.where) && !flagCheck.test(fs.readFileSync(config.resolve(gate.where), "utf8"))) {
      problems.push(`security gate ${gate.name}: no \`#if ${gate.flag}\` in ${gate.where}`);
    }
  }
  return { problems, notes };
}
