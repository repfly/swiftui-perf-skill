#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fail, parseArgs, usage } from "./lib/cli.mjs";
import { ProjectConfig, findConfig } from "./lib/config.mjs";
import { parseXml } from "./lib/xml.mjs";

const USAGE = "summarize_trace.mjs <file.trace> [--run N] [--pid PID | --process NAME] [--window startMs:endMs] [--top 15] [--schema S]... [--subsystem S] [--all-signposts] [--log-out file]";
const NEAR_MAX = 2 ** 63;
const NS_PER_MS = 1e6;
const DEFAULT_SAMPLE_NS = 1e6;
const MAIN_THREAD = "Main Thread";
const APP_BINARY = ".app/";
const APPLE_SUBSYSTEM = "com.apple.";
const PERF_LINE = "PERF ";
const HANG_TIERS_MS = [100, 250];

const Schema = Object.freeze({
  timeProfile: "time-profile",
  timeSample: "time-sample",
  hangs: "potential-hangs",
  signposts: "os-signpost",
  log: "os-log",
});
const GENERIC_SCHEMAS = ["hitches", "swiftui-updates", "swiftui-update-groups", "hang-risks", "http-transaction"];

const toMs = (ns) => (ns == null ? null : Math.round((ns / NS_PER_MS) * 100) / 100);
const round = (value, digits = 2) => Math.round(value * 10 ** digits) / 10 ** digits;

function exportXml(trace, args) {
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "perf-trace-")), "export.xml");
  try {
    execFileSync("xcrun", ["xctrace", "export", "--input", trace, ...args, "--output", out], { stdio: ["ignore", "ignore", "pipe"] });
    return parseXml(fs.readFileSync(out, "utf8"));
  } catch (error) {
    throw new Error(String(error.stderr ?? error.message).trim().slice(0, 300));
  } finally {
    fs.rmSync(path.dirname(out), { recursive: true, force: true });
  }
}

class Table {
  constructor(root) {
    this.ids = new Map();
    for (const element of root.descendants()) if (element.attr("id")) this.ids.set(element.attr("id"), element);
    const schema = root.descendants("schema").next().value;
    this.columns = schema ? schema.childrenNamed("col").map((col) => col.child("mnemonic")?.text.trim()) : [];
    this.rows = [...root.descendants("row")].map((row) => Object.fromEntries(this.columns.map((name, index) => [name, this.resolve(row.children[index])])));
  }

  resolve(element) {
    if (!element) return null;
    if (element.attr("ref")) return this.ids.get(element.attr("ref")) ?? element;
    return element.tag === "sentinel" ? null : element;
  }

  text(element) {
    const resolved = this.resolve(element);
    return resolved ? resolved.text.trim() : null;
  }

  label(element) {
    const resolved = this.resolve(element);
    return resolved ? resolved.attr("fmt") ?? resolved.text.trim() : null;
  }

  number(element) {
    const value = Number.parseInt(this.text(element), 10);
    return Number.isNaN(value) || value >= NEAR_MAX ? null : value;
  }

  frames(stack) {
    const resolved = this.resolve(stack);
    if (!resolved) return [];
    return resolved.childrenNamed("frame").map((raw) => {
      const frame = this.resolve(raw);
      const binary = this.resolve(frame.child("binary"));
      return { name: frame.attr("name") ?? frame.attr("addr") ?? "?", binary: binary?.attr("name") ?? "?", binaryPath: binary?.attr("path") ?? "" };
    });
  }
}

class ProcessFilter {
  constructor({ pid, process }) {
    this.pid = pid ? `(${pid})` : null;
    this.name = process?.toLowerCase() ?? null;
    this.seen = new Map();
  }

  accepts(table, cells) {
    const label = table.label(cells.process) ?? "";
    if (label) this.seen.set(label, (this.seen.get(label) ?? 0) + 1);
    if (this.pid) return label.includes(this.pid);
    if (this.name) return `${label} ${table.label(cells.thread) ?? ""}`.toLowerCase().includes(this.name);
    return true;
  }

  get active() {
    return Boolean(this.pid || this.name);
  }

  topSeen(limit) {
    return [...this.seen.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([label, rows]) => ({ label, rows }));
  }
}

const inWindow = (ns, window) => !window || ns == null || (ns / NS_PER_MS >= window.start && ns / NS_PER_MS <= window.end);

class Weights extends Map {
  add(key, value) {
    this.set(key, (this.get(key) ?? 0) + value);
  }

