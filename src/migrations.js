import { compareVersions, parseVersion } from "./version.js";

const pre04AliasMigrationCutoff = "0.4.0";
const pre04AliasRules = [
  {
    oldAlias: "docs/superpowers/plans",
    oldTarget: "plans",
    newAlias: "docs/plans",
    newTarget: "plans"
  },
  {
    oldAlias: "docs/superpowers/specs",
    oldTarget: "research",
    newAlias: "docs/specs",
    newTarget: "research"
  }
];

export const configMigrations = [
  {
    id: "pre-0.4-path-aliases",
    description: "replace pre-0.4 docs/superpowers path aliases with neutral docs aliases",
    apply(config) {
      return migratePre04PathAliases(config);
    }
  }
];

export function planConfigMigrations(config) {
  let nextConfig = cloneConfig(config);
  const applied = [];
  const conflicts = [];

  for (const migration of configMigrations) {
    const result = migration.apply(nextConfig);
    nextConfig = result.config;
    if (result.changed) {
      applied.push({ id: migration.id, description: migration.description });
    }
    conflicts.push(...result.conflicts.map((conflict) => ({ migrationId: migration.id, ...conflict })));
  }

  return { config: nextConfig, applied, conflicts };
}

function migratePre04PathAliases(config) {
  if (!shouldRunPre04AliasMigration(config)) {
    return { config: cloneConfig(config), changed: false, conflicts: [] };
  }

  const nextConfig = cloneConfig(config);
  const pathAliases = { ...(nextConfig.pathAliases ?? {}) };
  const conflicts = [];
  let changed = false;

  for (const rule of pre04AliasRules) {
    if (!(rule.oldAlias in pathAliases)) {
      continue;
    }

    const currentValue = pathAliases[rule.oldAlias];
    if (currentValue !== rule.oldTarget) {
      conflicts.push({
        oldDefault: `${rule.oldAlias} -> ${rule.oldTarget}`,
        newDefault: `${rule.newAlias} -> ${rule.newTarget}`,
        currentValue
      });
      continue;
    }

    delete pathAliases[rule.oldAlias];
    if (pathAliases[rule.newAlias] === undefined) {
      pathAliases[rule.newAlias] = rule.newTarget;
    }
    changed = true;
  }

  nextConfig.pathAliases = pathAliases;
  return { config: nextConfig, changed, conflicts };
}

function shouldRunPre04AliasMigration(config) {
  if (config.atlasVersion === undefined) {
    return true;
  }
  if (!parseVersion(config.atlasVersion)) {
    return false;
  }
  return compareVersions(config.atlasVersion, pre04AliasMigrationCutoff) < 0;
}

function cloneConfig(config) {
  return JSON.parse(JSON.stringify(config));
}
