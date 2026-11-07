import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { DEFAULT_WORK_DIR } from "./constants.mjs";
import { findBundles, grepSwift } from "./files.mjs";

export const NETWORK_INSPECTORS = Object.freeze({
  netfox: /NFX\.sharedInstance\(\)\.start\(\)/,
  Pulse: /(URLSessionProxyDelegate|Experimental\.URLSessionProxy|NetworkLogger\.enableProxy)/,
  Atlantis: /Atlantis\.start\(/,
  Wormholy: /Wormholy\.(isEnabled|shakeEnabled)/,
  FLEX: /FLEXManager\.shared\.(showExplorer|isNetworkDebuggingEnabled)/,
  Bagel: /Bagel\.start\(/,
  "custom URLProtocol": /URLProtocol\.registerClass\(/,
});

export const SECURITY_GATES = Object.freeze({
  IOSSecuritySuite: /IOSSecuritySuite\.(amIJailbroken|amIDebugged|denyDebugger|amIReverseEngineered)/,
  "anti-debug": /(PT_DENY_ATTACH|ptrace\(|P_TRACED)/,
  jailbreak: /(jailbr[eo]ak|isJailBroken|cydia:\/\/)/i,
  debugger: /(isDebuggerAttached|amIDebugged|debuggerAttached)/i,
  tamper: /(tamper|integrityCheck)/i,
});

export const CODE_SHAPES = Object.freeze({
  urlSessionDelegate: /class\s+\w+[^{]*URLSession(Data|Task)?Delegate/,
  alamofire: /(import Alamofire|Session\(\s*configuration)/,
  navigation: /func\s+(navigate|push|deepLink|route|show)\w*\(/,
  appEntry: /^@main|@UIApplicationMain/,
  metricsCallback: /didFinishCollecting\s+metrics/,
});

const DEPLOYMENT_TARGET = /IPHONEOS_DEPLOYMENT_TARGET = ([0-9.]+);/g;

function deploymentTargets(root, projects) {
  const versions = new Set();
  for (const project of projects) {
    const file = path.join(root, project, "project.pbxproj");
    if (!fs.existsSync(file)) continue;
    for (const [, version] of fs.readFileSync(file, "utf8").matchAll(DEPLOYMENT_TARGET)) versions.add(version);
  }
  return [...versions].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

export function bootedSimulators() {
  try {
    const output = execFileSync("xcrun", ["simctl", "list", "devices", "booted", "-j"], { encoding: "utf8", timeout: 30_000 });
    return Object.entries(JSON.parse(output).devices ?? {}).flatMap(([runtime, devices]) =>
      devices.map(({ name, udid }) => ({ name, udid, runtime: runtime.split(".").pop() })),
    );
  } catch {
    return [];
  }
}

export function detectProject(root) {
  const skip = [DEFAULT_WORK_DIR];
  const { workspaces, projects } = findBundles(root);
  return {
    workspaces: workspaces.sort(),
    projects: projects.sort(),
    deploymentTargets: deploymentTargets(root, projects),
    bootedSimulators: bootedSimulators(),
    code: grepSwift(root, CODE_SHAPES, { skip }),
    networkInspectors: grepSwift(root, NETWORK_INSPECTORS, { skip }),
    securityGates: grepSwift(root, SECURITY_GATES, { skip }),
  };
}
