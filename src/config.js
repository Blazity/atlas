import path from "node:path";

import { featureNames, featuresForProfile } from "./features.js";
import { packageVersion, parseVersion } from "./version.js";

const requiredPaths = ["language", "memory", "plans", "research", "decisions", "adrs", "results", "skills"];
const setupStates = ["scaffolded", "configured"];
const agentSurfaceNames = ["claude", "agents", "cursor"];
export const configSchemaUrl = `https://unpkg.com/@blazity-atlas/core@${packageVersion}/schema/config.schema.json`;
export const lockfileSchemaUrl = `https://unpkg.com/@blazity-atlas/core@${packageVersion}/schema/atlas-lock.schema.json`;
const noParentPathSegmentPattern = "^(?!.*(?:^|/)\\.\\.(?:/|$)).+$";
const basePathAliases = {
  "docs/plans": "plans",
  "docs/adrs": "decisions/adrs",
  "docs/specs": "research"
};
const templateDefinitions = {
  standard: {
    pathAliases: {}
  },
  library: {
    pathAliases: {
      "docs/api": "research",
      "docs/releases": "decisions",
      "docs/changelog": "results"
    }
  },
  app: {
    pathAliases: {
      "docs/qa": "results",
      "docs/runbooks": "decisions",
      "docs/product": "research"
    }
  },
  monorepo: {
    pathAliases: {
      "docs/packages": "research",
      "docs/apps": "research",
      "docs/workspaces": "decisions"
    }
  },
  agency: {
    pathAliases: {
      "docs/client": "research",
      "docs/handoff": "results",
      "docs/decisions": "decisions"
    }
  }
};

export function createDefaultConfig() {
  return createConfigForTemplate("standard");
}

export function createConfigForTemplate(templateName = "standard", root = ".ai", options = {}) {
  const template = getTemplateDefinition(templateName);
  const profile = options.profile ?? "full";
  const features = featuresForProfile(profile);
  const pathAliases = profile === "minimal"
    ? {}
    : {
        ...basePathAliases,
        ...template.pathAliases
      };

  return {
    $schema: configSchemaUrl,
    schemaVersion: 1,
    atlasVersion: packageVersion,
    template: template.name,
    setupState: "scaffolded",
    artifactRoot: root,
    agentSurfaces: [...agentSurfaceNames],
    features,
    doctor: {
      suppress: []
    },
    paths: {
      language: "LANGUAGE.md",
      memory: "memory",
      plans: "plans",
      research: "research",
      decisions: "decisions",
      adrs: "decisions/adrs",
      results: "results",
      skills: "skills"
    },
    pathAliases
  };
}

export function getTemplateNames() {
  return Object.keys(templateDefinitions);
}

export function getTemplateDefinition(templateName) {
  const template = templateDefinitions[templateName];
  if (!template) {
    throw new Error(`Unknown Atlas template: ${templateName}`);
  }
  return { name: templateName, ...template };
}

