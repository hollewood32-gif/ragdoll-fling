// Approves the production deploy, using the GitHub CLI you're logged in with,
// so the approval is yours. It's the same as Review deployments -> tick
// "production" -> Approve and deploy.
// Run with:  npm run approve   (npm.cmd run approve in Windows PowerShell)
//
// You can run it straight after merging a pull request:
//   - A deploy is already waiting for approval -> it approves it.
//   - A deploy is still building or deploying to staging -> it waits (checking
//     every 10 seconds, for up to 6 minutes) and approves it as soon as it's
//     ready. If the build or staging fails, it says so and stops.
//   - No deploy is running -> it says so.

import { execFileSync } from "node:child_process";

const REPO = "hollewood32-gif/ragdoll-fling";
const CHECK_EVERY_MS = 10_000;
const GIVE_UP_AFTER_MS = 6 * 60_000;

function gh(args) {
  return execFileSync("gh", args, { encoding: "utf8" });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// The most recent deploy runs, newest first.
function recentDeploys() {
  return JSON.parse(
    gh(["run", "list", "--repo", REPO, "--workflow", "deploy.yml", "--limit", "5", "--json", "databaseId,status,conclusion,displayTitle,url"]),
  );
}

// Approves the production step of one run. Returns true if it did.
function approveProduction(run) {
  const pending = JSON.parse(gh(["api", `repos/${REPO}/actions/runs/${run.databaseId}/pending_deployments`]));
  const production = pending.find((p) => p.environment.name === "production");
  if (!production) return false;

  console.log(`Approving production for: ${run.displayTitle}`);
  console.log(`  ${run.url}`);
  gh([
    "api", "--method", "POST",
    `repos/${REPO}/actions/runs/${run.databaseId}/pending_deployments`,
    "-F", `environment_ids[]=${production.environment.id}`,
    "-f", "state=approved",
    "-f", "comment=Approved with npm run approve",
  ]);
  console.log("  Approved. Production will deploy in about a minute.");
  return true;
}

// 1. Anything already waiting? Approve it.
const waiting = recentDeploys().filter((r) => r.status === "waiting");
if (waiting.length > 0) {
  for (const run of waiting) approveProduction(run);
  process.exit(0);
}

// 2. A deploy still building or deploying to staging? Wait for it.
const running = recentDeploys().find((r) => ["queued", "in_progress", "pending", "requested"].includes(r.status));
if (!running) {
  console.log("Nothing is waiting for approval, and no deploy is running.");
  process.exit(0);
}

console.log(`A deploy is still running: ${running.displayTitle}`);
console.log(`  ${running.url}`);
console.log("Waiting for it to reach the approval step (checking every 10 seconds)...");

const started = Date.now();
while (Date.now() - started < GIVE_UP_AFTER_MS) {
  await sleep(CHECK_EVERY_MS);
  const run = recentDeploys().find((r) => r.databaseId === running.databaseId);

  if (run?.status === "waiting") {
    approveProduction(run);
    process.exit(0);
  }
  if (run?.status === "completed") {
    // It finished without waiting for approval: usually the build or staging failed.
    console.log(`The deploy finished without reaching the approval step (result: ${run.conclusion}).`);
    console.log("  Open the link above to see which step failed.");
    process.exit(run.conclusion === "success" ? 0 : 1);
  }
  process.stdout.write(".");
}

console.log("\nGave up after 6 minutes. Check the link above, then run this again.");
process.exit(1);
