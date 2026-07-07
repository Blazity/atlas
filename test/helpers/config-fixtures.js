import { createConfigForTemplate } from "../../src/config.js";
import { defaultFeatures } from "../../src/features.js";

export const configValidationFixtures = {
  accept: [
    createConfigForTemplate("standard"),
    legacyConfigFixture(),
    { ...createConfigForTemplate("standard"), doctor: { suppress: ["setup-pending"] } },
    { ...createConfigForTemplate("standard"), features: { ...defaultFeatures, managedSkills: false } }
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
    { ...createConfigForTemplate("standard"), agentSurfaces: ["vscode"] },
    { ...createConfigForTemplate("standard"), pathAliases: [] }
  ]
};

function legacyConfigFixture() {
  const { $schema, features, doctor, setupState, agentSurfaces, ...legacy } = createConfigForTemplate("standard");
  return legacy;
}
