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

## Blanks to fill in later (needed by phase 5)

- Game name / subdomain: TBD
- Domain: TBD
- Registrar: TBD

## Phase plan and status

1. [x] Game design interview, saved here.
2. [x] Setup: check for Git, Node.js, GitHub CLI. Help install anything missing. Owner logs in to GitHub and Cloudflare themselves. (Done 2026-11-13. Cloudflare login moved to phase 5, when Wrangler is installed.)
3. [x] Prototype: smallest playable version on the owner's computer (timed round, score, restart). (Done 2026-11-13. Also has combos and juice. Fixed a bug where a resting ragdoll's twitching limb scored free points; hits now need `minBodySpeed`. Open balance question: holding and pumping the ragdoll against a wall scores very high.)
4. [x] GitHub: create repo, push code, open the first pull request, protect `main`. (Done 2026-11-13. Repo: https://github.com/hollewood32-gif/ragdoll-fling. PR #1 added the README and was merged by the owner.)
5. [ ] First deploy: deploy once by command to see what the pipeline will automate, then connect the subdomain.
6. [ ] CI/CD: build the pipeline above. Prove it by opening a PR with a failing test and showing it gets blocked.
7. [ ] Feature PRs: best-score memory, start menu, sound effects, polish, then mobile controls. After those (post-v1, decided 2026-11-13): currency and upgrades, as several small PRs.
   - Draft idea: coins earned from round damage (e.g. 1 per 100). A shop between rounds with upgrades like +round time, +damage %, longer combo window, higher max multiplier, bouncier walls. Progress saved in localStorage.
   - Decide before building: upgrades make scores grow from repeat play, not only skill. Settle how that affects "best score" and the leaderboard stretch goal (for example, a separate "no upgrades" score).
8. [ ] Stretch: leaderboard with API and D1.

## Notes for future sessions

- Read this file first. Check the status checkboxes above to see where we left off, and update them as phases finish.
- Keep each PR small and reviewable so the owner can explain every change.
- Machine: Windows 11, PowerShell. Tools installed with winget: Git 2.56, Node.js 26 LTS (npm 11), GitHub CLI 2.104. The owner is logged in to the GitHub CLI over HTTPS.
- Git workflow: `main` is protected by a GitHub ruleset ("Protect main": PR required, 0 approvals, no force push, no deletion). Every change, including CLAUDE.md updates, goes on a branch, then a PR. The owner reads and merges PRs themselves. After a merge: `git switch main`, `git pull`, `git branch -d <branch>`.
- When Phase 6 adds CI, add its checks as required status checks in the ruleset.
- PowerShell 5.1 quirks: piping a here-string into `git commit -F -` adds an invisible BOM to the message, so use several `-m` flags instead. Avoid `--jq` filters that contain `"` or `\(`.
- `.claude/` is gitignored (local launch config with this machine's Node path). `.gitattributes` forces LF line endings.
- After installing tools, an already-open shell may not see them until PATH is reloaded or a new terminal is opened.
