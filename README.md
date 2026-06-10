# Developer Garden 🌱

A living visual representation of your journey as a developer. Every project you open becomes a plant. Every skill you practice grows its own. Achievements bloom into decorations, wildlife moves in over time, and your whole history becomes a garden you can walk back through.

Open it after two years and feel: *"Wow, I built all of this."*

This is **not** a virtual pet and **not** a productivity tracker. There is nothing to water, feed, or maintain — and nothing can ever die, decay, or shame you.

## What it does

- **Project plants** — each workspace becomes a permanent plant: Seed → Sprout → Plant → Tree → Mature. Finished projects remain as monuments.
- **Skill plants** — Laravel, React, Python, Docker, AWS and many more, detected locally and grown by real time spent in them.
- **Achievements** — First Commit, Seven Days of Sun, A Hundred Rings… each unlock adds a visible decoration to the garden (a daisy, a lantern, a pond, a bench).
- **Wildlife** — butterflies, bees, birds, a fox, an owl. Rare, collectible, never purchasable.
- **Daily & weekly summaries** — hours worked, files touched, commits, growth gained, most active project, most improved skill.
- **Career timeline** — every project grouped by the year it was first planted. A visual career journal.
- **Dormancy, never death** — after two weeks of inactivity a plant simply rests under a light frost. When you return, the garden says *"Welcome back."* Nothing is ever lost.

## The growth system

Growth is calculated from weighted, rate-limited signals — never from lines of code or keystrokes:

| Signal | Points | Guard |
| --- | --- | --- |
| Active minute of work | 1 | presence-based (reading & debugging count), capped at 8h/day |
| Meaningful save | 2 | 30s cooldown, max 40/day |
| Git commit | 12 | detected via the built-in Git extension |
| Successful test run | 8 | VS Code test tasks, max 10/day |
| Successful task (build/deploy) | 4 | max 10/day |
| Weekly consistency bonus | 15 | once/day when 3+ of the last 7 days were active |

A developer who spends eight hours debugging earns the same growth as one who writes eight hours of new code. Failed builds and quiet days are simply ignored — the system is additive only.

## Privacy

**Nothing ever leaves your machine.** No code is uploaded. No file contents are read for analysis. No telemetry. The extension stores a single JSON file of metadata (plant names, growth points, daily counters) in VS Code's local global storage, and works fully offline. You can inspect or export it any time with `Developer Garden: Export Garden Data`.

## Commands

- `Developer Garden: Open Garden`
- `Developer Garden: Today's Summary`
- `Developer Garden: This Week's Summary`
- `Developer Garden: Export Garden Data (JSON)`

## Architecture

```
src/
  extension.ts     entry point: wiring, commands, status bar
  types.ts         data model + growth tuning constants (one source of truth)
  store.ts         debounced JSON persistence in global storage
  growthEngine.ts  signal listeners (editor, git, tasks), heartbeat, rate limits
  skills.ts        local language/framework detection
  achievements.ts  achievement + wildlife definitions and unlock evaluation
  summaries.ts     daily/weekly aggregation, friendly copy
  gardenView.ts    webview host + view-model builder
media/
  garden.js        procedural SVG garden renderer (deterministic per project)
  garden.css       evening-meadow palette, gentle motion, reduced-motion safe
```

Performance: one 60-second heartbeat timer, debounced writes, no background scanning, no network. The webview only renders while visible.

## Development

```bash
npm install
npm run compile     # or: npm run watch
```

Press **F5** in VS Code to launch an Extension Development Host, then open any folder and start working — a seed will appear in the Developer Garden view in the activity bar.

## Roadmap (post-MVP)

Cloud sync & cross-device restore, garden sharing (celebration, never competition — no leaderboards, ever), cosmetic themes and plant packs (cosmetics only; progress is never for sale), and an optional AI garden guide that encourages and never pressures.
