export const PALETTE = {
  orange: "#FF6A33",
  blue: "#8A8EF1",
  green: "#BBED80",
  yellow: "#FFC800",
  fg: "#E6E8EB",
  soft: "#969CA5",
  dim: "#6B7178"
};

const RESET = "\x1b[0m";

function toRgb(hex) {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function makeTheme({ color }) {
  const wrap = (hex) => {
    const [r, g, b] = toRgb(hex);
    return (text) => (color ? `\x1b[38;2;${r};${g};${b}m${text}${RESET}` : String(text));
  };
  return Object.fromEntries(Object.entries(PALETTE).map(([name, hex]) => [name, wrap(hex)]));
}
