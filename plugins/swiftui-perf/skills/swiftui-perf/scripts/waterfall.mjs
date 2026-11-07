#!/usr/bin/env node
import fs from "node:fs";
import { fail, parseArgs } from "./lib/cli.mjs";
import { ProjectConfig, findConfig } from "./lib/config.mjs";
import { HttpStatus, Log } from "./lib/constants.mjs";

const USAGE = "waterfall.mjs [log|-] [--json] [--rows] [--screen NAME] [--auth-path REGEX]...";
const FIELD = /(\w+)=(\S+)/g;
const P95 = 0.95;
const { Phase } = Log;

const toNumber = (value) => (value === undefined || value === "-" ? null : Number.isFinite(Number(value)) ? Number(value) : null);
const round1 = (value) => (value == null ? null : Math.round(value * 10) / 10);
const requestKey = (net) => `${net.method ?? "-"} ${net.path ?? "-"}`;

function parseLines(text) {
  const screens = [];
  const nets = [];
  for (const raw of text.split("\n")) {
    const index = raw.indexOf(Log.prefix);
    if (index < 0) continue;
    const body = raw.slice(index + Log.prefix.length).trim();
    const fields = Object.fromEntries([...body.matchAll(FIELD)].map(([, key, value]) => [key, value]));
    if (body.startsWith(Log.netPrefix)) {
      const start = toNumber(fields.start);
      const total = toNumber(fields.total);
      if (start != null && total != null) nets.push({ ...fields, start, total, end: start + total, status: toNumber(fields.status) });
    } else if (fields.screen && fields.phase && toNumber(fields.t) != null) {
      screens.push({ screen: fields.screen, phase: fields.phase, t: toNumber(fields.t) });
    }
  }
  return { screens: screens.sort((a, b) => a.t - b.t), nets: nets.sort((a, b) => a.start - b.start) };
}

function buildOpens(screens) {
  const opens = [];
  const pending = [];
  for (const event of screens) {
    if (event.phase === Phase.requested) {
      const open = { screen: event.screen, requested: event.t, firstAppear: null, contentReady: null, events: [] };
      opens.push(open);
      pending.push(open);
      continue;
    }
    const open = pending.findLast((item) => item.screen === event.screen);
    if (!open) continue;
    if (event.phase === Phase.firstAppear) open.firstAppear ??= event.t;
    else if (event.phase === Phase.contentReady) {
      open.contentReady = event.t;
      pending.splice(pending.indexOf(open), 1);
    } else if (event.phase.startsWith(Phase.eventPrefix)) {
      open.events.push({ name: event.phase.slice(Phase.eventPrefix.length), at: round1(event.t - open.requested) });
    }
  }
  return opens;
}

function serialDepth(requests) {
  const depth = [];
  requests.forEach((request, index) => {
    const before = requests.slice(0, index).map((other, j) => (other.end <= request.start ? depth[j] : 0));
    depth.push(1 + Math.max(0, ...before));
  });
  return Math.max(0, ...depth);
}

function classifyRetries(requests, authPatterns) {
  const isAuth = (net) => authPatterns.some((pattern) => pattern.test(net.path ?? ""));
  const unauthorized = new Set(requests.filter((net) => net.status === HttpStatus.unauthorized).map(requestKey));
  const retries = requests.filter((net) => net.status !== HttpStatus.unauthorized && unauthorized.has(requestKey(net)));
  const counts = new Map();
  for (const net of requests) {
    if (net.status === HttpStatus.unauthorized || isAuth(net)) continue;
    counts.set(requestKey(net), (counts.get(requestKey(net)) ?? 0) + 1);
  }
  const retryKeys = new Set(retries.map(requestKey));
  const duplicates = [...counts].filter(([key, count]) => count - (retryKeys.has(key) ? 1 : 0) > 1).map(([key]) => key).sort();
  return {
    duplicates,
    authRetries: [...unauthorized].sort(),
    authCalls: requests.filter(isAuth).map(requestKey),
  };
}

function analyseOpen(open, nextRequested, nets, authPatterns) {
  const windowEnd = open.contentReady ?? nextRequested ?? Infinity;
  const inside = nets.filter((net) => net.start >= open.requested && net.start <= windowEnd);
  const gating = open.contentReady == null ? inside : inside.filter((net) => net.end <= open.contentReady);
  const late = inside.filter((net) => !gating.includes(net));
  const firstStart = gating[0]?.start ?? null;
  const lastEnd = gating.length ? Math.max(...gating.map((net) => net.end)) : null;
  return {
    screen: open.screen,
    requested: open.requested,
    firstRender: open.firstAppear == null ? null : round1(open.firstAppear - open.requested),
    timeToContent: open.contentReady == null ? null : round1(open.contentReady - open.requested),
    clientDelay: firstStart == null ? null : round1(firstStart - open.requested),
    criticalPath: firstStart == null ? null : round1(lastEnd - firstStart),
    uiTail: lastEnd == null || open.contentReady == null ? null : round1(open.contentReady - lastEnd),
    requests: inside.length,
    gatingRequests: gating.length,
    lateRequests: late.map(requestKey),
    serialDepth: serialDepth(gating),
    newConnections: gating.filter((net) => net.reused === "0").length,
    ...classifyRetries(inside, authPatterns),
    events: open.events,
    rows: inside.map((net) => ({
      offset: round1(net.start - open.requested),
      gating: gating.includes(net),
      method: net.method, path: net.path, status: net.status, proto: net.proto, reused: net.reused,
      dns: net.dns, connect: net.connect, tls: net.tls, ttfb: net.ttfb, download: net.download, total: net.total,
    })),
  };
}

