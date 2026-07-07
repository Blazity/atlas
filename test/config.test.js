import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import {
  configPath,
  createConfigForTemplate,
  createDefaultConfig,
  getTemplateNames,
  resolveArtifactPath,
  resolveAliasDestination,
  validateConfig
} from "../src/config.js";

test("creates the default config with root-relative paths and aliases", () => {
  const config = createDefaultConfig();

  assert.equal(config.schemaVersion, 1);
  assert.equal(config.template, "standard");
  assert.equal(config.artifactRoot, ".ai");
  assert.equal(config.paths.plans, "plans");
  assert.equal(config.paths.graph, undefined);
  assert.equal(config.features, undefined);
  assert.equal(config.paths.adrs, "decisions/adrs");
  assert.equal(config.pathAliases["docs/plans"], "plans");
  assert.equal(config.pathAliases["docs/superpowers/plans"], undefined);
});

test("creates deterministic configs for supported templates", () => {
  assert.deepEqual(getTemplateNames(), ["standard", "library", "app", "monorepo", "agency"]);

  const app = createConfigForTemplate("app");
  const monorepo = createConfigForTemplate("monorepo");

  assert.equal(app.template, "app");
  assert.equal(app.pathAliases["docs/qa"], "results");
  assert.equal(app.pathAliases["docs/runbooks"], "decisions");
  assert.equal(monorepo.template, "monorepo");
  assert.equal(monorepo.pathAliases["docs/packages"], "research");
  assert.throws(() => createConfigForTemplate("unknown"), /Unknown Atlas template: unknown/);
});

test("validates required config fields", () => {
  const valid = validateConfig(createDefaultConfig());
  const invalid = validateConfig({ schemaVersion: 2, artifactRoot: "", paths: {}, pathAliases: [] });

  assert.deepEqual(valid.errors, []);
  assert.match(invalid.errors.join("\n"), /schemaVersion/);
  assert.match(invalid.errors.join("\n"), /artifactRoot/);
  assert.match(invalid.errors.join("\n"), /pathAliases/);
});

test("scaffolds new configs with the setupState sentinel and all agent surfaces", () => {
  const config = createConfigForTemplate("standard");

  assert.equal(config.setupState, "scaffolded");
  assert.deepEqual(config.agentSurfaces, ["claude", "agents", "cursor"]);
});

test("createConfigForTemplate accepts a workspace root and sets artifactRoot to it", () => {
  assert.equal(createConfigForTemplate("standard").artifactRoot, ".ai");
  assert.equal(createConfigForTemplate("app", ".workspace").artifactRoot, ".workspace");
});

test("validates setupState as an optional sentinel with two allowed values", () => {
  const { setupState, ...legacy } = createDefaultConfig();

  assert.deepEqual(validateConfig(legacy).errors, []);
  assert.deepEqual(validateConfig({ ...legacy, setupState: "scaffolded" }).errors, []);
  assert.deepEqual(validateConfig({ ...legacy, setupState: "configured" }).errors, []);
  assert.match(validateConfig({ ...legacy, setupState: "done" }).errors.join("\n"), /setupState/);
});

test("validates agentSurfaces as an optional subset of known surfaces", () => {
  const { agentSurfaces, ...legacy } = createDefaultConfig();

  assert.deepEqual(validateConfig(legacy).errors, []);
  assert.deepEqual(validateConfig({ ...legacy, agentSurfaces: ["claude"] }).errors, []);
  assert.deepEqual(validateConfig({ ...legacy, agentSurfaces: ["cursor", "agents"] }).errors, []);
  assert.match(validateConfig({ ...legacy, agentSurfaces: ["claude", "vscode"] }).errors.join("\n"), /agentSurfaces/);
  assert.match(validateConfig({ ...legacy, agentSurfaces: "claude" }).errors.join("\n"), /agentSurfaces/);
});

test("validates graph as an optional feature with an optional artifact path", () => {
  const config = createDefaultConfig();

  assert.deepEqual(validateConfig({
    ...config,
    paths: { ...config.paths, graph: "graph" },
    features: {
      graph: {
        enabled: true,
        staleCommitThreshold: 10,
        generator: { name: "graphify", version: "1.2.3" }
      }
    }
  }).errors, []);

  const invalid = validateConfig({
    ...config,
    paths: { ...config.paths, graph: "../graph" },
    features: {
      graph: {
        enabled: true,
        staleCommitThreshold: -1,
        generator: { name: "", version: 123 }
      }
    }
  });

  assert.match(invalid.errors.join("\n"), /paths\.graph/);
  assert.match(invalid.errors.join("\n"), /features\.graph\.staleCommitThreshold/);
  assert.match(invalid.errors.join("\n"), /features\.graph\.generator\.name/);
  assert.match(invalid.errors.join("\n"), /features\.graph\.generator\.version/);
});

test("configPath joins the workspace root with config.json", () => {
  assert.equal(configPath("/repo"), path.join("/repo", ".ai", "config.json"));
  assert.equal(configPath("/repo", ".workspace"), path.join("/repo", ".workspace", "config.json"));
});

test("rejects relative config paths that escape their configured roots", () => {
  const config = createDefaultConfig();

  const invalid = validateConfig({
    ...config,
    artifactRoot: "../outside",
    paths: { ...config.paths, plans: "../plans" },
    pathAliases: { ...config.pathAliases, "../outside-alias": "plans", "docs/escape": "../outside-target" }
  });

  assert.match(invalid.errors.join("\n"), /artifactRoot/);
  assert.match(invalid.errors.join("\n"), /paths\.plans/);
  assert.match(invalid.errors.join("\n"), /pathAliases\.\.\.\/outside-alias/);
  assert.match(invalid.errors.join("\n"), /pathAliases\.docs\/escape/);
});

test("resolves artifact paths through artifactRoot unless absolute", () => {
  const config = createDefaultConfig();

  assert.equal(resolveArtifactPath(config, "plans"), ".ai/plans");
  assert.equal(resolveArtifactPath(config, "adrs"), ".ai/decisions/adrs");
  assert.equal(resolveArtifactPath(config, "graph"), ".ai/graph");
  assert.equal(resolveArtifactPath({ ...config, artifactRoot: "/tmp/.ai" }, "plans"), "/tmp/.ai/plans");
});

test("resolves alias destinations while preserving nested filenames", () => {
  const config = createDefaultConfig();

  assert.equal(
    resolveAliasDestination(config, "docs/plans/2026-05-18-plan.md"),
    ".ai/plans/2026-05-18-plan.md"
  );
  assert.equal(resolveAliasDestination(config, "docs/unknown/file.md"), null);
});
