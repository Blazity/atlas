import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

test("packed CLI initializes and doctors a temp repo", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "atlas-pack-"));
  const repo = path.join(workspace, "repo");
  let tarball = null;
  try {
    const { stdout } = await execFileAsync("npm", ["pack", "--json"], { cwd: process.cwd() });
    const [{ filename }] = JSON.parse(stdout);
    tarball = path.join(process.cwd(), filename);
    await execFileAsync("tar", ["-xzf", tarball, "-C", workspace]);
    const packageRoot = path.join(workspace, "package");
    await symlink(path.join(process.cwd(), "node_modules"), path.join(packageRoot, "node_modules"), "dir");

    await execFileAsync("git", ["init", repo]);
    const init = await execFileAsync("node", [path.join(packageRoot, "bin/atlas.js"), "init"], { cwd: repo });
    const doctor = await execFileAsync("node", [path.join(packageRoot, "bin/atlas.js"), "doctor"], { cwd: repo });
    const skill = await readFile(path.join(repo, ".ai/skills/atlas-setup/SKILL.md"), "utf8");
    const customization = await readFile(path.join(repo, ".ai/skills/atlas-setup/customization.md"), "utf8");
    const reviewSkill = await readFile(path.join(repo, ".ai/skills/atlas-review/SKILL.md"), "utf8");
    const compactSkill = await readFile(path.join(repo, ".ai/skills/atlas-compact/SKILL.md"), "utf8");
    const memorySkill = await readFile(path.join(repo, ".ai/skills/atlas-memory/SKILL.md"), "utf8");

    assert.match(init.stdout, /Atlas init/);
    assert.match(doctor.stdout, /No issues found/);
    assert.match(skill, /name: atlas-setup/);
    assert.match(skill, /npx --yes @blazity-atlas\/core@latest init/);
    assert.match(skill, /npx --yes @blazity-atlas\/core@latest doctor --fix/);
    assert.match(skill, /customization\.md/);
    assert.match(customization, /Atlas Customization/);
    assert.match(reviewSkill, /name: atlas-review/);
    assert.match(compactSkill, /name: atlas-compact/);
    assert.match(memorySkill, /name: atlas-memory/);
  } finally {
    if (tarball) {
      await rm(tarball, { force: true });
    }
    await rm(workspace, { recursive: true, force: true });
  }
});

test("package publishes scoped package publicly by default", async () => {
  const packageJson = JSON.parse(await readFile(path.join(process.cwd(), "package.json"), "utf8"));

  assert.equal(packageJson.name, "@blazity-atlas/core");
  assert.equal(packageJson.publishConfig?.access, "public");
});

test("Claude plugin manifest exposes the managed skills directory", async () => {
  const packageJson = JSON.parse(await readFile(path.join(process.cwd(), "package.json"), "utf8"));
  const pluginJson = JSON.parse(await readFile(path.join(process.cwd(), ".claude-plugin/plugin.json"), "utf8"));

  assert.equal(pluginJson.name, "atlas");
  assert.equal(pluginJson.displayName, "Atlas");
  assert.equal(pluginJson.version, packageJson.version);
  assert.equal(pluginJson.skills, "./skills/");
  assert.equal(pluginJson.hooks, undefined);
  assert.equal(pluginJson.commands, undefined);
  assert.equal(pluginJson.mcpServers, undefined);
});

test("package includes standalone managed skills but excludes Claude plugin metadata", async () => {
  let tarball = null;
  try {
    const { stdout } = await execFileAsync("npm", ["pack", "--dry-run", "--json"], { cwd: process.cwd() });
    const [pack] = JSON.parse(stdout);
    const files = pack.files.map((file) => file.path);

    assert(files.includes("skills/atlas-setup/SKILL.md"));
    assert(files.includes("skills/atlas-setup/customization.md"));
    assert(files.includes("skills/atlas-review/SKILL.md"));
    assert(files.includes("schema/config.schema.json"));
    assert(files.includes("schema/atlas-lock.schema.json"));
    assert(files.includes("skills/atlas-memory/SKILL.md"));
    assert(!files.includes(".claude-plugin/plugin.json"));
  } finally {
    if (tarball) {
      await rm(tarball, { force: true });
    }
  }
});