  top(total, limit) {
    return [...this.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([name, ns]) => ({ name, ms: toMs(ns), pct: total ? round((100 * ns) / total, 1) : 0 }));
  }
}

function summarizeTimeProfile(table, options, filter) {
  const totals = { all: 0, main: 0 };
  const [selfAll, selfMain, totalMain, appMain, binaries, states] = Array.from({ length: 6 }, () => new Weights());
  let matched = 0;
  for (const cells of table.rows) {
    if (!inWindow(table.number(cells.time), options.window) || !filter.accepts(table, cells)) continue;
    const frames = table.frames(cells.stack);
    if (!frames.length) continue;
    matched++;
    const weight = table.number(cells.weight) ?? DEFAULT_SAMPLE_NS;
    const [leaf] = frames;
    totals.all += weight;
    selfAll.add(leaf.name, weight);
    binaries.add(leaf.binary, weight);
    states.add(table.label(cells["thread-state"]) ?? "?", weight);
    if (!(table.label(cells.thread) ?? "").startsWith(MAIN_THREAD)) continue;
    totals.main += weight;
    selfMain.add(leaf.name, weight);
    for (const name of new Set(frames.map((frame) => frame.name))) totalMain.add(name, weight);
    appMain.add(frames.find((frame) => frame.binaryPath.includes(APP_BINARY))?.name ?? "(no app frame)", weight);
  }
  return {
    matchedSamples: matched,
    sampledMs: { all: toMs(totals.all), main: toMs(totals.main) },
    threadStateMs: Object.fromEntries([...states].map(([state, ns]) => [state, toMs(ns)])),
    topSelfAll: selfAll.top(totals.all, options.top),
    topSelfMain: selfMain.top(totals.main, options.top),
    topTotalMain: totalMain.top(totals.main, options.top),
    topAppFrameMain: appMain.top(totals.main, options.top),
    selfByBinary: binaries.top(totals.all, options.top),
  };
}

function summarizeHangs(table, options, filter) {
  const hangs = table.rows
    .filter((cells) => inWindow(table.number(cells.start), options.window) && filter.accepts(table, cells))
    .map((cells) => ({ startMs: toMs(table.number(cells.start)), durationMs: toMs(table.number(cells.duration)), type: table.text(cells["hang-type"]), thread: table.label(cells.thread) }))
    .sort((a, b) => (b.durationMs ?? 0) - (a.durationMs ?? 0));
  const atLeast = Object.fromEntries(HANG_TIERS_MS.map((tier) => [`atLeast${tier}ms`, hangs.filter((hang) => (hang.durationMs ?? 0) >= tier).length]));
  return { count: hangs.length, ...atLeast, hangs: hangs.slice(0, options.top) };
}

function intervalStats(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  return { count: sorted.length, p50Ms: round(median), maxMs: round(sorted.at(-1)), totalMs: round(sorted.reduce((sum, v) => sum + v, 0)) };
}

function summarizeSignposts(table, options, filter) {
  const open = new Map();
  const durations = new Map();
  const events = new Weights();
  const markerIntervals = [];
  for (const cells of table.rows) {
    const subsystem = table.text(cells.subsystem) ?? "";
    if (!options.allSignposts && subsystem.startsWith(APPLE_SUBSYSTEM)) continue;
    if (!filter.accepts(table, cells)) continue;
    const time = table.number(cells.time);
    const name = table.text(cells.name) ?? "?";
    const key = `${subsystem}|${name}|${table.text(cells.identifier)}`;
    const label = `${subsystem}/${name}`;
    const kind = table.text(cells["event-type"]);
    if (kind === "Begin") open.set(key, { start: time, message: table.text(cells.message) });
    else if (kind === "Event" && inWindow(time, options.window)) events.add(label, 1);
    else if (kind === "End" && open.has(key)) {
      const { start, message } = open.get(key);
      open.delete(key);
      if (start == null || time == null || !inWindow(start, options.window)) continue;
      const ms = (time - start) / NS_PER_MS;
      durations.set(label, [...(durations.get(label) ?? []), ms]);
      if (subsystem === options.subsystem) markerIntervals.push({ name, message, startMs: toMs(start), durationMs: round(ms) });
    }
  }
  const byTotal = [...durations.entries()].sort((a, b) => b[1].reduce((s, v) => s + v, 0) - a[1].reduce((s, v) => s + v, 0));
  return {
    intervals: Object.fromEntries(byTotal.slice(0, options.top).map(([label, values]) => [label, intervalStats(values)])),
    events: Object.fromEntries([...events].sort((a, b) => b[1] - a[1]).slice(0, options.top)),
    unclosed: open.size,
    markerIntervals,
  };
}

