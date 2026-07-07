export const findingCodeSeverities = {
  "alias-root-collision": "manual",
  "alias-target-collision": "manual",
  "atlas-version-ahead": "manual",
  "atlas-version-behind": "advisory",
  "broken-root-pointer": "manual",
  "claude-shim-conflict": "manual",
  "config-migration-available": "fixable",
  "config-migration-conflict": "advisory",
  "context-size": "advisory",
  "customized-skill": "advisory",
  "directory-collision": "manual",
  "empty-language": "advisory",
  "empty-memory": "advisory",
  "feature-available": "advisory",
  "file-collision": "manual",
  "invalid-config": "manual",
  "invalid-lockfile": "manual",
  "invalid-suppression": "manual",
  "legacy-skill-directory": "advisory",
  "managed-block-conflict": "manual",
  "misplaced-alias-file": "fixable",
  "misplaced-legacy-skill": "fixable",
  "missing-claude-shim": "fixable",
  "missing-compact-skill": "fixable",
  "missing-config": "fixable",
  "missing-customization-instructions": "fixable",
  "missing-directory": "fixable",
  "missing-gitkeep": "fixable",
  "missing-language": "fixable",
  "missing-lockfile": "fixable",
  "missing-managed-block": "fixable",
  "missing-memory-readme": "fixable",
  "missing-review-skill": "fixable",
  "missing-root-pointer": "fixable",
  "missing-setup-skill": "fixable",
  "missing-skill-link": "fixable",
  "setup-pending": "advisory",
  "skill-link-collision": "manual",
  "stale-compact-skill": "fixable",
  "stale-customization-instructions": "fixable",
  "stale-managed-block": "fixable",
  "stale-review-skill": "fixable",
  "stale-setup-skill": "fixable",
  "unresolved-placeholder": "advisory",
  "update-available": "advisory",
  "update-check-failed": "advisory",
  "wrong-root-pointer": "fixable",
  "wrong-skill-link-target": "fixable"
};

export function findingCodeSeverity(code) {
  return findingCodeSeverities[code] ?? null;
}

export function isSuppressibleFindingCode(code) {
  const severity = findingCodeSeverity(code);
  return severity === "advisory" || severity === "fixable";
}
