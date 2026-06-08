import { atlasSleep } from "./sleep.js";
import { PALETTE, gradientLine, shimmerLine } from "./theme.js";

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

const SWEEP_FRAMES = 18;
const SWEEP_DELAY_MS = 50;
const SWEEP_CYCLES = 2;

export async function animateLogo(stream, { color }) {
  const settled = renderLogoLines({ color });

  // Cursor-control redraw only makes sense on a real TTY; off a TTY (pipe, file,
  // CI) we'd leak escape codes, so just paint the settled logo once.
  if (!color || !stream.isTTY) {
    for (const line of settled) {
      stream.write(`${line}\n`);
    }
    return;
  }

  const cursorUp = `\x1b[${ATLAS_FIGLET.length}A`;
  const clearLine = "\x1b[2K";

  for (const line of ATLAS_FIGLET) {
    stream.write(`${shimmerLine(line, 0, { color })}\n`);
  }

  for (let frame = 1; frame <= SWEEP_FRAMES; frame += 1) {
    await atlasSleep(SWEEP_DELAY_MS);
    const phase = (frame / SWEEP_FRAMES) * SWEEP_CYCLES;
    stream.write(cursorUp);
    for (const line of ATLAS_FIGLET) {
      stream.write(`${clearLine}${shimmerLine(line, phase, { color })}\n`);
    }
  }

  stream.write(cursorUp);
  for (const line of settled) {
    stream.write(`${clearLine}${line}\n`);
  }
}
