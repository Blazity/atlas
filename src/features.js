export const featureNames = ["plans", "research", "decisions", "results", "managedSkills", "agentSymlinks"];

export const defaultFeatures = Object.fromEntries(featureNames.map((name) => [name, true]));

export const minimalFeatures = Object.fromEntries(featureNames.map((name) => [name, false]));

const artifactFeatureMap = {
  plans: "plans",
  research: "research",
  decisions: "decisions",
  adrs: "decisions",
  results: "results",
  skills: "managedSkills"
};

export function featuresForProfile(profile = "full") {
  return profile === "minimal" ? { ...minimalFeatures } : { ...defaultFeatures };
}

export function effectiveFeatures(config) {
  return { ...defaultFeatures, ...config.features };
}

export function isFeatureEnabled(config, featureName) {
  return effectiveFeatures(config)[featureName] !== false;
}

export function disabledFeatureNames(config) {
  const features = effectiveFeatures(config);
  return featureNames.filter((featureName) => features[featureName] === false);
}

export function isArtifactEnabled(config, artifactKey) {
  const featureName = artifactFeatureMap[artifactKey];
  return featureName === undefined || isFeatureEnabled(config, featureName);
}

export function isAliasTargetEnabled(config, target) {
  const featureName = artifactFeatureMap[target];
  return featureName === undefined || isFeatureEnabled(config, featureName);
}
