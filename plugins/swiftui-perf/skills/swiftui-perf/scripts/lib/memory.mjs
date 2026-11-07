import fs from "node:fs";
import { MemoryArea } from "./constants.mjs";
import { readJson, writeJson } from "./files.mjs";

const SCHEMA_VERSION = 1;
const SECRET_PATTERNS = [
  /\b(password|passwd|secret|api[_-]?key|access[_-]?token|refresh[_-]?token)\s*[:=]/i,
  /\bBearer\s+[\w.-]{10,}/,
  /\beyJ[\w-]{10,}\.[\w-]{10,}/,
  /\b[A-Za-z0-9+/]{40,}={0,2}\b/,
];

const today = () => new Date().toISOString().slice(0, 10);
const normalize = (text) => text.toLowerCase().replace(/\s+/g, " ").trim();
const emptyMemory = () => ({ version: SCHEMA_VERSION, routes: {}, obstacles: [], facts: [] });

export function assertNoSecret(...texts) {
  const leaked = texts.filter(Boolean).find((text) => SECRET_PATTERNS.some((pattern) => pattern.test(text)));
  if (leaked) throw new Error("this text looks like a credential or token; memory never stores secrets");
}

export function assertArea(area) {
  if (!Object.values(MemoryArea).includes(area)) throw new Error(`unknown area ${area}; use one of: ${Object.values(MemoryArea).join(", ")}`);
}

function nextId(prefix, items) {
  const numbers = items.map((item) => Number(item.id.slice(prefix.length))).filter(Number.isFinite);
  return `${prefix}${Math.max(0, ...numbers) + 1}`;
}

export class ProjectMemory {
  constructor(file) {
    this.file = file;
    this.data = fs.existsSync(file) ? { ...emptyMemory(), ...readJson(file) } : emptyMemory();
  }

  save() {
    writeJson(this.file, this.data);
  }

  setRoute(screen, { steps, deepLink = null, readyWhen = null }) {
    assertNoSecret(screen, deepLink, readyWhen, ...steps);
    const previous = this.data.routes[screen];
    this.data.routes[screen] = {
      steps,
      deepLink,
      readyWhen,
      verified: today(),
      uses: (previous?.uses ?? 0) + 1,
    };
    return this.data.routes[screen];
  }

  confirmRoute(screen) {
    const route = this.data.routes[screen];
    if (!route) throw new Error(`no route for ${screen}`);
    route.verified = today();
    route.uses += 1;
    return route;
  }

  addObstacle({ area, problem, fix, screen = null }) {
    assertArea(area);
    assertNoSecret(problem, fix);
    const existing = this.data.obstacles.find((item) => item.area === area && normalize(item.problem) === normalize(problem));
    if (existing) {
      Object.assign(existing, { fix: fix || existing.fix, lastSeen: today(), seen: existing.seen + 1, screen: screen ?? existing.screen });
      return existing;
    }
    const obstacle = { id: nextId("o", this.data.obstacles), area, problem, fix, screen, firstSeen: today(), lastSeen: today(), seen: 1 };
    this.data.obstacles.push(obstacle);
    return obstacle;
  }

  addFact({ area, text }) {
    assertArea(area);
    assertNoSecret(text);
    const existing = this.data.facts.find((item) => item.area === area && normalize(item.text) === normalize(text));
    if (existing) {
      existing.lastSeen = today();
      return existing;
    }
    const fact = { id: nextId("f", this.data.facts), area, text, lastSeen: today() };
    this.data.facts.push(fact);
    return fact;
  }

  remove(id) {
    const before = this.data.obstacles.length + this.data.facts.length + Object.keys(this.data.routes).length;
    this.data.obstacles = this.data.obstacles.filter((item) => item.id !== id);
    this.data.facts = this.data.facts.filter((item) => item.id !== id);
    delete this.data.routes[id];
    return before !== this.data.obstacles.length + this.data.facts.length + Object.keys(this.data.routes).length;
  }

  render({ screen = null, area = null } = {}) {
    const lines = ["# Project memory (swiftui-perf)", ""];
    const routes = Object.entries(this.data.routes).filter(([name]) => !screen || name === screen);
    if (routes.length) {
      lines.push("## How to reach screens", "");
      for (const [name, route] of routes) {
        lines.push(`### ${name} (verified ${route.verified}, used ${route.uses}x)`);
        if (route.deepLink) lines.push(`- Deep link: \`${route.deepLink}\``);
        route.steps.forEach((step, index) => lines.push(`${index + 1}. ${step}`));
        if (route.readyWhen) lines.push(`- Ready when: ${route.readyWhen}`);
        lines.push("");
      }
    } else if (screen) lines.push(`No route for ${screen} yet. Record it when you reach the screen.`, "");
    const relevant = (item) => (!area || item.area === area) && (!screen || !item.screen || item.screen === screen);
    const obstacles = this.data.obstacles.filter(relevant).sort((a, b) => b.seen - a.seen);
    if (obstacles.length) {
      lines.push("## Known obstacles and fixes", "");
      for (const item of obstacles) lines.push(`- [${item.id}, ${item.area}${item.screen ? `, ${item.screen}` : ""}, seen ${item.seen}x, last ${item.lastSeen}] ${item.problem} → ${item.fix}`);
      lines.push("");
    }
    const facts = this.data.facts.filter((item) => !area || item.area === area);
    if (facts.length) {
      lines.push("## Project facts", "");
      for (const item of facts) lines.push(`- [${item.id}, ${item.area}] ${item.text}`);
      lines.push("");
    }
    if (lines.length === 2) lines.push("Empty. Record routes, obstacles and facts as you learn them.");
    return lines.join("\n");
  }
}
