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

**v1 status: done** (2026-11-13). All four items shipped in PRs #7 (best score), #8 (start menu) and #9 (sound), plus score balance (#10), polish (#11, #12) and mobile controls (#13).

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
7. [x] Feature PRs. v1 items: best-score memory (#7), start menu (#8), sound effects (#9), score balance (#10: held hits score 25% and skip the combo; best scores reset to `best-score-v2`), polish (#11 stats/sparks/reduced motion, #12 favicon and link preview card), mobile controls (#13). Then currency and upgrades: design (#14), coins and Pure best (#15), shop and upgrades (#16).

### Currency and upgrades design (approved 2026-11-13)

- **Coins:** 1 coin per 100 damage, added at the end of each round. Saved in localStorage. Shown on the results screen ("+N coins") and the menu (total).
- **Two best scores:** "Best" counts any round. "Pure best" only counts rounds played with upgrades switched off. The leaderboard stretch goal should use Pure best, so it measures skill, not grind.
- **Upgrades On/Off switch** on the menu, remembered. Off plays with every upgrade at level 0 (needed for Pure best).
- **Shop:** a "Shop" button on the menu and the results screen. Four upgrades, 5 levels each:
  - Longer rounds: +3 s per level (30 s up to 45 s).
  - Harder hits: +10% damage per level (up to +50%).
  - Longer combo window: +0.15 s per level (1.0 s up to 1.75 s).
  - Bouncier walls: more wall bounce per level, so throws ricochet into more hits.
- **Prices per level:** 500, 900, 1,600, 2,800, 5,000 (about x1.75 each). Maxing one upgrade takes about 18 good rounds; all four about 70. All numbers live in `config.ts`.
- Coins and upgrade levels are separate from the best-score keys, so changing scoring later (and bumping the best-score key) doesn't wipe purchases.
8. [x] Stretch: leaderboard with API and D1. (Done 2026-11-14. Live at https://fling.jeffreydoughty.com/api/leaderboard; production board started empty.) Built as three PRs:
   - [x] PR #17: server foundation (Worker API code, first migration, D1 bindings, migrations in the pipeline, `npm run approve`).
   - [x] PR #18: `POST /api/scores` with validation, plausibility cap and rate limit (5 per visitor per minute; rate-limit namespaces 1001 production, 1002 staging).
   - [x] PR #19: leaderboard screen in the game and the submit prompt on a new Pure best (client code in `src/leaderboard.ts`; initials remembered in localStorage; key shortcuts ignored while typing).
   - Full local test: the `worker` entry in `.claude/launch.json` runs `wrangler dev --env staging` on port 8787 (serves the built `dist/` plus the API with a local database). Run `npm run build` first. A hidden browser pane pauses the game loop, so full rounds need the pane visible.

### Leaderboard design (approved 2026-11-13)

- **Names:** 3-letter initials, A to Z only (arcade style). No free text, so nothing to moderate and no personal info.
- **Board:** top 10 all-time **Pure** scores (no upgrades), highest first, ties go to the earlier score.
- **Submitting:** only on a new Pure best, and only when the player clicks "Submit to leaderboard". Nothing is sent automatically.
- **Anti-cheat (sensible, not perfect):** server rejects malformed data and scores above 300,000 (about 5x the best human pure round); a Workers rate-limit binding caps submissions per visitor. A determined cheater can still post a believable fake score; that's accepted for a browser game.
- **Privacy:** the database stores initials, score and date only. IP addresses are used in memory for rate limiting and never stored.
- **Databases:** `fling-scores` (production, id `ad225ebb-634e-4b50-8cb4-1a63bd42fa89`) and `fling-scores-staging` (staging and PR previews, id `2423c963-2185-439f-a114-0748d8af0c40`), both created 2026-11-13 in region WNAM. Binding name `DB` in both.
- **Migrations:** numbered SQL files in `migrations/`. Never edit one that has run; add a new file. The pipeline applies them before each deploy (and PR previews apply them to the staging database).
- **API token:** needs Account → D1 → Edit in addition to the Workers permissions.
- **Local testing:** `npx wrangler d1 migrations apply DB --local --env staging`, then `wrangler dev --env staging` serves the game and API on http://localhost:8787.

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
- `npm.cmd run approve` (run from this folder; it only approves this repo) waits for a deploy that's still building or on staging (checks every 10 s, up to 6 minutes) and approves production as soon as it's ready, so the owner can run it straight after merging. Ported from the portfolio site's version (its PR #16) on 2026-11-14. Don't run it yourself while a deploy is waiting.
- PowerShell 5.1 quirks: piping a here-string into `git commit -F -` adds an invisible BOM to the message, so use several `-m` flags instead. Avoid `--jq` filters that contain `"` or `\(`.
- `.claude/` is gitignored (local launch config with this machine's Node path). `.gitattributes` forces LF line endings.
- After installing tools, an already-open shell may not see them until PATH is reloaded or a new terminal is opened. The Claude app's Terminal panel was opened before the installs and has a stale PATH.
- The owner's own PowerShell blocks scripts (default execution policy), so `npx`/`npm` resolve to blocked `.ps1` files. Tell the owner to use `npx.cmd` / `npm.cmd`. Don't change the execution policy.
- Wrangler on this computer is logged in as the owner via OAuth (`npx wrangler whoami` to check); CI uses the API token instead. In Claude's PowerShell, `Invoke-WebRequest` needs TLS 1.2; `curl.exe` is simpler for URL checks.
