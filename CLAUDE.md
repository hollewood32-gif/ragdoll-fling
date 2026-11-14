# Project: Ragdoll Fling (working title)

A browser-based physics game and the first project for the owner's portfolio site.
Original game, inspired by the *feel* of old ragdoll sandbox toys, not a copy of any of them.

## About the owner and how to work with them

- New to building software. The real goal is learning to direct Claude to build and ship software the way real teams do (Git, GitHub, pull requests, CI/CD, cloud deployment, DNS), and to be able to explain all of it in a job interview.
- Explain things in plain language. Before running any command, say in one line what it does.
- Work in small steps. Show the result before moving on.
- At the end of each phase, give a short recap: what we built, the key concept in one paragraph, how the owner can verify it themselves, and an example prompt they could reuse on a future project.
- The owner handles ALL logins, passwords, and API tokens. Never ask for secrets to be pasted into chat. Say what to create and where to put it.
- Everything stays on free tiers.

## Game design (approved)

**Concept:** A timed physics game. A ragdoll sits in a walled arena. The player grabs it with the mouse, flings it into walls, and the round score is the total damage dealt.

- **Core mechanic:** click and drag to grab the ragdoll, release to throw.
- **Damage rule:** each impact deals damage based on impact speed. Harder hits give bigger numbers.
- **Combos:** impacts in quick succession build a multiplier. The combo breaks if the player pauses too long.
- **Round:** 30 seconds (easy to tweak), then a results screen with the total score and a restart button.
- **Feel ("juice"):** floating damage numbers, screen shake that scales with hit strength, brief flashes on impact.
- **Art:** shapes drawn in code, bold flat colors. No image files.
- **Platform:** desktop first. Use the browser's Pointer Events so phone/touch support is a small later change.

**Version 1 is done when:**
1. Timed round, scoring, combos, and restart work.
2. Best score is remembered on the device (localStorage).
3. There is a start menu.
4. There are basic sound effects.

**Out of scope for v1:** multiple weapons, upgrades or shops (planned after v1, see phase 7), online leaderboard (stretch goal), mobile controls (a later feature PR).

## Tech stack

- TypeScript, built with Vite.
- Plain HTML Canvas for rendering, Matter.js for 2D physics (rigid bodies, joints, mouse dragging).
  - Chosen over Phaser (extra concepts not needed yet) and Three.js (3D, overkill).
  - Own the game loop so the owner understands it.
- Public GitHub repo. `main` is protected. Every change goes through a pull request.
- Hosting: Cloudflare Workers. Production at `[game].[mydomain.com]`, staging at `[game]-staging.[mydomain.com]`. If the domain is not on Cloudflare DNS yet, walk the owner through moving it.
- All Cloudflare configuration lives in the repo (infrastructure as code), not in dashboard settings.
- CI/CD with GitHub Actions:
  - Every PR runs lint, type-check, tests, and a build, and provides a preview link to play the change before merging.
  - Merging to `main` deploys automatically to staging.
  - Production deploys from staging after the owner manually approves.
- Stretch goal: online high-score leaderboard with a small API and a Cloudflare D1 database, migrations run by the pipeline.

## Domain and names (filled in during phase 5)

- Game subdomain / Worker name: `fling` (repo is still `ragdoll-fling`, the working title)
- Domain: jeffreydoughty.com
- Registrar / DNS: Cloudflare (DNS already on Cloudflare, so no nameserver move was needed)
- Production: https://fling.jeffreydoughty.com (Worker `fling`). Staging: https://fling-staging.jeffreydoughty.com (Worker `fling-staging`)
- PR previews: `https://pr-<number>-fling-staging.ragdoll-fling.workers.dev` (preview versions of the staging Worker)
- workers.dev address: https://fling.ragdoll-fling.workers.dev (Wrangler auto-registered the account subdomain `ragdoll-fling.workers.dev` on first deploy)

## Phase plan and status

