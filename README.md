# Ragdoll Fling

A browser physics game. Grab the ragdoll, fling it into the walls, and rack up as much damage as you can in 30 seconds.

**Play it: https://fling.jeffreydoughty.com**

## How to play

- **Click and drag** any part of the ragdoll to grab it.
- **Release** to throw it.
- Harder impacts deal more damage.
- Land hits in quick succession to build a **combo multiplier** (up to x5). Pause for more than a second and the combo breaks.
- The clock starts on your first grab. When time runs out, you'll see your total and can play again.

## Run it on your computer

You need [Node.js](https://nodejs.org/) (the LTS version).

```bash
npm install      # download the libraries the game uses
npm run dev      # start a local server, then open http://localhost:5173
```

Other commands:

| Command | What it does |
| --- | --- |
| `npm run typecheck` | Checks the TypeScript code for type errors |
| `npm run build` | Type-checks, then builds the playable site into `dist/` |
| `npm run preview` | Serves the built `dist/` folder locally |
| `npm run lint` | Checks the code for mistakes and risky patterns (Oxlint) |
| `npm test` | Runs the unit tests (Vitest) |
| `npm run deploy:staging` | Builds and deploys to staging by hand (normally the pipeline does this) |
| `npm run deploy:production` | Builds and deploys to production by hand (normally the pipeline does this) |

## How it's built

- **TypeScript**, bundled with **Vite**
- **HTML Canvas** for drawing. Every shape is drawn in code; there are no image files.
- **Matter.js** for 2D physics: the ragdoll is ten bodies connected by joints.
- Hosted on **Cloudflare Workers** as static assets. The setup lives in `wrangler.jsonc`, not in dashboard settings.
- A hand-written game loop that steps the physics in fixed 1/60-second slices, so the game behaves the same on fast and slow screens.

| File | Job |
| --- | --- |
| `src/config.ts` | Every tunable number (round length, damage, combo timing) |
| `src/scoring.ts` | Damage and combo rules |
| `src/ragdoll.ts` | Builds the ragdoll from shapes and joints |
| `src/main.ts` | Game loop, input, collisions and drawing |

## How changes are made

`main` is protected: every change goes through a pull request, and GitHub Actions does the rest.

1. **Every pull request** runs lint, type-check, tests and a build (`.github/workflows/ci.yml`). The PR can't be merged unless these pass. The build is also uploaded as a preview, and a playable link is commented on the PR.
2. **Merging to `main`** deploys automatically to staging: https://fling-staging.jeffreydoughty.com (`.github/workflows/deploy.yml`).
3. **Production** (https://fling.jeffreydoughty.com) gets the exact same build, but only after the owner approves the deploy in GitHub.
