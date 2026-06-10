// Sidebar webview host. The extension side stays thin: it builds a small
// view-model from state and posts it; all drawing happens in media/garden.js.

import * as vscode from 'vscode';
import { Store } from './store';
import {
  DORMANT_AFTER_DAYS,
  GardenState,
  PROJECT_SPECIES,
  SKILL_SPECIES,
  Species,
  WEIGHTS,
  dayKey,
  emptyDay,
  stageFor
} from './types';
import { ACHIEVEMENTS, WILDLIFE, currentStreak } from './achievements';
import { dailySummary, weeklySummary } from './summaries';

export class GardenViewProvider implements vscode.WebviewViewProvider {
  static readonly viewType = 'developerGarden.gardenView';
  private view: vscode.WebviewView | undefined;
  private disposables: vscode.Disposable[] = [];

  constructor(private extensionUri: vscode.Uri, private store: Store) {
    this.disposables.push(store.onDidChange(() => this.postState()));
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'media')]
    };
    view.webview.html = this.html(view.webview);
    view.webview.onDidReceiveMessage((msg) => {
      if (msg?.type === 'ready') {
        this.postState();
      } else if (msg?.type === 'water' && typeof msg.name === 'string') {
        this.water(msg.name);
      } else if (msg?.type === 'species' && typeof msg.name === 'string' && typeof msg.species === 'string') {
        this.setSpecies(msg.name, msg.species);
      }
    });
    view.onDidChangeVisibility(() => {
      if (view.visible) {
        this.postState();
      }
    });
  }

  reveal(): void {
    if (this.view) {
      this.view.show?.(true);
    } else {
      void vscode.commands.executeCommand('developerGarden.gardenView.focus');
    }
  }

  /**
   * Optional play interaction. Watering is never required and never expires;
   * it grants a tiny care point once per plant per local day. Watering an
   * already-watered plant does nothing negative — it is simply already happy.
   */
  private water(name: string): void {
    let gained = 0;
    this.store.update((s) => {
      const plant = Object.values(s.projects).find((p) => p.name === name);
      if (!plant) {
        return;
      }
      const today = dayKey();
      const last = plant.lastWatered ? dayKey(new Date(plant.lastWatered)) : '';
      if (last === today) {
        return; // already watered — happy either way
      }
      plant.lastWatered = Date.now();
      plant.growth += WEIGHTS.water;
      if (!s.days[today]) {
        s.days[today] = emptyDay();
      }
      s.days[today].growth += WEIGHTS.water;
      s.totals.growth += WEIGHTS.water;
      gained = WEIGHTS.water;
    });
    void this.view?.webview.postMessage({ type: 'watered', name, gained });
  }

  /**
   * Replant a project as a different species. Cosmetic and reversible —
   * growth, stage, and history are untouched.
   */
  private setSpecies(name: string, species: string): void {
    const allowed: Species[] = [...PROJECT_SPECIES, ...SKILL_SPECIES];
    if (!allowed.includes(species as Species)) {
      return;
    }
    this.store.update((s) => {
      const plant = Object.values(s.projects).find((p) => p.name === name);
      if (plant) {
        plant.species = species as Species;
      }
    });
  }

  postState(): void {
    if (!this.view?.visible) {
      return;
    }
    void this.view.webview.postMessage({ type: 'state', model: buildViewModel(this.store.get()) });
  }

  private html(webview: vscode.Webview): string {
    const css = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'garden.css'));
    const js = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'garden.js'));
    const nonce = Array.from({ length: 24 }, () =>
      'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.charAt(Math.floor(Math.random() * 62))
    ).join('');
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy"
  content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} data:;">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link href="${css}" rel="stylesheet">
<title>Developer Garden</title>
</head>
<body>
  <nav id="tabs" role="tablist">
    <button data-tab="garden" class="active" role="tab">Garden</button>
    <button data-tab="skills" role="tab">Skills</button>
    <button data-tab="journey" role="tab">Journey</button>
    <button data-tab="today" role="tab">Today</button>
  </nav>
  <main id="root" aria-live="polite"><p class="muted">Tending the soil…</p></main>
  <script nonce="${nonce}" src="${js}"></script>
</body>
</html>`;
  }

  dispose(): void {
    this.disposables.forEach((d) => d.dispose());
  }
}

// ----------------------------------------------------------- view model

export function buildViewModel(state: GardenState) {
  const now = Date.now();
  const dormantCutoff = now - DORMANT_AFTER_DAYS * 86400000;

  const projects = Object.values(state.projects)
    .sort((a, b) => a.firstSeen - b.firstSeen)
    .map((p) => ({
      name: p.name,
      species: p.species,
      stage: stageFor(p.growth),
      growth: p.growth,
      dormant: p.lastActive < dormantCutoff,
      firstSeen: p.firstSeen,
      lastActive: p.lastActive,
      minutes: p.totalMinutes,
      commits: p.totalCommits,
      wateredToday: p.lastWatered ? dayKey(new Date(p.lastWatered)) === dayKey() : false
    }));

  const skills = Object.values(state.skills)
    .sort((a, b) => b.growth - a.growth)
    .map((s) => ({
      name: s.name,
      species: s.species,
      stage: stageFor(s.growth),
      growth: s.growth,
      dormant: s.lastActive < dormantCutoff,
      minutes: s.totalMinutes
    }));

  const achievements = ACHIEVEMENTS.map((a) => ({
    ...a,
    unlockedAt: state.achievements[a.id] ?? 0
  }));

  const wildlife = WILDLIFE.map((w) => ({
    ...w,
    unlockedAt: state.wildlife[w.id] ?? 0
  }));

  // Career timeline: projects grouped by the year they were first planted.
  const byYear = new Map<number, string[]>();
  for (const p of projects) {
    const y = new Date(p.firstSeen).getFullYear();
    byYear.set(y, [...(byYear.get(y) ?? []), p.name]);
  }
  const timeline = [...byYear.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([year, names]) => ({ year, names }));

  const anyRecent = projects.some((p) => now - p.lastActive < 86400000);

  return {
    projects,
    skills,
    achievements,
    wildlife,
    timeline,
    daily: dailySummary(state),
    weekly: weeklySummary(state),
    streak: currentStreak(state),
    totals: state.totals,
    mood: anyRecent ? 'day' : 'dusk',
    returning: projects.length > 0 && projects.every((p) => p.dormant)
  };
}
