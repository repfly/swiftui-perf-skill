#!/usr/bin/env node
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { fail, parseArgs, runCommands } from "./lib/cli.mjs";
import { ExitCode } from "./lib/constants.mjs";
import { readJson, writeJson } from "./lib/files.mjs";

const USAGE = "runlog.mjs new <runs/name> key=value... | diff <runs/A> <runs/B> | show <runs/name>";
const META_SUFFIX = ".meta.json";
const REQUIRED_KEYS = ["build", "target", "temperature", "network"];
const RECORDED_KEYS = ["created", "commit", "dirty"];

const metaPath = (run) => `${run.replace(/\.(trace|log|json)$/, "")}${META_SUFFIX}`;

function gitState() {
  const run = (args) => execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  try {
    return { commit: run(["rev-parse", "--short", "HEAD"]), dirty: run(["status", "--porcelain"]) !== "" };
  } catch {
    return { commit: null, dirty: null };
  }
}

function parsePairs(pairs) {
  return Object.fromEntries(
    pairs.map((pair) => {
      const index = pair.indexOf("=");
      if (index < 1) fail(`not key=value: ${pair}`, ExitCode.usage);
      return [pair.slice(0, index), pair.slice(index + 1)];
    }),
  );
}

function createRun(argv) {
  const [run, ...pairs] = parseArgs(argv).positional;
  if (!run) fail(`usage: ${USAGE}`, ExitCode.usage);
  const variables = parsePairs(pairs);
  const missing = REQUIRED_KEYS.filter((key) => !(key in variables));
  if (missing.length) fail(`missing keys: ${missing.join(", ")} (for example build=profile target=sim temperature=cold network=real)`);
  const file = metaPath(run);
  if (fs.existsSync(file)) fail(`${file} exists; never overwrite a run`);
  writeJson(file, { ...variables, created: new Date().toISOString(), ...gitState() });
  console.log(file);
}

function diffRuns(argv) {
  const [a, b] = parseArgs(argv).positional;
  if (!a || !b) fail(`usage: ${USAGE}`, ExitCode.usage);
  const [left, right] = [readJson(metaPath(a)), readJson(metaPath(b))];
  const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].filter((key) => !RECORDED_KEYS.includes(key));
  const changed = keys.filter((key) => left[key] !== right[key]);
  changed.forEach((key) => console.log(`${key}: ${left[key] ?? "-"} -> ${right[key] ?? "-"}`));
  if (left.commit !== right.commit || left.dirty || right.dirty) console.log(`code: ${left.commit}${left.dirty ? "+dirty" : ""} -> ${right.commit}${right.dirty ? "+dirty" : ""} (name the code change in a key, for example change=h1)`);
  if (changed.length === 1) {
    console.log("ok: one variable changed");
    return ExitCode.ok;
  }
  console.log(changed.length ? `not comparable: ${changed.length} variables changed; split into A/B runs that change one each` : "no variable changed: this is a repeat, not an A/B");
  return ExitCode.fail;
}

runCommands(
  {
    new: createRun,
    diff: diffRuns,
    show: (argv) => console.log(JSON.stringify(readJson(metaPath(parseArgs(argv).positional[0] ?? "")), null, 2)),
  },
  USAGE,
);
