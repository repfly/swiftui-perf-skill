#!/usr/bin/env node
import { ProjectConfig } from "./lib/config.mjs";
import { fail, parseArgs, runCommands, usage } from "./lib/cli.mjs";
import { ExitCode } from "./lib/constants.mjs";
import { ProjectMemory } from "./lib/memory.mjs";

const USAGE = `memory.mjs <command>
  show [--screen <Screen>] [--area <area>]
  route <Screen> --step "<step>"... [--deeplink <url>] [--ready "<what shows when the screen is ready>"]
  confirm <Screen>
  obstacle --area <area> --problem "<what went wrong>" --fix "<what worked>" [--screen <Screen>]
  fact --area <area> "<fact>"
  remove <id | Screen>`;

const open = () => {
  const config = ProjectConfig.load();
  return new ProjectMemory(config.resolve(config.memoryFile));
};

const change = (action) => (argv) => {
  const memory = open();
  try {
    const result = action(memory, argv);
    memory.save();
    console.log(JSON.stringify(result));
  } catch (error) {
    fail(error.message);
  }
};

runCommands(
  {
    show: (argv) => {
      const args = parseArgs(argv, { options: ["screen", "area"] });
      console.log(open().render(args));
    },
    route: change((memory, argv) => {
      const args = parseArgs(argv, { options: ["deeplink", "ready"], lists: ["step"] });
      const [screen] = args.positional;
      if (!screen || !args.step?.length) usage(USAGE);
      return memory.setRoute(screen, { steps: args.step, deepLink: args.deeplink ?? null, readyWhen: args.ready ?? null });
    }),
    confirm: change((memory, argv) => memory.confirmRoute(parseArgs(argv).positional[0] ?? "")),
    obstacle: change((memory, argv) => {
      const args = parseArgs(argv, { options: ["area", "problem", "fix", "screen"] });
      if (!args.area || !args.problem || !args.fix) usage(USAGE);
      return memory.addObstacle(args);
    }),
    fact: change((memory, argv) => {
      const args = parseArgs(argv, { options: ["area"] });
      const text = args.positional.join(" ");
      if (!args.area || !text) usage(USAGE);
      return memory.addFact({ area: args.area, text });
    }),
    remove: (argv) => {
      const memory = open();
      if (!memory.remove(parseArgs(argv).positional[0] ?? "")) return ExitCode.fail;
      memory.save();
    },
  },
  USAGE,
);
