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
        if (!featureNames.includes(featureName)) {
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
      if (typeof config.paths[key] !== "string" || config.paths[key].trim() === "") {
        errors.push(`paths.${key} must be a non-empty string`);
      } else if (hasParentPathSegment(config.paths[key])) {
        errors.push(`paths.${key} must not contain .. path segments`);
      } else if (!path.isAbsolute(config.paths[key]) && pathEscapesRoot(config.paths[key])) {
        errors.push(`paths.${key} must not escape artifactRoot`);
      }
    }
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
        properties: Object.fromEntries(featureNames.map((featureName) => [featureName, { type: "boolean" }])),
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
        properties: Object.fromEntries(requiredPaths.map((key) => [key, {
          type: "string",
          minLength: 1,
          pattern: noParentPathSegmentPattern
        }])),
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

function hasParentPathSegment(value) {
  return normalizePath(value).split("/").includes("..");
}

function pathEscapesRoot(value) {
  const normalized = path.posix.normalize(normalizePath(value));
  return normalized === ".." || normalized.startsWith("../");
}
