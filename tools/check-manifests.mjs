#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SKILL_NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const MAX_NAME = 64;
const MAX_DESCRIPTION = 1024;
const MAX_COMPATIBILITY = 500;
const MAX_SKILL_LINES = 500;
const RESERVED_MARKETPLACE = /^(claude-|anthropic-)|^claude-plugins-official$/;

const Manifest = Object.freeze({
  claudeMarketplace: ".claude-plugin/marketplace.json",
  codexMarketplace: ".agents/plugins/marketplace.json",
  claudePlugin: ".claude-plugin/plugin.json",
  cursorPlugin: ".cursor-plugin/plugin.json",
  agentPlugin: "plugin.json",
});

const problems = [];
const report = (message) => problems.push(message);
const readJson = (relative) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, relative), "utf8"));
  } catch (error) {
    report(`${relative}: ${error.message}`);
    return null;
  }
};
const requireKeys = (label, object, keys) => keys.filter((key) => object?.[key] == null).forEach((key) => report(`${label}: missing ${key}`));
const insideRoot = (relative) => !relative.split("/").includes("..") && relative.startsWith("./");

function parseFrontmatter(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) return null;
  return Object.fromEntries(
    match[1]
      .split("\n")
      .filter((line) => /^[\w-]+:/.test(line))
      .map((line) => {
        const index = line.indexOf(":");
        return [line.slice(0, index), line.slice(index + 1).trim().replace(/^"(.*)"$/, "$1")];
      }),
  );
}

function checkSkill(skillDir) {
  const relative = path.relative(ROOT, skillDir);
  const file = path.join(skillDir, "SKILL.md");
  if (!fs.existsSync(file)) return report(`${relative}: no SKILL.md`);
  const text = fs.readFileSync(file, "utf8");
  const front = parseFrontmatter(text);
  if (!front) return report(`${relative}/SKILL.md: no frontmatter`);
  const folder = path.basename(skillDir);
  if (front.name !== folder) report(`${relative}: name ${front.name} does not match folder ${folder}`);
  if (!SKILL_NAME.test(front.name ?? "") || front.name.length > MAX_NAME) report(`${relative}: invalid name ${front.name}`);
  if (!front.description || front.description.length > MAX_DESCRIPTION) report(`${relative}: description must be 1-${MAX_DESCRIPTION} chars (is ${front.description?.length ?? 0})`);
  if ((front.compatibility ?? "").length > MAX_COMPATIBILITY) report(`${relative}: compatibility over ${MAX_COMPATIBILITY} chars`);
  if (text.split("\n").length > MAX_SKILL_LINES) report(`${relative}: SKILL.md over ${MAX_SKILL_LINES} lines`);
  for (const [, link] of text.matchAll(/`((?:references|scripts)\/[\w./+-]+)`/g)) {
    if (!link.includes("<") && !fs.existsSync(path.join(skillDir, link))) report(`${relative}/SKILL.md: missing ${link}`);
  }
}

function checkPlugin(pluginDir, expectedName) {
  const relative = path.relative(ROOT, pluginDir);
  for (const manifest of [Manifest.claudePlugin, Manifest.cursorPlugin, Manifest.agentPlugin]) {
    const data = readJson(path.join(relative, manifest));
    requireKeys(`${relative}/${manifest}`, data, ["name", "version", "description"]);
    if (data && data.name !== expectedName) report(`${relative}/${manifest}: name ${data.name} != ${expectedName}`);
  }
  const skillsDir = path.join(pluginDir, "skills");
  const skills = fs.existsSync(skillsDir) ? fs.readdirSync(skillsDir).filter((name) => fs.statSync(path.join(skillsDir, name)).isDirectory()) : [];
  if (!skills.length) report(`${relative}: no skills/<name>/ folder`);
  skills.forEach((name) => checkSkill(path.join(skillsDir, name)));
}

function checkMarketplaces() {
  const claude = readJson(Manifest.claudeMarketplace);
  requireKeys(Manifest.claudeMarketplace, claude, ["name", "owner", "plugins", "description"]);
  if (claude?.owner && !claude.owner.name) report(`${Manifest.claudeMarketplace}: owner.name missing`);
  if (RESERVED_MARKETPLACE.test(claude?.name ?? "")) report(`${Manifest.claudeMarketplace}: reserved name ${claude.name}`);
  const codex = readJson(Manifest.codexMarketplace);
  requireKeys(Manifest.codexMarketplace, codex, ["name", "plugins"]);
  const sources = [
    ...(claude?.plugins ?? []).map((plugin) => ({ file: Manifest.claudeMarketplace, name: plugin.name, source: plugin.source })),
    ...(codex?.plugins ?? []).map((plugin) => ({ file: Manifest.codexMarketplace, name: plugin.name, source: plugin.source?.path })),
  ];
  for (const { file, name, source } of sources) {
    if (!name || typeof source !== "string" || !insideRoot(source)) {
      report(`${file}: plugin ${name} needs a ./relative source inside the repo`);
      continue;
    }
    const dir = path.join(ROOT, source);
    if (!fs.existsSync(dir)) report(`${file}: ${source} not found`);
    else checkPlugin(dir, name);
  }
}

checkMarketplaces();
const unique = [...new Set(problems)];
unique.forEach((problem) => console.log(`problem: ${problem}`));
console.log(unique.length ? `${unique.length} manifest problem(s)` : "manifests ok");
process.exit(unique.length ? 1 : 0);
