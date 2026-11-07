import { GUARDED_LINE, MARKER_LINE, Swift } from "./constants.mjs";

export const indentOf = (line) => line.slice(0, line.length - line.trimStart().length);
export const sameLine = (a, b) => a.trim() === String(b ?? "").trim();
export const countMatches = (lines, target) => lines.filter((line) => sameLine(line, target)).length;

function indexOfExactlyOne(lines, target) {
  const count = countMatches(lines, target);
  if (count !== 1) throw new Error(`expected 1 line \`${String(target).trim()}\`, found ${count}`);
  return lines.findIndex((line) => sameLine(line, target));
}

export function insertAfter(lines, anchor, text) {
  const index = indexOfExactlyOne(lines, anchor);
  const opensBlock = lines[index].trimEnd().endsWith("{");
  const indent = indentOf(lines[index]) + (opensBlock ? Swift.indentStep : "");
  return [...lines.slice(0, index + 1), indent + text, ...lines.slice(index + 1)];
}

export function replaceLine(lines, from, to) {
  const index = indexOfExactlyOne(lines, from);
  return lines.with(index, indentOf(lines[index]) + to.trim());
}

export function guardLine(lines, target) {
  const index = indexOfExactlyOne(lines, target);
  return lines.with(index, Swift.guardLine(indentOf(lines[index]), target.trim()));
}

export const unguard = (lines) => lines.map((line) => line.replace(GUARDED_LINE, "$1$2"));
export const dropMarkerLines = (lines) => lines.filter((line) => !MARKER_LINE.test(line));
export const countMarkerLines = (lines) => lines.filter((line) => MARKER_LINE.test(line)).length;