1. [x] Game design interview, saved here.
2. [x] Setup: check for Git, Node.js, GitHub CLI. Help install anything missing. Owner logs in to GitHub and Cloudflare themselves. (Done 2026-11-13. Cloudflare login moved to phase 5, when Wrangler is installed.)
3. [x] Prototype: smallest playable version on the owner's computer (timed round, score, restart). (Done 2026-11-13. Also has combos and juice. Fixed a bug where a resting ragdoll's twitching limb scored free points; hits now need `minBodySpeed`. Open balance question: holding and pumping the ragdoll against a wall scores very high.)
4. [x] GitHub: create repo, push code, open the first pull request, protect `main`. (Done 2026-11-13. Repo: https://github.com/hollewood32-gif/ragdoll-fling. PR #1 added the README and was merged by the owner.)
5. [x] First deploy: deploy once by command to see what the pipeline will automate, then connect the subdomain. (Done 2026-11-13. `npm run deploy` = build + `wrangler deploy`. Config in `wrangler.jsonc`: static assets from `dist/` plus the custom domain route.)
6. [x] CI/CD: build the pipeline above. Prove it by opening a PR with a failing test and showing it gets blocked. (Done 2026-11-13. PR #4 added it; PR #5 planted a bug, the required `checks` job failed, merging was blocked, and the PR was closed unmerged. The first pipeline production deploy was approved by the owner.)
7. [ ] Feature PRs: best-score memory (PR #7), start menu, sound effects, score balance, polish, then mobile controls. After those (post-v1, decided 2026-11-13): currency and upgrades, as several small PRs.
   - Score balance (added 2026-11-13): rounds reach 200,000+ damage, mostly from holding the ragdoll and pumping it against a wall. Options to weigh with the owner: cap damage from a single hit, make hits count less while the ragdoll is held, or slow how fast the multiplier grows. Settle this before currency/upgrades, since coins will be based on damage.
   - Draft idea: coins earned from round damage (e.g. 1 per 100). A shop between rounds with upgrades like +round time, +damage %, longer combo window, higher max multiplier, bouncier walls. Progress saved in localStorage.
   - Decide before building: upgrades make scores grow from repeat play, not only skill. Settle how that affects "best score" and the leaderboard stretch goal (for example, a separate "no upgrades" score).
8. [ ] Stretch: leaderboard with API and D1.

## Notes for future sessions

- Read this file first. Check the status checkboxes above to see where we left off, and update them as phases finish.
- Keep each PR small and reviewable so the owner can explain every change.
- Machine: Windows 11, PowerShell. Tools installed with winget: Git 2.56, Node.js 26 LTS (npm 11), GitHub CLI 2.104. The owner is logged in to the GitHub CLI over HTTPS.
- Git workflow: `main` is protected by a GitHub ruleset ("Protect main": PR required, 0 approvals, no force push, no deletion). Every change, including CLAUDE.md updates, goes on a branch, then a PR. The owner reads and merges PRs themselves. After a merge: `git switch main`, `git pull`, `git branch -d <branch>`.
- Pipeline (GitHub Actions):
  - `.github/workflows/ci.yml` runs on PRs. The `checks` job (lint, typecheck, test, build) is a required status check in the "Protect main" ruleset. The `preview` job uploads `wrangler versions upload --env staging --preview-alias pr-N` and comments the link.
  - `.github/workflows/deploy.yml` runs on push to main: `build` → `staging` (auto) → `production` (waits for the owner's approval). Both deploys use the same build artifact.
  - GitHub environments: `staging` (no gate) and `production` (required reviewer: hollewood32-gif; protected branches only). Set up with `gh api`, not in the repo.
  - Secret `CLOUDFLARE_API_TOKEN`: the owner made it from the "Edit Cloudflare Workers" template, trimmed to Workers Scripts Edit, Account Settings Read, Workers Routes Edit, Zone Read and User reads, limited to jeffreydoughty.com. No DNS Edit. Add D1 Edit for the leaderboard.
  - Always pass `--env staging` or `--env=""` to Wrangler (scripts `deploy:staging`, `deploy:production`).
- Lint is Oxlint, not ESLint, because typescript-eslint doesn't support TypeScript 7 yet. Tests are Vitest (`src/*.test.ts`).
- npm warns that esbuild and workerd install scripts aren't approved (allowScripts). Deploys work anyway; revisit if `wrangler dev` is needed.
- GitHub's merge and approve buttons are two-step (Merge → Confirm merge; Review deployments → tick the box → Approve). Verify with `gh pr view N --json state` before continuing, and don't approve production deploys for the owner.
- PowerShell 5.1 quirks: piping a here-string into `git commit -F -` adds an invisible BOM to the message, so use several `-m` flags instead. Avoid `--jq` filters that contain `"` or `\(`.
- `.claude/` is gitignored (local launch config with this machine's Node path). `.gitattributes` forces LF line endings.
- After installing tools, an already-open shell may not see them until PATH is reloaded or a new terminal is opened. The Claude app's Terminal panel was opened before the installs and has a stale PATH.
- The owner's own PowerShell blocks scripts (default execution policy), so `npx`/`npm` resolve to blocked `.ps1` files. Tell the owner to use `npx.cmd` / `npm.cmd`. Don't change the execution policy.
- Wrangler on this computer is logged in as the owner via OAuth (`npx wrangler whoami` to check); CI uses the API token instead. In Claude's PowerShell, `Invoke-WebRequest` needs TLS 1.2; `curl.exe` is simpler for URL checks.
