export function detectMode({ stdoutIsTTY, stdinIsTTY, env = {}, yes = false, ci = false } = {}) {
  const tty = Boolean(stdoutIsTTY && stdinIsTTY);
  const ciActive = ci || Boolean(env.CI);
  const interactive = tty && !yes && !ciActive;
  const color = env.NO_COLOR == null && (tty || env.FORCE_COLOR != null);
  return { interactive, color };
}
