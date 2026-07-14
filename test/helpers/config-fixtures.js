import { createConfigForTemplate } from "../../src/config.js";
import { defaultFeatures } from "../../src/features.js";

export const configValidationFixtures = {
  accept: [
    createConfigForTemplate("standard"),
    legacyConfigFixture(),
    { ...createConfigForTemplate("standard"), doctor: { suppress: ["setup-pending"] } },
    { ...createConfigForTemplate("standard"), features: { ...defaultFeatures, managedSkills: false } },
    graphConfigFixture()
  ],
  reject: [
    { ...createConfigForTemplate("standard"), schemaVersion: 2 },
    { ...createConfigForTemplate("standard"), artifactRoot: "" },
    { ...createConfigForTemplate("standard"), artifactRoot: "../outside" },
    { ...createConfigForTemplate("standard"), paths: { ...createConfigForTemplate("standard").paths, plans: "../plans" } },
    { ...createConfigForTemplate("standard"), paths: { ...createConfigForTemplate("standard").paths, research: "research/../../outside" } },
    { ...createConfigForTemplate("standard"), pathAliases: { ...createConfigForTemplate("standard").pathAliases, "../outside-alias": "plans" } },
    { ...createConfigForTemplate("standard"), pathAliases: { ...createConfigForTemplate("standard").pathAliases, "docs/escape": "../outside-target" } },
    { ...createConfigForTemplate("standard"), doctor: { suppress: "setup-pending" } },
    { ...createConfigForTemplate("standard"), doctor: { silenced: ["setup-pending"] } },
    { ...createConfigForTemplate("standard"), features: { plans: "yes" } },
    { ...graphConfigFixture(), paths: { ...graphConfigFixture().paths, graph: "graph/../../outside" } },
    { ...graphConfigFixture(), features: { ...defaultFeatures, graph: { enabled: true, staleCommitThreshold: -1, generator: { name: "   ", version: "1.2.3" } } } },
    { ...createConfigForTemplate("standard"), agentSurfaces: ["vscode"] },
    { ...createConfigForTemplate("standard"), pathAliases: [] }
  ]
};

function graphConfigFixture() {
  const config = createConfigForTemplate("standard");
  return {
    ...config,
    paths: { ...config.paths, graph: "graph" },
    features: {
      ...config.features,
      plans: false,
      graph: {
        enabled: true,
        staleCommitThreshold: 10,
        generator: { name: "graphify", version: "1.2.3" }
      }
    }
  };
}

function legacyConfigFixture() {
  const { $schema, features, doctor, setupState, agentSurfaces, ...legacy } = createConfigForTemplate("standard");
  return legacy;
}
