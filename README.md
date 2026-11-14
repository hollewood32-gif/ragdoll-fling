# Ragdoll Fling

A browser physics game. Grab the ragdoll, fling it into the walls, and rack up as much damage as you can in 30 seconds.

> Working title. A live link will be added once the game is deployed.

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

## How it's built

- **TypeScript**, bundled with **Vite**
- **HTML Canvas** for drawing. Every shape is drawn in code; there are no image files.
- **Matter.js** for 2D physics: the ragdoll is ten bodies connected by joints.
- A hand-written game loop that steps the physics in fixed 1/60-second slices, so the game behaves the same on fast and slow screens.

| File | Job |
| --- | --- |
| `src/config.ts` | Every tunable number (round length, damage, combo timing) |
| `src/scoring.ts` | Damage and combo rules |
| `src/ragdoll.ts` | Builds the ragdoll from shapes and joints |
| `src/main.ts` | Game loop, input, collisions and drawing |

## How changes are made

`main` is protected: every change goes through a pull request. Automated checks and preview deploys are coming next.
