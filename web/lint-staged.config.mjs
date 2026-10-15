import { execSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

function listGitPaths(command) {
  const output = execSync(command, { encoding: "utf8" }).trim()
  return output ? output.split("\n") : []
}

// Read snapshot of unstaged files captured by husky pre-commit BEFORE
// lint-staged stashes. Falls back to live `git diff` if snapshot missing.
function readUnstagedSnapshot() {
  const gitDir = execSync("git rev-parse --git-dir", { encoding: "utf8" }).trim()
  const snapshotPath = join(gitDir, "lint-staged-unstaged-snapshot.txt")
  if (!existsSync(snapshotPath)) {
    return new Set(listGitPaths("git diff --name-only"))
  }
  const content = readFileSync(snapshotPath, "utf8").trim()
  return new Set(content ? content.split("\n") : [])
}

function getPartiallyStagedFiles() {
  const unstaged = readUnstagedSnapshot()
  const staged = listGitPaths("git diff --cached --name-only")
  return new Set(staged.filter((file) => unstaged.has(file)))
}

function excludePartiallyStaged(files) {
  const partiallyStaged = getPartiallyStagedFiles()
  const repoRoot = execSync("git rev-parse --show-toplevel", { encoding: "utf8" }).trim()
  return files.filter((file) => {
    const relative = file.startsWith(repoRoot) ? file.slice(repoRoot.length + 1) : file
    return !partiallyStaged.has(relative)
  })
}

function runIfAny(files, commands) {
  return files.length > 0 ? commands : []
}

export default {
  "web/**/*.{ts,tsx,js,jsx}": (files) => {
    const eligibleFiles = excludePartiallyStaged(files)

    return runIfAny(eligibleFiles, [
      `npx --prefix web prettier --write ${eligibleFiles.join(" ")}`,
      `npx --prefix web eslint --config web/eslint.config.mjs --fix ${eligibleFiles.join(" ")}`,
    ])
  },
  "api/**/*.{ts,js}": (files) => {
    const eligibleFiles = excludePartiallyStaged(files)

    return runIfAny(eligibleFiles, [`npx --prefix web prettier --write ${eligibleFiles.join(" ")}`])
  },
  "**/*.{json,css,md}": (files) => {
    const eligibleFiles = excludePartiallyStaged(files)

    return runIfAny(eligibleFiles, [`npx --prefix web prettier --write ${eligibleFiles.join(" ")}`])
  },
  "package.json": (files) => {
    const eligibleFiles = excludePartiallyStaged(files)

    return runIfAny(eligibleFiles, [`npx --prefix web prettier --write ${eligibleFiles.join(" ")}`])
  },
}
