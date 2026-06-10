"use strict";
// Sidebar webview host. The extension side stays thin: it builds a small
// view-model from state and posts it; all drawing happens in media/garden.js.
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.GardenViewProvider = void 0;
exports.buildViewModel = buildViewModel;
const vscode = __importStar(require("vscode"));
const types_1 = require("./types");
const achievements_1 = require("./achievements");
const summaries_1 = require("./summaries");
class GardenViewProvider {
    constructor(extensionUri, store) {
        this.extensionUri = extensionUri;
        this.store = store;
        this.disposables = [];
        this.disposables.push(store.onDidChange(() => this.postState()));
    }
    resolveWebviewView(view) {
        this.view = view;
        view.webview.options = {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'media')]
        };
        view.webview.html = this.html(view.webview);
        view.webview.onDidReceiveMessage((msg) => {
            if (msg?.type === 'ready') {
                this.postState();
            }
            else if (msg?.type === 'water' && typeof msg.name === 'string') {
                this.water(msg.name);
            }
            else if (msg?.type === 'species' && typeof msg.name === 'string' && typeof msg.species === 'string') {
                this.setSpecies(msg.name, msg.species);
            }
        });
        view.onDidChangeVisibility(() => {
            if (view.visible) {
                this.postState();
            }
        });
    }
    reveal() {
        if (this.view) {
            this.view.show?.(true);
        }
        else {
            void vscode.commands.executeCommand('developerGarden.gardenView.focus');
        }
    }
    /**
     * Optional play interaction. Watering is never required and never expires;
     * it grants a tiny care point once per plant per local day. Watering an
     * already-watered plant does nothing negative — it is simply already happy.
     */
    water(name) {
        let gained = 0;
        this.store.update((s) => {
            const plant = Object.values(s.projects).find((p) => p.name === name);
            if (!plant) {
                return;
            }
            const today = (0, types_1.dayKey)();
            const last = plant.lastWatered ? (0, types_1.dayKey)(new Date(plant.lastWatered)) : '';
            if (last === today) {
                return; // already watered — happy either way
            }
            plant.lastWatered = Date.now();
            plant.growth += types_1.WEIGHTS.water;
            if (!s.days[today]) {
                s.days[today] = (0, types_1.emptyDay)();
            }
            s.days[today].growth += types_1.WEIGHTS.water;
            s.totals.growth += types_1.WEIGHTS.water;
            gained = types_1.WEIGHTS.water;
        });
        void this.view?.webview.postMessage({ type: 'watered', name, gained });
    }
    /**
     * Replant a project as a different species. Cosmetic and reversible —
     * growth, stage, and history are untouched.
     */
    setSpecies(name, species) {
        const allowed = [...types_1.PROJECT_SPECIES, ...types_1.SKILL_SPECIES];
        if (!allowed.includes(species)) {
            return;
        }
        this.store.update((s) => {
            const plant = Object.values(s.projects).find((p) => p.name === name);
            if (plant) {
                plant.species = species;
            }
        });
    }
    postState() {
        if (!this.view?.visible) {
            return;
        }
        void this.view.webview.postMessage({ type: 'state', model: buildViewModel(this.store.get()) });
    }
    html(webview) {
        const css = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'garden.css'));
        const js = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'garden.js'));
        const nonce = Array.from({ length: 24 }, () => 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.charAt(Math.floor(Math.random() * 62))).join('');
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
    dispose() {
        this.disposables.forEach((d) => d.dispose());
    }
}
exports.GardenViewProvider = GardenViewProvider;
GardenViewProvider.viewType = 'developerGarden.gardenView';
// ----------------------------------------------------------- view model
function buildViewModel(state) {
    const now = Date.now();
    const dormantCutoff = now - types_1.DORMANT_AFTER_DAYS * 86400000;
    const projects = Object.values(state.projects)
        .sort((a, b) => a.firstSeen - b.firstSeen)
        .map((p) => ({
        name: p.name,
        species: p.species,
        stage: (0, types_1.stageFor)(p.growth),
        growth: p.growth,
        dormant: p.lastActive < dormantCutoff,
        firstSeen: p.firstSeen,
        lastActive: p.lastActive,
        minutes: p.totalMinutes,
        commits: p.totalCommits,
        wateredToday: p.lastWatered ? (0, types_1.dayKey)(new Date(p.lastWatered)) === (0, types_1.dayKey)() : false
    }));
    const skills = Object.values(state.skills)
        .sort((a, b) => b.growth - a.growth)
        .map((s) => ({
        name: s.name,
        species: s.species,
        stage: (0, types_1.stageFor)(s.growth),
        growth: s.growth,
        dormant: s.lastActive < dormantCutoff,
        minutes: s.totalMinutes
    }));
    const achievements = achievements_1.ACHIEVEMENTS.map((a) => ({
        ...a,
        unlockedAt: state.achievements[a.id] ?? 0
    }));
    const wildlife = achievements_1.WILDLIFE.map((w) => ({
        ...w,
        unlockedAt: state.wildlife[w.id] ?? 0
    }));
    // Career timeline: projects grouped by the year they were first planted.
    const byYear = new Map();
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
        daily: (0, summaries_1.dailySummary)(state),
        weekly: (0, summaries_1.weeklySummary)(state),
        streak: (0, achievements_1.currentStreak)(state),
        totals: state.totals,
        mood: anyRecent ? 'day' : 'dusk',
        returning: projects.length > 0 && projects.every((p) => p.dormant)
    };
}
//# sourceMappingURL=gardenView.js.map