import { atlasSleep } from "./sleep.js";
import { PALETTE, gradientLine } from "./theme.js";

export const ATLAS_FIGLET = [
  " █████╗ ████████╗██╗      █████╗ ███████╗",
  "██╔══██╗╚══██╔══╝██║     ██╔══██╗██╔════╝",
  "███████║   ██║   ██║     ███████║███████╗",
  "██╔══██║   ██║   ██║     ██╔══██║╚════██║",
  "██║  ██║   ██║   ███████╗██║  ██║███████║",
  "╚═╝  ╚═╝   ╚═╝   ╚══════╝╚═╝  ╚═╝╚══════╝"
];

export function renderLogoLines({ color }) {
  return ATLAS_FIGLET.map((row) => gradientLine(row, PALETTE.orange, PALETTE.yellow, { color }));
}

export async function animateLogo(stream, { color }) {
  for (const line of renderLogoLines({ color })) {
    stream.write(`${line}\n`);
    await atlasSleep(70);
  }
}
