#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { ProjectConfig } from "./lib/config.mjs";
import { parseArgs, runCommands } from "./lib/cli.mjs";
import { ExitCode, MARKER_LINE_GIT, MARKER_STATE_FILE, NetworkType, PATCH_DIR, Placeholder, Swift, Template } from "./lib/constants.mjs";
import { git, isClean, readJson, readLines, writeJson, writeLines } from "./lib/files.mjs";
import { countMarkerLines, dropMarkerLines, guardLine, insertAfter, replaceLine, sameLine, unguard } from "./lib/lines.mjs";

const Op = Object.freeze({ insert: "insert", guard: "guard", replace: "replace" });
const State = Object.freeze({ clean: "clean", applied: "applied" });

class MarkerPatch {
  constructor(config) {
    this.config = config;
    this.statePath = path.join(config.workPath, MARKER_STATE_FILE);
  }

  get templates() {
    const { markers, network } = this.config;
    const values = { [Placeholder.subsystem]: markers.subsystem };
    const list = [{ template: Template.markers, dir: markers.appMarkerDir, values }];
    if (network.type === NetworkType.urlSessionDelegate) {
      list.push({
        template: Template.urlSessionDelegate,
        dir: network.metricsDir,
        name: network.delegateType,
        values: { ...values, [Placeholder.delegateType]: network.delegateType, [Placeholder.access]: network.delegateAccess ? `${network.delegateAccess.trim()} ` : "" },
      });
    } else if (network.type === NetworkType.alamofire) {
      list.push({ template: Template.alamofire, dir: network.metricsDir, values });
    }
    return list.map((entry) => ({ ...entry, output: path.join(entry.dir ?? "", entry.template.output(entry.name)) }));
  }

  plannedEdits(withLaunch) {
    const { markers, debugTools, network } = this.config;
    const edits = markers.navigation.map((entry) => ({ op: Op.insert, file: entry.file, anchor: entry.anchor, text: entry.call || Swift.screenRequestedCall }));
    if (withLaunch && markers.launch) {
      edits.push({ op: Op.insert, file: markers.launch.file, anchor: markers.launch.anchor, text: Swift.beginCall(markers.launch.name || "Launch") });
    }
    for (const tool of debugTools) edits.push({ op: Op.guard, file: tool.file, line: tool.line.trim() });
    if (network.type === NetworkType.alamofire && network.monitorRegistration) {
      const { file, line, with: replacement } = network.monitorRegistration;
      edits.push({ op: Op.replace, file, from: line.trim(), to: replacement.trim() });
    }
    return edits;
  }

  markedFiles() {
    const created = new Set(this.templates.map((entry) => entry.output));
    return git(this.config.root, ["grep", "-lE", MARKER_LINE_GIT, "--", "*.swift"])
      .split("\n")
      .filter((file) => file && !created.has(file));
  }

  status() {
    const lines = [];
    if (fs.existsSync(this.statePath)) lines.push(`state: ${path.relative(this.config.root, this.statePath)}`);
    for (const { output } of this.templates) if (fs.existsSync(this.config.resolve(output))) lines.push(`present: ${output}`);
    for (const file of this.markedFiles()) lines.push(`marker lines: ${file} (${countMarkerLines(readLines(this.config.resolve(file)))})`);
    return { state: lines.length ? State.applied : State.clean, lines };
  }

  edit(file, transform) {
    const full = this.config.resolve(file);
    try {
      writeLines(full, transform(readLines(full)));
    } catch (error) {
      throw new Error(`${file}: ${error.message}`);
    }
  }

  apply({ launch = false } = {}) {
    if (this.status().state !== State.clean) throw new Error("marker patch is already applied; run status");
    const edits = this.plannedEdits(launch);
    const dirty = [...new Set(edits.map((edit) => edit.file))].filter((file) => !isClean(this.config.root, file));
    if (dirty.length) throw new Error(`uncommitted changes in ${dirty.join(", ")}; commit them or keep them out of the perf session`);
    for (const { template, output, values } of this.templates) {
      const text = Object.entries(values).reduce((body, [key, value]) => body.replaceAll(key, value), fs.readFileSync(path.join(PATCH_DIR, template.file), "utf8"));
      fs.mkdirSync(path.dirname(this.config.resolve(output)), { recursive: true });
      fs.writeFileSync(this.config.resolve(output), text);
    }
    for (const edit of edits) {
      if (edit.op === Op.insert) this.edit(edit.file, (lines) => insertAfter(lines, edit.anchor, edit.text));
      else if (edit.op === Op.guard) this.edit(edit.file, (lines) => guardLine(lines, edit.line));
      else this.edit(edit.file, (lines) => replaceLine(lines, edit.from, edit.to));
    }
    writeJson(this.statePath, { created: this.templates.map((entry) => entry.output), edits });
  }

  revert() {
    const saved = fs.existsSync(this.statePath) ? readJson(this.statePath) : { created: [], edits: [] };
    for (const edit of saved.edits.filter((entry) => entry.op === Op.replace)) {
      this.edit(edit.file, (lines) => (lines.some((line) => sameLine(line, edit.to)) ? replaceLine(lines, edit.to, edit.from) : lines));
    }
    const files = new Set([...this.markedFiles(), ...saved.edits.map((edit) => edit.file)]);
    for (const file of files) if (fs.existsSync(this.config.resolve(file))) this.edit(file, (lines) => dropMarkerLines(unguard(lines)));
    for (const output of new Set([...this.templates.map((entry) => entry.output), ...saved.created])) {
      const full = this.config.resolve(output);
      fs.rmSync(full, { force: true });
      if (fs.existsSync(path.dirname(full)) && fs.readdirSync(path.dirname(full)).length === 0) fs.rmdirSync(path.dirname(full));
    }
    fs.rmSync(this.statePath, { force: true });
    return [...files].map((file) => ({ file, restored: isClean(this.config.root, file) }));
  }
}

const patch = () => new MarkerPatch(ProjectConfig.load());

function printStatus(markerPatch) {
  const { state, lines } = markerPatch.status();
  [...lines, state].forEach((line) => console.log(line));
  return state === State.clean ? ExitCode.ok : ExitCode.fail;
}

runCommands(
  {
    apply: (argv) => {
      const markerPatch = patch();
      markerPatch.apply(parseArgs(argv, { flags: ["launch"] }));
      console.log(`applied. Add .${Swift.contentReadyModifier}(<condition>) on its own line in the target screen.`);
      console.log("If a new file is not in its target (no synchronized folder), add it in Xcode for this session.");
      printStatus(markerPatch);
    },
    revert: () => {
      const markerPatch = patch();
      for (const { file, restored } of markerPatch.revert()) console.log(`${restored ? "restored" : "still changed (other edits or a fix)"}: ${file}`);
      return printStatus(markerPatch);
    },
    status: () => printStatus(patch()),
  },
  "markers.mjs apply [--launch] | revert | status",
);