function summarizeLog(table, options) {
  const lines = table.rows
    .map((cells) => ({ time: cells.time, message: table.text(cells.message) ?? "" }))
    .filter(({ time, message }) => message.includes(PERF_LINE) && inWindow(table.number(time), options.window))
    .map(({ time, message }) => `${table.label(time)} ${message.slice(message.indexOf(PERF_LINE))}`);
  if (options.logOut) fs.writeFileSync(options.logOut, lines.length ? `${lines.join("\n")}\n` : "");
  return { perfLines: lines.length, logOut: options.logOut ?? null, sample: lines.slice(0, 5) };
}

function summarizeGeneric(table, options) {
  const rows = table.rows
    .map((cells) => ({
      duration: table.number(cells.duration) ?? 0,
      row: Object.fromEntries(Object.entries(cells).filter(([name, value]) => value && name !== "backtrace" && name !== "stack").map(([name, value]) => [name, table.label(value)])),
    }))
    .sort((a, b) => b.duration - a.duration);
  return { rows: rows.length, longest: rows.slice(0, options.top).map((entry) => entry.row) };
}

function readToc(trace) {
  return exportXml(trace, ["--toc"])
    .childrenNamed("run")
    .map((run) => ({
      number: run.attr("number"),
      device: run.find("info/target/device")?.attributes ?? {},
      process: run.find("info/target/process")?.attributes ?? {},
      schemas: [...new Set([...run.descendants("table")].map((table) => table.attr("schema")).filter(Boolean))].sort(),
    }));
}

function parseWindow(text) {
  if (!text) return null;
  const [start, end] = text.split(":");
  return { start: Number(start || 0), end: end ? Number(end) : Infinity };
}

const configuredSubsystem = () => {
  const file = findConfig();
  return file ? ProjectConfig.load(file).markers.subsystem : null;
};

const pick = (source, keys) => Object.fromEntries(keys.map((key) => [key, source[key] ?? null]));

function main() {
  const args = parseArgs(process.argv.slice(2), { options: ["run", "pid", "process", "window", "top", "subsystem", "log-out"], flags: ["all-signposts"], lists: ["schema"] });
  const [trace] = args.positional;
  if (!trace) usage(USAGE);
  const options = {
    window: parseWindow(args.window),
    top: Number(args.top ?? 15),
    allSignposts: Boolean(args["all-signposts"]),
    subsystem: args.subsystem ?? configuredSubsystem(),
    logOut: args["log-out"] ?? null,
  };
  const filter = new ProcessFilter(args);
  const runs = readToc(trace);
  if (!runs.length) fail("no runs in trace");
  const run = runs.find((entry) => entry.number === args.run) ?? runs.at(-1);
  const schemas = new Set(run.schemas);
  const summary = {
    trace,
    run: run.number,
    runs: runs.map((entry) => entry.number),
    device: pick(run.device, ["name", "model", "os-version", "platform"]),
    process: pick(run.process, ["name", "pid", "arguments"]),
    filter: { pid: args.pid ?? null, process: args.process ?? null },
    window: options.window,
    schemas: run.schemas,
  };
  const handlers = [
    ["timeProfile", schemas.has(Schema.timeProfile) ? Schema.timeProfile : Schema.timeSample, summarizeTimeProfile],
    ["hangs", Schema.hangs, summarizeHangs],
    ["signposts", Schema.signposts, summarizeSignposts],
    ["perfLog", Schema.log, summarizeLog],
    ...[...GENERIC_SCHEMAS, ...(args.schema ?? [])].map((schema) => [schema, schema, summarizeGeneric]),
  ];
  for (const [key, schema, handler] of handlers) {
    if (!schemas.has(schema)) continue;
    try {
      const xpath = `/trace-toc/run[@number="${run.number}"]/data/table[@schema="${schema}"]`;
      summary[key] = handler(new Table(exportXml(trace, ["--xpath", xpath])), options, filter);
    } catch (error) {
      summary[key] = { error: error.message };
    }
  }
  if (filter.active && !summary.timeProfile?.matchedSamples) summary.processesSeen = filter.topSeen(10);
  console.log(JSON.stringify(summary, null, 1));
}

main();
