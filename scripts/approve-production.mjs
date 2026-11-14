// Approves the production deploy that is waiting for review, if there is one.
// Run with:  npm run approve   (npm.cmd run approve in Windows PowerShell)
//
// It uses the GitHub CLI you're logged in with, so the approval is yours.
// It's the same as Review deployments -> tick "production" -> Approve and deploy.

import { execFileSync } from "node:child_process";

const REPO = "hollewood32-gif/ragdoll-fling";

function gh(args) {
  return execFileSync("gh", args, { encoding: "utf8" });
}

const runs = JSON.parse(
  gh(["run", "list", "--repo", REPO, "--workflow", "deploy.yml", "--status", "waiting", "--json", "databaseId,displayTitle,url"]),
);

if (runs.length === 0) {
  console.log("Nothing is waiting for approval.");
  process.exit(0);
}

for (const run of runs) {
  const pending = JSON.parse(gh(["api", `repos/${REPO}/actions/runs/${run.databaseId}/pending_deployments`]));
  const production = pending.find((p) => p.environment.name === "production");
  if (!production) continue;

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
}
