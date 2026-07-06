import { loadConfig } from "./doctor.js";
import { compareVersions, packageVersion, parseVersion } from "./version.js";

const packageName = "@blazity-atlas/core";
const registryUrl = `https://registry.npmjs.org/${packageName}`;
const timeoutMs = 3000;

export async function fetchLatestVersion(fetchImpl = globalThis.fetch) {
  const response = await fetchImpl(registryUrl, {
    headers: { accept: "application/vnd.npm.install-v1+json" },
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!response.ok) {
    throw new Error(`npm registry responded ${response.status}`);
  }
  const body = await response.json();
  const latest = body?.["dist-tags"]?.latest;
  if (!parseVersion(latest)) {
    throw new Error("npm registry response had no parseable dist-tags.latest");
  }
  return latest;
}

export async function runUpdateCheck({ cwd, fetchImpl }) {
  let latest;
  try {
    latest = await fetchLatestVersion(fetchImpl);
  } catch (error) {
    return {
      exitCode: 0,
      stdout: `Atlas update check\n\nCould not reach the npm registry (${error.message}). Update check skipped.\n`,
      stderr: ""
    };
  }

  const lines = [`Current CLI: ${packageVersion}`, `Latest:      ${latest}`];
  const loaded = await loadConfig(cwd);
  if (loaded.exists && typeof loaded.config.atlasVersion === "string") {
    lines.push(`Workspace:   ${loaded.config.atlasVersion} (atlasVersion stamp)`);
  }

  const comparison = compareVersions(latest, packageVersion);
  const status = comparison > 0
    ? `Update available. Upgrade and repair managed files in one change:\n  npx --yes ${packageName}@${latest} doctor --fix`
    : comparison === 0
      ? "Already up to date."
      : `Running ${packageVersion}, ahead of the published latest (${latest}).`;

  return { exitCode: 0, stdout: `Atlas update check\n\n${lines.join("\n")}\n\n${status}\n`, stderr: "" };
}

// Advisory-shaped finding for doctor --check-updates; never affects exit codes.
export async function updateAdvisoryFinding(fetchImpl) {
  try {
    const latest = await fetchLatestVersion(fetchImpl);
    if (compareVersions(latest, packageVersion) > 0) {
      return {
        code: "update-available",
        message: `${packageName}@${latest} is available (running ${packageVersion}) — upgrade and run doctor --fix in the same change`,
        severity: "advisory",
        fixable: false
      };
    }
    return null;
  } catch (error) {
    return {
      code: "update-check-failed",
      message: `could not check npm for a newer version: ${error.message}`,
      severity: "advisory",
      fixable: false
    };
  }
}
