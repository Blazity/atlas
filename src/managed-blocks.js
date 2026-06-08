export function applyManagedBlock(content, id, body) {
  const normalizedBody = body.trimEnd();
  const block = [
    `<!-- BEGIN ATLAS: ${id} -->`,
    normalizedBody,
    `<!-- END ATLAS: ${id} -->`
  ].join("\n");
  const pattern = managedBlockPattern(id);

  if (pattern.test(content)) {
    return content.replace(pattern, block);
  }

  const prefix = content.trimEnd();
  return `${prefix}${prefix ? "\n\n" : ""}${block}\n`;
}

export function hasManagedBlock(content, id) {
  return managedBlockPattern(id).test(content);
}

export function inspectManagedBlock(content, id) {
  const beginPattern = markerPattern("BEGIN", id);
  const endPattern = markerPattern("END", id);
  const blockPattern = managedBlockPattern(id, "gu");
  const beginCount = [...content.matchAll(beginPattern)].length;
  const endCount = [...content.matchAll(endPattern)].length;
  const blockCount = [...content.matchAll(blockPattern)].length;

  if (beginCount === 0 && endCount === 0) {
    return { state: "absent", blockCount };
  }

  if (beginCount !== endCount || blockCount !== beginCount) {
    return { state: "malformed", blockCount };
  }

  if (blockCount > 1) {
    return { state: "duplicate", blockCount };
  }

  return { state: "present", blockCount };
}

function managedBlockPattern(id, flags = "u") {
  return new RegExp(
    `<!-- BEGIN (?:AI-HARNESS|ATLAS): ${escapeRegExp(id)} -->[\\s\\S]*?<!-- END (?:AI-HARNESS|ATLAS): ${escapeRegExp(id)} -->`,
    flags
  );
}

function markerPattern(kind, id) {
  return new RegExp(`<!-- ${kind} (?:AI-HARNESS|ATLAS): ${escapeRegExp(id)} -->`, "gu");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
