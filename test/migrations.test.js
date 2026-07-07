import assert from "node:assert/strict";
import test from "node:test";

import { createConfigForTemplate } from "../src/config.js";
import { planConfigMigrations } from "../src/migrations.js";

test("pre-0.4 path alias migration ignores legacy-looking aliases in 0.5 configs", () => {
  const config = {
    ...createConfigForTemplate("standard"),
    atlasVersion: "0.5.0",
    pathAliases: {
      "docs/superpowers/plans": "plans",
      "docs/superpowers/specs": "research",
      "docs/adrs": "decisions/adrs"
    }
  };

  const result = planConfigMigrations(config);

  assert.deepEqual(result.conflicts, []);
  assert.deepEqual(result.applied, []);
  assert.deepEqual(result.config, config);
});

test("pre-0.4 path alias migration runs when atlasVersion is missing", () => {
  const { atlasVersion, ...config } = {
    ...createConfigForTemplate("standard"),
    pathAliases: {
      "docs/superpowers/plans": "plans",
      "docs/superpowers/specs": "research"
    }
  };

  const result = planConfigMigrations(config);

  assert.deepEqual(result.conflicts, []);
  assert.deepEqual(result.applied.map((migration) => migration.id), ["pre-0.4-path-aliases"]);
  assert.equal(result.config.pathAliases["docs/superpowers/plans"], undefined);
  assert.equal(result.config.pathAliases["docs/superpowers/specs"], undefined);
  assert.equal(result.config.pathAliases["docs/plans"], "plans");
  assert.equal(result.config.pathAliases["docs/specs"], "research");
});

test("pre-0.4 path alias migration replaces untouched legacy defaults", () => {
  const config = {
    ...createConfigForTemplate("standard"),
    atlasVersion: "0.3.0",
    pathAliases: {
      "docs/superpowers/plans": "plans",
      "docs/superpowers/specs": "research",
      "docs/adrs": "decisions/adrs"
    }
  };

  const result = planConfigMigrations(config);

  assert.deepEqual(result.conflicts, []);
  assert.deepEqual(result.applied.map((migration) => migration.id), ["pre-0.4-path-aliases"]);
  assert.deepEqual(result.config.pathAliases, {
    "docs/adrs": "decisions/adrs",
    "docs/plans": "plans",
    "docs/specs": "research"
  });
});

test("pre-0.4 path alias migration leaves customized values untouched", () => {
  const config = {
    ...createConfigForTemplate("standard"),
    atlasVersion: "0.3.0",
    pathAliases: {
      "docs/superpowers/plans": "custom-plans",
      "docs/superpowers/specs": "research"
    }
  };

  const result = planConfigMigrations(config);

  assert.equal(result.applied.length, 1);
  assert.equal(result.config.pathAliases["docs/superpowers/plans"], "custom-plans");
  assert.equal(result.config.pathAliases["docs/plans"], undefined);
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.conflicts[0].oldDefault, "docs/superpowers/plans -> plans");
  assert.equal(result.conflicts[0].newDefault, "docs/plans -> plans");
  assert.equal(result.conflicts[0].currentValue, "custom-plans");
});
