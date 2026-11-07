#!/usr/bin/env node
import { ProjectConfig } from "./lib/config.mjs";
import { parseArgs, runCommands } from "./lib/cli.mjs";
import { ExitCode } from "./lib/constants.mjs";

const print = (value) => console.log(typeof value === "object" ? JSON.stringify(value) : String(value));

runCommands(
  {
    get: (argv) => {
      const [key] = parseArgs(argv).positional;
      const value = ProjectConfig.load().value(key ?? "");
      if (value === null) return ExitCode.fail;
      print(value);
    },
    path: () => print(ProjectConfig.load().file),
    root: () => print(ProjectConfig.load().root),
    dump: () => console.log(JSON.stringify(ProjectConfig.load(), null, 2)),
  },
  "config.mjs get <dotted.key> | path | root | dump",
);