function stats(values) {
  const list = values.filter((value) => value != null).sort((a, b) => a - b);
  if (!list.length) return null;
  const middle = Math.floor(list.length / 2);
  const median = list.length % 2 ? list[middle] : (list[middle - 1] + list[middle]) / 2;
  const mean = list.reduce((sum, value) => sum + value, 0) / list.length;
  const sd = list.length > 1 ? Math.sqrt(list.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (list.length - 1)) : 0;
  return { n: list.length, p50: round1(median), p95: round1(list[Math.min(list.length - 1, Math.round(P95 * (list.length - 1)))]), sd: round1(sd) };
}

const formatStat = (stat) => (stat ? `${stat.p50} / ${stat.p95} / ${stat.sd} (n=${stat.n})` : "-");

const COLUMNS = [
  ["First render", "firstRender"],
  ["Time to content", "timeToContent"],
  ["Client delay", "clientDelay"],
  ["Critical path", "criticalPath"],
  ["UI tail", "uiTail"],
];
const ROW_COLUMNS = ["offset", "gating", "method", "path", "status", "proto", "reused", "dns", "connect", "tls", "ttfb", "download", "total"];

function listSection(title, entries) {
  return entries.length ? ["", `## ${title}`, "", ...entries.map((entry) => `- ${entry}`)] : [];
}

function markdown(results, withRows) {
  const byScreen = Map.groupBy(results, (result) => result.screen);
  const lines = ["# Screen open waterfall", "", "Values: p50 / p95 / sd in ms. Critical path and UI tail use gating requests only (end before content ready).", ""];
  lines.push(`| Screen | Opens | ${COLUMNS.map(([title]) => title).join(" | ")} | Requests p50 | Serial depth max |`);
  lines.push(`|${"---|".repeat(COLUMNS.length + 4)}`);
  for (const [screen, items] of byScreen) {
    const cells = COLUMNS.map(([, key]) => formatStat(stats(items.map((item) => item[key]))));
    lines.push(`| ${screen} | ${items.length} | ${cells.join(" | ")} | ${stats(items.map((item) => item.requests))?.p50 ?? 0} | ${Math.max(...items.map((item) => item.serialDepth))} |`);
  }
  const collect = (key) => [...new Set(results.flatMap((result) => result[key].map((value) => `${result.screen}: ${value}`)))].sort();
  lines.push(...listSection("Duplicate requests in one open (auth retries excluded)", collect("duplicates")));
  lines.push(...listSection("401 then retry", collect("authRetries")));
  lines.push(...listSection("Requests that end after content ready (not gating)", collect("lateRequests")));
  if (withRows) {
    for (const result of results.filter((item) => item.rows.length)) {
      lines.push("", `## ${result.screen} at ${result.requested.toFixed(0)} (content ${result.timeToContent} ms)`, "");
      lines.push(`| ${ROW_COLUMNS.join(" | ")} |`, `|${"---|".repeat(ROW_COLUMNS.length)}`);
      for (const row of result.rows) lines.push(`| ${ROW_COLUMNS.map((key) => row[key] ?? "-").join(" | ")} |`);
    }
  }
  return `${lines.join("\n")}\n`;
}

function authPatterns(args) {
  const configFile = findConfig();
  const configured = configFile ? ProjectConfig.load(configFile).network.authPaths : [];
  return [...configured, ...(args["auth-path"] ?? [])].map((pattern) => new RegExp(pattern));
}

function main() {
  const args = parseArgs(process.argv.slice(2), { flags: ["json", "rows"], options: ["screen"], lists: ["auth-path"] });
  const [source = "-"] = args.positional;
  const { screens, nets } = parseLines(fs.readFileSync(source === "-" ? 0 : source, "utf8"));
  const opens = buildOpens(screens);
  const patterns = authPatterns(args);
  const results = opens
    .map((open, index) => analyseOpen(open, opens[index + 1]?.requested ?? null, nets, patterns))
    .filter((result) => !args.screen || result.screen === args.screen);
  if (!results.length) fail(`no PERF screen lines found\nusage: ${USAGE}`);
  process.stdout.write(args.json ? `${JSON.stringify(results, null, 1)}\n` : markdown(results, args.rows));
}

main();
