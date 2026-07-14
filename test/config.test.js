import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import {
  configJsonSchema,
  configPath,
  createConfigForTemplate,
  createDefaultConfig,
  getTemplateNames,
  lockfileJsonSchema,
  resolveArtifactPath,
  resolveAliasDestination,
  validateConfig
} from "../src/config.js";
import { findingCodeSeverity } from "../src/findings.js";
import { packageVersion } from "../src/version.js";
import { configValidationFixtures } from "./helpers/config-fixtures.js";

test("creates the default config with root-relative paths and aliases", () => {
  const config = createDefaultConfig();

  assert.equal(config.schemaVersion, 1);
  assert.equal(config.$schema, `https://unpkg.com/@blazity-atlas/core@${packageVersion}/schema/config.schema.json`);
  assert.match(config.$schema, new RegExp(`@blazity-atlas/core@${packageVersion.replaceAll(".", "\\.")}/schema/config\\.schema\\.json$`, "u"));
  assert.equal(config.template, "standard");
  assert.equal(config.artifactRoot, ".ai");
  assert.equal(config.features.managedSkills, true);
  assert.deepEqual(config.doctor.suppress, []);
  assert.equal(config.paths.plans, "plans");
  assert.equal(config.paths.graph, undefined);
  assert.equal(config.features.graph, undefined);
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

test("rejects shared memory values that could be parsed as git options", () => {
  const config = {
    ...createDefaultConfig(),
    memory: {
      shared: {
        source: "file:///tmp/org-memory",
        ref: "main",
        pin: "a".repeat(40)
      }
    }
  };

  for (const key of ["source", "ref", "pin"]) {
    const invalid = validateConfig({
      ...config,
      memory: {
        shared: {
          ...config.memory.shared,
          [key]: "--upload-pack=/tmp/evil.sh"
        }
      }
    });

    assert.match(invalid.errors.join("\n"), new RegExp(`memory\\.shared\\.${key}`));
    assert.match(invalid.errors.join("\n"), /must not start with -/);
  }
});

test("requires shared memory pins to be full lowercase commit shas", () => {
  const config = {
    ...createDefaultConfig(),
    memory: {
      shared: {
        source: "file:///tmp/org-memory",
        ref: "main",
        pin: "a".repeat(40)
      }
    }
  };

  assert.equal(validateConfig(config).valid, true);

  for (const pin of ["FETCH_HEAD", "abc123", "A".repeat(40), "g".repeat(40), "a".repeat(39)]) {
    const invalid = validateConfig({
      ...config,
      memory: {
        shared: {
          ...config.memory.shared,
          pin
        }
      }
    });

    assert.match(invalid.errors.join("\n"), /memory\.shared\.pin/);
    assert.match(invalid.errors.join("\n"), /40-character lowercase hex/);
  }
});

test("scaffolds new configs with the setupState sentinel and all agent surfaces", () => {
  const config = createConfigForTemplate("standard");

  assert.equal(config.setupState, "scaffolded");
  assert.deepEqual(config.agentSurfaces, ["claude", "agents", "cursor"]);
  assert.deepEqual(Object.keys(config.features), ["plans", "research", "decisions", "results", "managedSkills", "agentSymlinks"]);
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

test("validates optional doctor suppression and feature flags", () => {
  const { doctor, features, ...legacy } = createDefaultConfig();

  assert.deepEqual(validateConfig(legacy).errors, []);
  assert.deepEqual(validateConfig({ ...legacy, doctor: { suppress: ["setup-pending"] } }).errors, []);
  assert.deepEqual(validateConfig({ ...legacy, features: { plans: false, managedSkills: true } }).errors, []);
  assert.match(validateConfig({ ...legacy, doctor: { suppress: "setup-pending" } }).errors.join("\n"), /doctor\.suppress/);
  assert.match(validateConfig({ ...legacy, features: { plans: "no" } }).errors.join("\n"), /features\.plans/);
  assert.equal(doctor.suppress.length, 0);
  assert.equal(features.plans, true);
});

test("runtime and schema accept the graph object beside boolean features", () => {
  const base = createDefaultConfig();
  const valid = {
    ...base,
    paths: { ...base.paths, graph: "graph" },
    features: {
      ...base.features,
      plans: false,
      graph: {
        enabled: true,
        staleCommitThreshold: 10,
        generator: { name: "graphify", version: "1.2.3" }
      }
    }
  };
  const invalid = {
    ...valid,
    paths: { ...valid.paths, graph: "graph/../../outside" },
    features: {
      ...valid.features,
      graph: {
        ...valid.features.graph,
        staleCommitThreshold: -1,
        generator: { name: "", version: 123 }
      }
    }
  };

  assert.deepEqual(validateConfig(valid).errors, []);
  assert.deepEqual(validateWithSchema(valid, configJsonSchema()), []);
  assert.match(validateConfig(invalid).errors.join("\n"), /paths\.graph/);
  assert.match(validateConfig(invalid).errors.join("\n"), /features\.graph\.staleCommitThreshold/);
  assert.notEqual(validateWithSchema(invalid, configJsonSchema()).length, 0);
});

test("registers suppression codes from memory and security checks", () => {
  const severities = {
    "broken-citation": "advisory",
    "dangling-supersede": "advisory",
    "duplicate-memory-entry": "advisory",
    "duplicate-memory-id": "advisory",
    "graph-generator-drift": "advisory",
    "graph-inspection-failed": "advisory",
    "graph-meta-invalid": "advisory",
    "graph-meta-missing": "advisory",
    "graph-skill-orphaned": "advisory",
    "graph-stale": "advisory",
    "malformed-memory-metadata": "advisory",
    "missing-graph-skill": "fixable",
    "missing-memory-gitignore": "fixable",
    "missing-memory-skill": "fixable",
    "security-exfiltration-shape": "advisory",
    "security-hidden-text": "advisory",
    "security-injection-phrase": "advisory",
    "security-scan-failed": "advisory",
    "security-skill-audit": "advisory",
    "security-write-surface": "advisory",
    "shared-memory-behind": "advisory",
    "shared-memory-edited": "advisory",
    "stale-memory": "advisory",
    "stale-graph-skill": "fixable",
    "stale-memory-gitignore": "fixable",
    "stale-memory-skill": "fixable"
  };

  for (const [code, severity] of Object.entries(severities)) {
    assert.equal(findingCodeSeverity(code), severity, code);
  }
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

test("config schema fixtures stay aligned with hand-rolled validation", () => {
  for (const fixture of configValidationFixtures.accept) {
    assert.deepEqual(validateConfig(fixture).errors, []);
    assert.deepEqual(validateWithSchema(fixture, configJsonSchema()), []);
  }

  for (const fixture of configValidationFixtures.reject) {
    assert.notEqual(validateConfig(fixture).errors.length, 0);
    assert.notEqual(validateWithSchema(fixture, configJsonSchema()).length, 0);
  }
});

test("config schema rejects workspace escape path segments where expressible", () => {
  const config = createDefaultConfig();
  const schema = configJsonSchema();
  const cases = [
    { ...config, artifactRoot: "../outside" },
    { ...config, paths: { ...config.paths, plans: "../plans" } },
    { ...config, paths: { ...config.paths, research: "research/../../outside" } },
    { ...config, pathAliases: { ...config.pathAliases, "../outside-alias": "plans" } },
    { ...config, pathAliases: { ...config.pathAliases, "docs/escape": "../outside-target" } }
  ];

  for (const fixture of cases) {
    assert.notEqual(validateConfig(fixture).errors.length, 0);
    assert.notEqual(validateWithSchema(fixture, schema).length, 0);
  }
});

test("published schemas are generated from the config module source of truth", async () => {
  const configSchema = JSON.parse(await import("node:fs/promises").then(({ readFile }) =>
    readFile(new URL("../schema/config.schema.json", import.meta.url), "utf8")));
  const lockfileSchema = JSON.parse(await import("node:fs/promises").then(({ readFile }) =>
    readFile(new URL("../schema/atlas-lock.schema.json", import.meta.url), "utf8")));

  assert.deepEqual(configSchema, configJsonSchema());
  assert.deepEqual(lockfileSchema, lockfileJsonSchema());
});

function validateWithSchema(value, schema) {
  const errors = [];
  validateSchemaNode(value, schema, "$", errors);
  return errors;
}

function validateSchemaNode(value, schema, path, errors) {
  if (schema.const !== undefined && value !== schema.const) {
    errors.push(`${path} must equal ${schema.const}`);
    return;
  }
  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`${path} must be one of ${schema.enum.join(", ")}`);
    return;
  }
  for (const child of schema.allOf ?? []) {
    validateSchemaNode(value, child, path, errors);
  }
  if (schema.if) {
    const conditionErrors = [];
    validateSchemaNode(value, schema.if, path, conditionErrors);
    if (conditionErrors.length === 0 && schema.then) {
      validateSchemaNode(value, schema.then, path, errors);
    } else if (conditionErrors.length > 0 && schema.else) {
      validateSchemaNode(value, schema.else, path, errors);
    }
  }
  if (schema.type && !matchesType(value, schema.type)) {
    errors.push(`${path} must be ${schema.type}`);
    return;
  }
  if (schema.type === "string" && typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      errors.push(`${path} must have length at least ${schema.minLength}`);
    }
    if (schema.pattern && !new RegExp(schema.pattern, "u").test(value)) {
      errors.push(`${path} must match ${schema.pattern}`);
    }
  }
  if ((schema.type === "number" || schema.type === "integer") && typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) {
      errors.push(`${path} must be at least ${schema.minimum}`);
    }
  }
  if (schema.type === "array" && Array.isArray(value)) {
    for (const item of value) {
      validateSchemaNode(item, schema.items ?? {}, `${path}[]`, errors);
    }
    return;
  }
  if (schema.type !== "object" || !value || typeof value !== "object" || Array.isArray(value)) {
    return;
  }

  for (const key of schema.required ?? []) {
    if (!(key in value)) {
      errors.push(`${path}.${key} is required`);
    }
  }

  for (const [key, child] of Object.entries(schema.properties ?? {})) {
    if (key in value) {
      validateSchemaNode(value[key], child, `${path}.${key}`, errors);
    }
  }

  if (schema.propertyNames) {
    for (const key of Object.keys(value)) {
      validateSchemaNode(key, schema.propertyNames, `${path} property name ${key}`, errors);
    }
  }

  for (const [key, childValue] of Object.entries(value)) {
    if (schema.properties?.[key]) {
      continue;
    }
    const pattern = Object.entries(schema.patternProperties ?? {}).find(([source]) => new RegExp(source, "u").test(key));
    if (pattern) {
      validateSchemaNode(childValue, pattern[1], `${path}.${key}`, errors);
    } else if (schema.additionalProperties === false) {
      errors.push(`${path}.${key} is not allowed`);
    } else if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
      validateSchemaNode(childValue, schema.additionalProperties, `${path}.${key}`, errors);
    }
  }
}

function matchesType(value, type) {
  if (type === "array") {
    return Array.isArray(value);
  }
  if (type === "integer") {
    return Number.isInteger(value);
  }
  if (type === "object") {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }
  return typeof value === type;
}
