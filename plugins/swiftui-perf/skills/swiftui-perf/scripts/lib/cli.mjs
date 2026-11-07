import path from "node:path";
import { pathToFileURL } from "node:url";
import { ExitCode } from "./constants.mjs";

export function fail(message, code = ExitCode.fail) {
  process.stderr.write(`${message}\n`);
  process.exit(code);
}

export function usage(text) {
  fail(`usage: ${text}`, ExitCode.usage);
}

export function isMain(meta) {
  return Boolean(process.argv[1]) && meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
}

export function parseArgs(argv, { flags = [], options = [], lists = [] } = {}) {
  const parsed = { positional: [], rest: [] };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--") {
      parsed.rest = argv.slice(index + 1);
      break;
    }
    if (!arg.startsWith("--")) {
      parsed.positional.push(arg);
      continue;
    }
    const name = arg.slice(2);
    if (flags.includes(name)) parsed[name] = true;
    else if (options.includes(name)) parsed[name] = argv[++index];
    else if (lists.includes(name)) (parsed[name] ??= []).push(argv[++index]);
    else fail(`unknown option ${arg}`, ExitCode.usage);
  }
  return parsed;
}

export function runCommands(commands, usageText) {
  const [name, ...rest] = process.argv.slice(2);
  const command = commands[name];
  if (!command) usage(usageText);
  Promise.resolve(command(rest)).then((code) => process.exit(code ?? ExitCode.ok), (error) => fail(error.message));
}
