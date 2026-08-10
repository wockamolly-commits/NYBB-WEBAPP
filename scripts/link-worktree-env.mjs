import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { copyFileSync, existsSync, linkSync } from "node:fs";

const worktreeRoot = process.cwd();
const target = join(worktreeRoot, ".env.local");

if (existsSync(target)) process.exit(0);

let commonGitDirectory;
try {
  commonGitDirectory = execFileSync(
    "git",
    ["rev-parse", "--path-format=absolute", "--git-common-dir"],
    { cwd: worktreeRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  ).trim();
} catch {
  console.warn("[env] Could not locate the primary Git worktree. Sign-in may be unavailable.");
  process.exit(0);
}

const primaryRoot = dirname(resolve(worktreeRoot, commonGitDirectory));
const source = join(primaryRoot, ".env.local");

if (!existsSync(source)) {
  console.warn("[env] The primary worktree has no .env.local. Sign-in may be unavailable.");
  process.exit(0);
}

if (source === target) process.exit(0);

try {
  linkSync(source, target);
  console.log("[env] Linked the worktree to the primary .env.local.");
} catch {
  copyFileSync(source, target);
  console.log("[env] Copied the primary .env.local into this worktree.");
}