export function validateConfig(config) {
  const errors = [];

  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return { valid: false, errors: ["config must be an object"] };
  }

  if (config.schemaVersion !== 1) {
    errors.push("schemaVersion must be 1");
  }

  if (config.$schema !== undefined && (typeof config.$schema !== "string" || config.$schema.trim() === "")) {
    errors.push("$schema must be a non-empty string");
  }

  if (config.atlasVersion !== undefined && !parseVersion(config.atlasVersion)) {
    errors.push("atlasVersion must be a semver version string (X.Y.Z)");
  }

  if (config.template !== undefined && !getTemplateNames().includes(config.template)) {
    errors.push(`template must be one of: ${getTemplateNames().join(", ")}`);
  }

  if (config.setupState !== undefined && !setupStates.includes(config.setupState)) {
    errors.push(`setupState must be one of: ${setupStates.join(", ")}`);
  }

  if (config.agentSurfaces !== undefined) {
    if (!Array.isArray(config.agentSurfaces)) {
      errors.push(`agentSurfaces must be an array drawn from: ${agentSurfaceNames.join(", ")}`);
    } else {
      for (const surface of config.agentSurfaces) {
        if (!agentSurfaceNames.includes(surface)) {
          errors.push(`agentSurfaces must only contain: ${agentSurfaceNames.join(", ")}`);
          break;
        }
      }
    }
  }

  if (config.features !== undefined) {
    if (!config.features || typeof config.features !== "object" || Array.isArray(config.features)) {
      errors.push(`features must be an object with boolean keys: ${featureNames.join(", ")}`);
    } else {
      for (const [featureName, enabled] of Object.entries(config.features)) {
        if (featureName === "graph") {
          addGraphFeatureErrors(enabled, errors);
        } else if (!featureNames.includes(featureName)) {
          errors.push(`features.${featureName} is not a known feature`);
        } else if (typeof enabled !== "boolean") {
          errors.push(`features.${featureName} must be a boolean`);
        }
      }
    }
  }

  if (config.doctor !== undefined) {
    if (!config.doctor || typeof config.doctor !== "object" || Array.isArray(config.doctor)) {
      errors.push("doctor must be an object");
    } else {
      for (const key of Object.keys(config.doctor)) {
        if (key !== "suppress") {
          errors.push(`doctor.${key} is not a known option`);
        }
      }
      if (config.doctor.suppress !== undefined) {
        if (!Array.isArray(config.doctor.suppress)) {
          errors.push("doctor.suppress must be an array of finding codes");
        } else if (config.doctor.suppress.some((code) => typeof code !== "string" || code.trim() === "")) {
          errors.push("doctor.suppress must only contain non-empty finding code strings");
        }
      }
    }
  }

  // JSON Schema mirrors shape and parent-segment checks. Runtime validation
  // still owns path semantics that depend on Node, such as absolute aliases and
  // normalized repo/artifact-root escape detection.
  if (typeof config.artifactRoot !== "string" || config.artifactRoot.trim() === "") {
    errors.push("artifactRoot must be a non-empty string");
  } else if (hasParentPathSegment(config.artifactRoot)) {
    errors.push("artifactRoot must not contain .. path segments");
  } else if (!path.isAbsolute(config.artifactRoot) && pathEscapesRoot(config.artifactRoot)) {
    errors.push("artifactRoot must not escape the repository root");
  }

  if (!config.paths || typeof config.paths !== "object" || Array.isArray(config.paths)) {
    errors.push("paths must be an object");
  } else {
    for (const key of requiredPaths) {
      addPathRuleErrors(config.paths, key, errors);
    }
    addPathRuleErrors(config.paths, "graph", errors, { optional: true });
  }

  if (!config.pathAliases || typeof config.pathAliases !== "object" || Array.isArray(config.pathAliases)) {
    errors.push("pathAliases must be an object");
  } else {
    for (const [alias, target] of Object.entries(config.pathAliases)) {
      if (typeof target !== "string" || target.trim() === "") {
        errors.push(`pathAliases.${alias} must be a non-empty string`);
      } else if (hasParentPathSegment(target)) {
        errors.push(`pathAliases.${alias} must not contain .. path segments`);
      }
      if (path.isAbsolute(alias)) {
        errors.push(`pathAliases.${alias} must be relative to the repository root`);
      }
      if (typeof alias === "string" && hasParentPathSegment(alias)) {
        errors.push(`pathAliases.${alias} must not contain .. path segments`);
      } else if (typeof alias === "string" && pathEscapesRoot(alias)) {
        errors.push(`pathAliases.${alias} must not escape the repository root`);
      }
      if (typeof target === "string" && !path.isAbsolute(target) && pathEscapesRoot(target)) {
        errors.push(`pathAliases.${alias} must not escape artifactRoot`);
      }
    }
  }

  if (config.memory !== undefined) {
    if (!config.memory || typeof config.memory !== "object" || Array.isArray(config.memory)) {
      errors.push("memory must be an object");
    } else if (config.memory.shared !== undefined) {
      if (!config.memory.shared || typeof config.memory.shared !== "object" || Array.isArray(config.memory.shared)) {
        errors.push("memory.shared must be an object");
      } else {
        for (const key of ["source", "ref", "pin"]) {
          const value = config.memory.shared[key];
          if (typeof value !== "string" || value.trim() === "") {
            errors.push(`memory.shared.${key} must be a non-empty string`);
            continue;
          }
          const trimmed = value.trim();
          if (trimmed.startsWith("-")) {
            errors.push(`memory.shared.${key} must not start with -`);
          }
          if (key === "pin" && !/^[0-9a-f]{40}$/u.test(trimmed)) {
            errors.push("memory.shared.pin must be a full 40-character lowercase hex commit SHA");
          }
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

export function workspaceRootError(value) {
  if (typeof value !== "string" || value.trim() === "") {
    return "must not be empty";
  }
  const trimmed = value.trim();
  if (path.isAbsolute(trimmed)) {
    return "must be a repo-relative path, not absolute";
  }
  if (pathEscapesRoot(trimmed)) {
    return "must not escape the repository root";
  }
  return null;
}

export function resolveArtifactPath(config, keyOrRelativePath) {
  const configuredValue = config.paths?.[keyOrRelativePath] ?? keyOrRelativePath;
  if (path.isAbsolute(configuredValue)) {
    return normalizePath(configuredValue);
  }

  const root = config.artifactRoot;
  if (path.isAbsolute(root)) {
    return normalizePath(path.join(root, configuredValue));
  }

  return normalizePath(path.join(root, configuredValue));
}

export function resolveAliasDestination(config, candidatePath) {
  const normalizedCandidate = normalizePath(candidatePath);
  const matchingAlias = Object.keys(config.pathAliases)
    .map(normalizePath)
    .sort((left, right) => right.length - left.length)
    .find((alias) => normalizedCandidate === alias || normalizedCandidate.startsWith(`${alias}/`));

  if (!matchingAlias) {
    return null;
  }

  const originalAlias = Object.keys(config.pathAliases).find((alias) => normalizePath(alias) === matchingAlias);
  const target = config.pathAliases[originalAlias];
  const suffix = normalizedCandidate.slice(matchingAlias.length).replace(/^\//, "");
  return normalizePath(path.join(resolveArtifactPath(config, target), suffix));
}

export function normalizePath(value) {
  return value.replaceAll(path.sep, "/").replace(/\/+$/u, "") || ".";
}

export function configPath(repoRoot, root = ".ai") {
  return path.join(repoRoot, root, "config.json");
}

export function configJsonSchema() {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: configSchemaUrl,
    title: "Atlas config",
    type: "object",
    required: ["schemaVersion", "artifactRoot", "paths", "pathAliases"],
    properties: {
      $schema: { type: "string" },
      schemaVersion: { const: 1 },
      atlasVersion: {
        type: "string",
        pattern: "^\\d+\\.\\d+\\.\\d+(?:-[0-9A-Za-z.-]+)?$"
      },
      template: {
        type: "string",
        enum: getTemplateNames()
      },
      setupState: {
        type: "string",
        enum: setupStates
      },
      artifactRoot: {
        type: "string",
        minLength: 1,
        pattern: noParentPathSegmentPattern
      },
      agentSurfaces: {
        type: "array",
        items: {
          type: "string",
          enum: agentSurfaceNames
        },
        uniqueItems: true
      },
      features: {
        type: "object",
        properties: {
          ...Object.fromEntries(featureNames.map((featureName) => [featureName, { type: "boolean" }])),
          graph: graphFeatureJsonSchema()
        },
        additionalProperties: false
      },
      doctor: {
        type: "object",
        properties: {
          suppress: {
            type: "array",
            items: {
              type: "string",
              pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$"
            },
            uniqueItems: true
          }
        },
        additionalProperties: false
      },
      paths: {
        type: "object",
        required: requiredPaths,
        properties: {
          ...Object.fromEntries(requiredPaths.map((key) => [key, pathJsonSchema()])),
          graph: pathJsonSchema()
        },
        additionalProperties: {
          type: "string",
          pattern: noParentPathSegmentPattern
        }
      },
      pathAliases: {
        type: "object",
        propertyNames: {
          type: "string",
          pattern: noParentPathSegmentPattern
        },
        additionalProperties: {
          type: "string",
          pattern: noParentPathSegmentPattern
        }
      }
    },
    additionalProperties: true
  };
}

export function lockfileJsonSchema() {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: lockfileSchemaUrl,
    title: "Atlas lockfile",
    type: "object",
    required: ["schemaVersion", "atlasVersion", "files"],
    properties: {
      $schema: { type: "string" },
      schemaVersion: { const: 1 },
      atlasVersion: {
        type: "string",
        pattern: "^\\d+\\.\\d+\\.\\d+(?:-[0-9A-Za-z.-]+)?$"
      },
      files: {
        type: "object",
        additionalProperties: {
          type: "object",
          required: ["sha256"],
          properties: {
            sha256: { type: "string" },
            packaged: { type: "string" }
          },
          additionalProperties: false
        }
      }
    },
    additionalProperties: true
  };
}

function pathJsonSchema() {
  return {
    type: "string",
    minLength: 1,
    pattern: noParentPathSegmentPattern
  };
}

function graphFeatureJsonSchema() {
  return {
    type: "object",
    properties: {
      enabled: { type: "boolean" },
      staleCommitThreshold: { type: "integer", minimum: 0 },
      generator: {
        type: "object",
        required: ["name", "version"],
        properties: {
          name: { type: "string", minLength: 1, pattern: "\\S" },
          version: { type: "string", minLength: 1, pattern: "\\S" }
        }
      }
    },
    allOf: [{
      if: { type: "object", properties: { enabled: { const: true } }, required: ["enabled"] },
      then: { type: "object", required: ["generator"] }
    }]
  };
}

function addPathRuleErrors(paths, key, errors, options = {}) {
  const value = paths[key];
  if (value === undefined && options.optional) {
    return;
  }
  if (typeof value !== "string" || value.trim() === "") {
    errors.push(`paths.${key} must be a non-empty string`);
  } else if (hasParentPathSegment(value)) {
    errors.push(`paths.${key} must not contain .. path segments`);
  } else if (!path.isAbsolute(value) && pathEscapesRoot(value)) {
    errors.push(`paths.${key} must not escape artifactRoot`);
  }
}

function addGraphFeatureErrors(graph, errors) {
  if (!graph || typeof graph !== "object" || Array.isArray(graph)) {
    errors.push("features.graph must be an object");
    return;
  }

  if (graph.enabled !== undefined && typeof graph.enabled !== "boolean") {
    errors.push("features.graph.enabled must be a boolean");
  }

  if (graph.staleCommitThreshold !== undefined && (!Number.isInteger(graph.staleCommitThreshold) || graph.staleCommitThreshold < 0)) {
    errors.push("features.graph.staleCommitThreshold must be a non-negative integer");
  }

  if (graph.enabled === true && graph.generator === undefined) {
    errors.push("features.graph.generator is required when features.graph.enabled is true");
    return;
  }

  if (graph.generator !== undefined) {
    if (!graph.generator || typeof graph.generator !== "object" || Array.isArray(graph.generator)) {
      errors.push("features.graph.generator must be an object");
      return;
    }
    if (typeof graph.generator.name !== "string" || graph.generator.name.trim() === "") {
      errors.push("features.graph.generator.name must be a non-empty string");
    }
    if (typeof graph.generator.version !== "string" || graph.generator.version.trim() === "") {
      errors.push("features.graph.generator.version must be a non-empty string");
    }
  }
}

function hasParentPathSegment(value) {
  return normalizePath(value).split("/").includes("..");
}

function pathEscapesRoot(value) {
  const normalized = path.posix.normalize(normalizePath(value));
  return normalized === ".." || normalized.startsWith("../");
}
