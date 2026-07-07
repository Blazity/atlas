import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

import { collectContextFileCandidates } from "./context-size.js";
import { normalizePath, resolveArtifactPath } from "./config.js";
import { repoPath } from "./repo.js";

const securityCodes = {
  hiddenText: "security-hidden-text",
  injectionPhrase: "security-injection-phrase",
  exfiltrationShape: "security-exfiltration-shape",
  skillAudit: "security-skill-audit",
  writeSurface: "security-write-surface"
};

const hiddenUnicodePattern = /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/u;
const base64BlobPattern = /\b[A-Za-z0-9+/]{160,}={0,2}\b/gu;
const hexBlobPattern = /\b[A-Fa-f0-9]{160,}\b/gu;
const credentialUrlPattern = /\b[a-z][a-z0-9+.-]*:\/\/[^\s/@:]+:[^\s/@]+@[^\s<>)"']+/iu;
const unusualSchemePattern = /\b(?:data|file|javascript|vbscript):[^\s<>)"']*/iu;
const sensitivePathPattern = /(?:^|[\s`'"(])(?:\.env(?:\.[\w.-]+)?|id_rsa|~\/\.ssh(?:\/[^\s`'"()]*)?|\/\.ssh\/|~\/\.aws\/credentials|\.aws\/config|aws\/credentials|application_default_credentials\.json|\.netrc|\.npmrc\b|[^\s`'"()]*:_authToken=|_authToken\s*=|GOOGLE_APPLICATION_CREDENTIALS)\b/iu;
const exfilVerbPattern = /\b(?:read|cat|open|load|copy|collect|send|upload|post|exfiltrate|transmit)\b/iu;
const writeVerbPattern = /\b(?:write|create|edit|modify|delete|move|append|overwrite|save)\b/iu;
const directivePathPattern = /(?:^|[\s`'"(])(?<value>\/[^\s`'"()]+|~(?:\/[^\s`'"()]+)?|\.\.\/[^\s`'"()]*)/gu;
const directivePathLikePattern = /(?:^|[\s`'"(])(?:\/[^\s`'"()]+|~(?:\/[^\s`'"()]+)?|\.\.\/[^\s`'"()]*)/iu;
const directiveVerbPattern = /\b(?:read|write|edit|delete|copy|move|save)\b/giu;
const writeVerbTokenPattern = /\b(?:write|create|edit|modify|delete|move|append|overwrite|save)\b/giu;
const instructionInjectionClasses = new Set([
  "silent-instruction",
  "instruction-override",
  "user-concealment"
]);
const directiveContextMarkers = new Set(["you", "must", "should", "always", "then"]);

// Pattern objects are the review unit: keep a stable class name, a narrow
// regex, and a remediation. Additions should describe an attacker shape, not
// project-specific wording, so reviewers can reason about false positives.
export const securityScanPatternSet = {
  version: 1,
  injectionPhrases: [
    {
      class: "silent-instruction",
      regex: /\byou\s+must\s+silently\b|\bsilently\s+(?:run|call|invoke|write|read|send|upload)\b/iu,
      remediation: "Remove covert agent instructions from declarative workspace data."
    },
    {
      class: "instruction-override",
      regex: /\bignore\s+(?:all\s+)?(?:previous|above|earlier)\s+instructions?\b/iu,
      remediation: "Remove instruction-overriding language from declarative workspace data."
    },
    {
      class: "user-concealment",
      regex: /\bdo\s+not\s+(?:tell|inform|notify)\s+the\s+user\b/iu,
      remediation: "Remove concealment instructions from committed context."
    },
    {
      class: "tool-invocation-directive",
      regex: /\b(?:call|invoke|use|run)\s+(?:the\s+)?(?:tool|function|mcp|bash|shell|terminal|write_file|read_file)\b/iu,
      remediation: "Move executable workflow instructions into a reviewed skill or script."
    },
    {
      class: "external-path-directive",
      regex: /\b(?:read|write|edit|delete|copy|move|save)\b.{0,80}(?:\/[^\s`'"()]+|~\/|\.\.\/)/iu,
      remediation: "Route write and read instructions through configured Atlas paths."
    }
  ]
};

export async function scanSecurityContext(repoRoot, config, options = {}) {
  const targets = await collectSecurityTargets(repoRoot, config);
  const findings = [];

  for (const target of targets) {
    const content = await readTextTarget(repoRoot, target.relativePath);
    if (content === null) {
      continue;
    }
    const managedRegions = managedBlockRegions(content);
    findings.push(...scanHiddenText(target, content, managedRegions));
    findings.push(...scanExfiltrationShapes(target, content));
    const injectionPatterns = injectionPatternsForTarget(target);
    if (injectionPatterns.length > 0) {
      findings.push(...scanInjectionPhrases(target, content, injectionPatterns));
    }
    if (target.writeSurface) {
      findings.push(...scanWriteSurface(repoRoot, target, content, managedRegions));
    }
  }

  findings.push(...await scanSkills(repoRoot, config));
  findings.push(...managedSkillDriftSecurityFindings(options.managedSkillDriftFindings ?? []));

  return dedupeFindings(findings).sort(compareFindings);
}

async function collectSecurityTargets(repoRoot, config) {
  const targets = new Map();
  const contextCandidates = await collectContextFileCandidates(repoRoot, config, { readDirectory: readdir });
  for (const candidate of contextCandidates) {
    const instructionFile = candidate.category === "root-instruction";
    addTarget(targets, candidate.relativePath, {
      dataFile: candidate.category === "language" || candidate.category === "memory",
      instructionFile,
      writeSurface: instructionFile || candidate.category === "managed-skill"
    });
  }

  await addMarkdownDirectoryTargets(repoRoot, targets, resolveArtifactPath(config, "results"), { dataFile: true });
  await addDirectoryTargets(repoRoot, targets, resolveArtifactPath(config, "skills"), { writeSurface: true });
  await addDirectoryTargets(repoRoot, targets, ".claude/rules", { instructionFile: true, writeSurface: true });
  await addDirectoryTargets(repoRoot, targets, ".cursor/rules", { instructionFile: true, writeSurface: true });

  return [...targets.values()];
}

function addTarget(targets, relativePath, flags) {
  const normalized = normalizePath(relativePath);
  const current = targets.get(normalized) ?? {
    relativePath: normalized,
    dataFile: false,
    instructionFile: false,
    writeSurface: false
  };
  targets.set(normalized, {
    ...current,
    dataFile: current.dataFile || Boolean(flags.dataFile),
    instructionFile: current.instructionFile || Boolean(flags.instructionFile),
    writeSurface: current.writeSurface || Boolean(flags.writeSurface)
  });
}

async function addMarkdownDirectoryTargets(repoRoot, targets, relativeRoot, flags) {
  await addDirectoryTargets(repoRoot, targets, relativeRoot, { ...flags, markdownOnly: true });
}

async function addDirectoryTargets(repoRoot, targets, relativeRoot, flags) {
  const root = normalizePath(relativeRoot);
  const stats = await fileStat(repoRoot, root);
  if (!stats?.isDirectory()) {
    return;
  }

  let entries;
  try {
    entries = await readdir(repoPath(repoRoot, root), { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const relativePath = normalizePath(path.join(root, entry.name));
    if (entry.isDirectory()) {
      await addDirectoryTargets(repoRoot, targets, relativePath, flags);
    } else if (entry.isFile() && (!flags.markdownOnly || /\.md$/iu.test(entry.name))) {
      addTarget(targets, relativePath, flags);
    }
  }
}

function scanHiddenText(target, content, managedRegions) {
  const findings = [];
  forEachLine(content, (line, lineNumber) => {
    if (hiddenUnicodePattern.test(line)) {
      findings.push(securityFinding({
        code: securityCodes.hiddenText,
        file: target.relativePath,
        line: lineNumber,
        patternClass: "hidden-unicode",
        summary: "contains zero-width or bidi-control unicode",
        remediation: "Remove hidden unicode controls or replace them with visible text."
      }));
    }
    if (hasEncodedBlob(line)) {
      findings.push(securityFinding({
        code: securityCodes.hiddenText,
        file: target.relativePath,
        line: lineNumber,
        patternClass: "encoded-blob",
        summary: "contains a large encoded blob",
        remediation: "Replace large encoded payloads with a reviewed artifact reference."
      }));
    }
  });

  for (const comment of htmlComments(content, managedRegions)) {
    if (comment.managed || !imperativeHtmlComment(comment.text)) {
      continue;
    }
    findings.push(securityFinding({
      code: securityCodes.hiddenText,
      file: target.relativePath,
      line: lineForOffset(content, comment.index),
      patternClass: "imperative-html-comment",
      summary: "contains an imperative instruction hidden in an HTML comment",
      remediation: "Delete hidden imperative comments or move legitimate guidance into visible text."
    }));
  }

  return findings;
}

function hasEncodedBlob(line) {
  for (const match of line.matchAll(hexBlobPattern)) {
    if (uniqueCharacterCount(match[0].toLowerCase()) >= 4) {
      return true;
    }
  }
  for (const match of line.matchAll(base64BlobPattern)) {
    if (base64CharacterGroupCount(match[0]) >= 2) {
      return true;
    }
  }
  return false;
}

function uniqueCharacterCount(value) {
  return new Set(value).size;
}

function base64CharacterGroupCount(value) {
  return [
    /[A-Z]/u,
    /[a-z]/u,
    /[0-9]/u,
    /[+/]/u
  ].filter((pattern) => pattern.test(value)).length;
}

function injectionPatternsForTarget(target) {
  if (target.dataFile) {
    return securityScanPatternSet.injectionPhrases;
  }
  if (target.instructionFile) {
    // Instruction files legitimately contain imperative tool guidance, so keep
    // generic tool/path directive classes off and scan only high-signal attacks.
    return securityScanPatternSet.injectionPhrases.filter((pattern) =>
      instructionInjectionClasses.has(pattern.class));
  }
  return [];
}

function scanInjectionPhrases(target, content, patterns) {
  const findings = [];
  forEachLine(content, (line, lineNumber) => {
    for (const clause of clauseSegments(line)) {
      if (isNegatedDirective(clause.text)) {
        continue;
      }
      for (const pattern of patterns) {
        if (!injectionPatternMatches(pattern, clause.text)) {
          continue;
        }
        findings.push(securityFinding({
          code: securityCodes.injectionPhrase,
          file: target.relativePath,
          line: lineNumber,
          patternClass: pattern.class,
          summary: "contains imperative agent-directed phrasing in declarative data",
          remediation: pattern.remediation
        }));
      }
    }
  });
  return findings;
}

function injectionPatternMatches(pattern, clause) {
  if (pattern.class === "external-path-directive") {
    return pattern.regex.test(clause) && hasDirectivePath(clause);
  }
  return pattern.regex.test(clause);
}

function scanExfiltrationShapes(target, content) {
  const findings = [];
  forEachLine(content, (line, lineNumber) => {
    if (credentialUrlPattern.test(line)) {
      findings.push(securityFinding({
        code: securityCodes.exfiltrationShape,
        file: target.relativePath,
        line: lineNumber,
        patternClass: "credential-url",
        summary: "contains a URL with embedded credentials",
        remediation: "Remove credentials from committed context and rotate them if real."
      }));
    }
    if (unusualSchemePattern.test(line)) {
      findings.push(securityFinding({
        code: securityCodes.exfiltrationShape,
        file: target.relativePath,
        line: lineNumber,
        patternClass: "unusual-url-scheme",
        summary: "contains an unusual URL scheme",
        remediation: "Replace data or script URLs with plain reviewed references."
      }));
    }
    for (const clause of clauseSegments(line)) {
      if (isNegatedDirective(clause.text) || !sensitivePathPattern.test(clause.text) || !exfilVerbPattern.test(clause.text)) {
        continue;
      }
      findings.push(securityFinding({
        code: securityCodes.exfiltrationShape,
        file: target.relativePath,
        line: lineNumber,
        patternClass: "sensitive-file-exfiltration",
        summary: "combines sensitive credential paths with read or send verbs",
        remediation: "Remove instructions that read or transmit secret-bearing files."
      }));
    }
  });
  return findings;
}

function scanWriteSurface(repoRoot, target, content, managedRegions) {
  const findings = [];
  const regions = target.instructionFile || target.relativePath !== "AGENTS.md"
    ? [{ start: 0, end: content.length }]
    : managedRegions;

  for (const region of regions) {
    const text = content.slice(region.start, region.end);
    forEachLine(text, (line, relativeLineNumber, offset) => {
      const absoluteOffset = region.start + offset;
      for (const clause of clauseSegments(line)) {
        if (isNegatedDirective(clause.text) || !hasDirectiveExternalWritePath(clause.text, repoRoot)) {
          continue;
        }
        findings.push(securityFinding({
          code: securityCodes.writeSurface,
          file: target.relativePath,
          line: lineForOffset(content, absoluteOffset + clause.offset),
          patternClass: "external-write-path",
          summary: "directs agents to modify files outside configured Atlas paths",
          remediation: "Route writes through `.ai/config.json` paths or remove the external write instruction."
        }));
      }
    });
  }

  return findings;
}

async function scanSkills(repoRoot, config) {
  const findings = [];
  const skillsRoot = resolveArtifactPath(config, "skills");
  const skillDirectories = await listSkillDirectories(repoRoot, skillsRoot);

  for (const skillDirectory of skillDirectories) {
    const skillPath = normalizePath(path.join(skillDirectory, "SKILL.md"));
    const skillContent = await readTextTarget(repoRoot, skillPath);
    if (skillContent === null) {
      continue;
    }
    findings.push(...scanAllowedTools(skillPath, skillContent));
    findings.push(...await scanUnreferencedExecutables(repoRoot, skillDirectory, skillContent));
  }

  return findings;
}

function scanAllowedTools(skillPath, content) {
  const frontmatter = parseFrontmatter(content);
  if (!frontmatter) {
    return [];
  }

  const grants = allowedToolsEntries(frontmatter.lines);
  const findings = [];
  for (const grant of grants) {
    if (!broadToolGrantPattern().test(grant.value)) {
      continue;
    }
    findings.push(securityFinding({
      code: securityCodes.skillAudit,
      file: skillPath,
      line: grant.line,
      patternClass: "broad-allowed-tools",
      summary: "grants broad skill tool access",
      remediation: "Narrow `allowed-tools` to the minimum read or command surface the skill needs."
    }));
  }
  return findings;
}

async function scanUnreferencedExecutables(repoRoot, skillDirectory, skillContent) {
  const findings = [];
  const files = await listFiles(repoRoot, skillDirectory);
  for (const file of files) {
    if (file.relativePath.endsWith("/SKILL.md")) {
      continue;
    }
    const stats = await fileStat(repoRoot, file.relativePath);
    if (!stats?.isFile() || (stats.mode & 0o111) === 0) {
      continue;
    }
    const relativeToSkill = normalizePath(path.relative(skillDirectory, file.relativePath));
    if (skillContent.includes(relativeToSkill) || skillContent.includes(path.basename(file.relativePath))) {
      continue;
    }
    findings.push(securityFinding({
      code: securityCodes.skillAudit,
      file: file.relativePath,
      line: 1,
      patternClass: "unreferenced-executable",
      summary: "is executable but not referenced by the skill body",
      remediation: "Remove the executable bit, delete the file, or reference the script from SKILL.md with a reviewed purpose."
    }));
  }
  return findings;
}

function managedSkillDriftSecurityFindings(driftFindings) {
  return driftFindings
    .filter((finding) => finding.code === "customized-skill" && finding.file)
    .map((finding) => {
      return securityFinding({
        code: securityCodes.skillAudit,
        file: finding.file,
        line: 1,
        patternClass: "managed-skill-drift",
        summary: "managed skill content differs from the recorded baseline",
        remediation: "Review the skill diff before adopting the baseline or resetting the managed skill."
      });
    });
}

function securityFinding({ code, file, line, patternClass, summary, remediation }) {
  return {
    code,
    message: `${file}:${line} ${summary} (${patternClass})`,
    severity: "advisory",
    fixable: false,
    file,
    line,
    patternClass,
    remediation,
    details: [
      `Pattern: ${patternClass}`,
      `Remediation: ${remediation}`
    ]
  };
}

function parseFrontmatter(content) {
  const lines = content.split("\n");
  if (lines[0]?.trim() !== "---") {
    return null;
  }
  const end = lines.slice(1).findIndex((line) => line.trim() === "---");
  if (end === -1) {
    return null;
  }
  return {
    lines: lines.slice(1, end + 1).map((text, index) => ({ text, line: index + 2 }))
  };
}

function allowedToolsEntries(lines) {
  const entries = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const inline = line.text.match(/^\s*allowed-tools\s*:\s*(.+?)\s*$/iu);
    if (inline) {
      entries.push({ value: inline[1], line: line.line });
      continue;
    }

    if (!/^\s*allowed-tools\s*:\s*$/iu.test(line.text)) {
      continue;
    }
    for (const nested of lines.slice(index + 1)) {
      if (/^\S/u.test(nested.text)) {
        break;
      }
      const item = nested.text.match(/^\s*-\s*(.+?)\s*$/u);
      if (item) {
        entries.push({ value: item[1], line: nested.line });
      }
    }
  }
  return entries;
}

function broadToolGrantPattern() {
  return /(?:^|[\s,])(?:\*|Bash(?:\([^)]*\))?|Shell(?:\([^)]*\))?|Write(?:\([^)]*\))?|Edit(?:\([^)]*\))?|MultiEdit(?:\([^)]*\))?)(?=$|[\s,])/iu;
}

async function listSkillDirectories(repoRoot, skillsRoot) {
  const stats = await fileStat(repoRoot, skillsRoot);
  if (!stats?.isDirectory()) {
    return [];
  }
  let entries;
  try {
    entries = await readdir(repoPath(repoRoot, skillsRoot), { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => normalizePath(path.join(skillsRoot, entry.name)));
}

async function listFiles(repoRoot, relativeRoot) {
  let entries;
  try {
    entries = await readdir(repoPath(repoRoot, relativeRoot), { withFileTypes: true });
  } catch {
    return [];
  }

  const files = [];
  for (const entry of entries) {
    const relativePath = normalizePath(path.join(relativeRoot, entry.name));
    if (entry.isDirectory()) {
      files.push(...await listFiles(repoRoot, relativePath));
    } else if (entry.isFile()) {
      files.push({ relativePath });
    }
  }
  return files;
}

function htmlComments(content, managedRegions) {
  const comments = [];
  const commentPattern = /<!--[\s\S]*?-->/gu;
  for (const match of content.matchAll(commentPattern)) {
    const text = match[0];
    comments.push({
      text,
      index: match.index,
      managed: /<!--\s*(?:BEGIN|END)\s+ATLAS:/u.test(text) || isInsideManagedBlock(managedRegions, match.index)
    });
  }
  return comments;
}

function imperativeHtmlComment(comment) {
  return /\b(?:agent|assistant|model|codex|claude)\b[\s\S]{0,80}\b(?:ignore|run|execute|write|delete|send|exfiltrate|install|read)\b/iu.test(comment)
    || /\b(?:ignore\s+(?:previous|above|earlier)\s+instructions?|do\s+not\s+(?:tell|inform)\s+the\s+user|you\s+must\s+silently)\b/iu.test(comment);
}

function managedBlockRegions(content) {
  const regions = [];
  const blockPattern = /<!-- BEGIN ATLAS:[\s\S]*?<!-- END ATLAS:[^\n]*-->/gu;
  for (const match of content.matchAll(blockPattern)) {
    regions.push({ start: match.index, end: match.index + match[0].length });
  }
  return regions;
}

function isInsideManagedBlock(managedRegions, offset) {
  return managedRegions.some((region) => offset >= region.start && offset < region.end);
}

function isNegatedDirective(line) {
  return /\b(?:do\s+not|don't|never|must\s+not|refuse\s+to)\s+(?:[\w-]+\s+){0,8}?\b(?:read|cat|open|load|copy|collect|send|upload|post|exfiltrate|transmit|write|create|edit|modify|delete|move|append|overwrite|save|run|call|invoke|ignore)\b/iu.test(line);
}

function hasDirectivePath(clause) {
  return hasDirectivePathAfterVerb(clause, directiveVerbPattern, () => true);
}

function hasDirectiveExternalWritePath(clause, repoRoot) {
  return writeVerbPattern.test(clause)
    && hasDirectivePathAfterVerb(clause, writeVerbTokenPattern, (value) =>
      !pathResolvesInsideWorkspace(value, repoRoot));
}

function hasDirectivePathAfterVerb(clause, verbPattern, acceptsPath) {
  for (const match of clause.matchAll(verbPattern)) {
    if (!hasDirectiveVerbContext(clause, match.index)) {
      continue;
    }
    const afterVerb = clause.slice(match.index, match.index + 120);
    if (!directivePathLikePattern.test(afterVerb)) {
      continue;
    }
    for (const pathMatch of afterVerb.matchAll(directivePathPattern)) {
      const value = trimTrailingPathPunctuation(pathMatch.groups.value);
      if (acceptsPath(value)) {
        return true;
      }
    }
  }
  return false;
}

function hasDirectiveVerbContext(clause, verbIndex) {
  const prefix = clause.slice(0, verbIndex).trim();
  if (prefix === "" || /^(?:[-*+>]\s*|\d+[.)]\s*)+$/u.test(prefix)) {
    return true;
  }
  const tokens = prefix.toLowerCase().match(/\b[\w-]+\b/gu) ?? [];
  return tokens.slice(-4).some((token) => directiveContextMarkers.has(token));
}

function trimTrailingPathPunctuation(value) {
  return value.replace(/[.,;:]+$/u, "");
}

function pathResolvesInsideWorkspace(value, repoRoot) {
  if (value.startsWith("~")) {
    return false;
  }
  const relative = path.relative(path.resolve(repoRoot), path.resolve(value));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function forEachLine(content, callback) {
  let offset = 0;
  const lines = content.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    callback(lines[index], index + 1, offset);
    offset += lines[index].length + 1;
  }
}

function clauseSegments(line) {
  const clauses = [];
  const delimiterPattern = /[.;](?=\s|$)|\s+(?:but|however)\s+/giu;
  let start = 0;
  for (const match of line.matchAll(delimiterPattern)) {
    pushClauseSegment(clauses, line, start, match.index);
    start = match.index + match[0].length;
  }
  pushClauseSegment(clauses, line, start, line.length);
  return clauses;
}

function pushClauseSegment(clauses, line, start, end) {
  const raw = line.slice(start, end);
  const leadingWhitespace = raw.match(/^\s*/u)?.[0].length ?? 0;
  const text = raw.trim();
  if (text !== "") {
    clauses.push({ text, offset: start + leadingWhitespace });
  }
}

function lineForOffset(content, offset) {
  return content.slice(0, offset).split("\n").length;
}

async function readTextTarget(repoRoot, relativePath) {
  try {
    return await readFile(repoPath(repoRoot, relativePath), "utf8");
  } catch {
    return null;
  }
}

async function fileStat(repoRoot, relativePath) {
  try {
    return await stat(repoPath(repoRoot, relativePath));
  } catch {
    return null;
  }
}

function dedupeFindings(findings) {
  const seen = new Set();
  const deduped = [];
  for (const finding of findings) {
    const key = `${finding.code}:${finding.file}:${finding.line}:${finding.patternClass}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(finding);
  }
  return deduped;
}

function compareFindings(left, right) {
  return left.file.localeCompare(right.file)
    || left.line - right.line
    || left.code.localeCompare(right.code)
    || left.patternClass.localeCompare(right.patternClass);
}
