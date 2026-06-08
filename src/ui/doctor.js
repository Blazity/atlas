import { makeTheme } from "./theme.js";

export function doctorMark({ color }) {
  const theme = makeTheme({ color });
  return `${theme.orange("▲ ATLAS")} ${theme.dim("doctor")}`;
}

export function colorizeDoctorOutput(text, { color }) {
  if (!color) {
    return text;
  }
  const theme = makeTheme({ color });
  return text
    .replace(/No issues found\./g, (match) => theme.green(match))
    .replace(/^(Fixable:|Applied fixes:)$/gm, (match) => theme.green(match))
    .replace(/^(Manual:)$/gm, (match) => theme.orange(match))
    .replace(/^(- \[[^\]]+\])/gm, (match) => theme.yellow(match));
}
