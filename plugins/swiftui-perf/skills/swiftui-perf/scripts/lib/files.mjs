import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const SKIPPED_DIRS = new Set([".git", "Pods", "Carthage", ".build", "DerivedData", "SourcePackages", "node_modules"]);
const BUNDLE_DIR = /\.(xcodeproj|xcworkspace|xcassets)$/;

export const readLines = (file) => fs.readFileSync(file, "utf8").split("\n");
export const writeLines = (file, lines) => fs.writeFileSync(file, lines.join("\n"));
export const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
export const writeJson = (file, data) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
};

export function* walkFiles(dir, extraSkips = []) {
  const skipped = new Set([...SKIPPED_DIRS, ...extraSkips]);
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (!entry.isDirectory()) yield full;
    else if (!skipped.has(entry.name) && !BUNDLE_DIR.test(entry.name)) yield* walkFiles(full, extraSkips);
  }
}

export function findBundles(root) {
  const found = { workspaces: [], projects: [] };
  const visit = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory() || SKIPPED_DIRS.has(entry.name)) continue;
      const relative = path.relative(root, path.join(dir, entry.name));
      if (entry.name.endsWith(".xcworkspace")) found.workspaces.push(relative);
      else if (entry.name.endsWith(".xcodeproj")) found.projects.push(relative);
      else visit(path.join(dir, entry.name));
    }
  };
  visit(root);
  return found;
}

export function grepSwift(root, patterns, { limit = 5, skip = [] } = {}) {
  const hits = Object.fromEntries(Object.keys(patterns).map((name) => [name, []]));
  for (const file of walkFiles(root, skip)) {
    if (!file.endsWith(".swift")) continue;
    readLines(file).forEach((text, index) => {
      for (const [name, pattern] of Object.entries(patterns)) {
        if (hits[name].length < limit && pattern.test(text)) {
          hits[name].push({ file: path.relative(root, file), line: index + 1, text: text.trim().slice(0, 160) });
        }
      }
    });
  }
  return Object.fromEntries(Object.entries(hits).filter(([, list]) => list.length));
}

export function gitRoot(cwd = process.cwd()) {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return cwd;
  }
}

export function git(root, args) {
  try {
    return execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch (error) {
    return error.stdout ?? "";
  }
}

export const isClean = (root, file) => git(root, ["status", "--porcelain", "--", file]).trim() === "";
