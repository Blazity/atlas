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
  let inAdvisorySection = false;
  return text
    .split("\n")
    .map((line) => {
      if (/^(Fixable:|Applied fixes:)$/.test(line)) {
        inAdvisorySection = false;
        return theme.green(line);
      }
      if (/^Manual:$/.test(line)) {
        inAdvisorySection = false;
        return theme.orange(line);
      }
      if (/^Advisory:$/.test(line)) {
        inAdvisorySection = true;
        return theme.blue(line);
      }
      if (/^- \[[^\]]+\]/.test(line)) {
        const paint = inAdvisorySection ? theme.blue : theme.yellow;
        return line.replace(/^(- \[[^\]]+\])/, (match) => paint(match));
      }
      return line.replace(/No issues found\./g, (match) => theme.green(match));
    })
    .join("\n");
}
