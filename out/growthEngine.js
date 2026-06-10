"use strict";
// The growth engine. Listens to lightweight editor/git/task signals and turns
// them into growth points using the weighted system from the spec.
//
// Design rules enforced here:
//  - presence over output: a debugging hour earns the same as a writing hour
//  - rate limits everywhere: keystrokes and save-spam cannot farm growth
//  - additive only: nothing in this file can ever reduce a number
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
exports.GrowthEngine = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const types_1 = require("./types");
const achievements_1 = require("./achievements");
const HEARTBEAT_MS = 60_000; // one tick per minute
const ACTIVE_WINDOW_MS = 2 * 60_000; // activity within 2 min => an active minute
const SAVE_COOLDOWN_MS = 30_000; // saves closer together than this count once
class GrowthEngine {
    constructor(store, skills) {
        this.store = store;
        this.skills = skills;
        this.disposables = [];
        this.lastActivityAt = 0;
        this.lastSaveAt = 0;
        this.activeSkills = new Set();
        this.filesToday = new Map(); // dayKey -> file paths (counted, never stored)
        this.seenCommits = new Map(); // repo root -> last HEAD commit
        this._onUnlock = new vscode.EventEmitter();
        this.onUnlock = this._onUnlock.event;
        this.watchEditor();
        this.watchGit();
        this.watchTasks();
        this.registerWorkspaces();
        this.heartbeat = setInterval(() => this.tick(), HEARTBEAT_MS);
    }
    // ---------------------------------------------------------------- editor
    watchEditor() {
        this.disposables.push(vscode.workspace.onDidChangeTextDocument((e) => {
            if (e.document.uri.scheme !== 'file' || e.contentChanges.length === 0) {
                return;
            }
            this.lastActivityAt = Date.now();
            void this.noteDocument(e.document);
        }), vscode.window.onDidChangeActiveTextEditor((editor) => {
            if (editor?.document.uri.scheme === 'file') {
                this.lastActivityAt = Date.now();
                void this.noteDocument(editor.document);
            }
        }), vscode.window.onDidChangeTextEditorSelection(() => {
            // Reading and debugging are work too. Presence, not keystrokes.
            this.lastActivityAt = Date.now();
        }), vscode.workspace.onDidSaveTextDocument((doc) => {
            if (doc.uri.scheme !== 'file') {
                return;
            }
            const now = Date.now();
            this.lastActivityAt = now;
            if (now - this.lastSaveAt < SAVE_COOLDOWN_MS) {
                return; // save-spam guard
            }
            this.lastSaveAt = now;
            this.award(doc.uri, (day) => {
                if (day.saves >= types_1.DAILY_CAPS.saves) {
                    return 0;
                }
                day.saves++;
                return types_1.WEIGHTS.save;
            });
        }));
    }
    async noteDocument(doc) {
        // Track which skills are "in play" for the current active minute.
        const found = await this.skills.skillsForDocument(doc);
        this.activeSkills = new Set(found);
        const key = (0, types_1.dayKey)();
        let files = this.filesToday.get(key);
        if (!files) {
            files = new Set();
            this.filesToday.set(key, files);
            // Keep only today's set in memory.
            for (const k of this.filesToday.keys()) {
                if (k !== key) {
                    this.filesToday.delete(k);
                }
            }
        }
        if (!files.has(doc.uri.fsPath)) {
            files.add(doc.uri.fsPath);
            this.store.update((s) => {
                this.day(s).filesTouched = files.size;
            });
        }
    }
    // ------------------------------------------------------------------- git
    async watchGit() {
        try {
            const ext = vscode.extensions.getExtension('vscode.git');
            if (!ext) {
                return;
            }
            const git = (await ext.activate()).getAPI(1);
            const hook = (repo) => {
                this.seenCommits.set(repo.rootUri.fsPath, repo.state.HEAD?.commit ?? '');
                this.disposables.push(repo.state.onDidChange(() => this.onRepoChange(repo)));
            };
            git.repositories.forEach(hook);
            this.disposables.push(git.onDidOpenRepository(hook));
        }
        catch {
            // Git extension unavailable — the garden still grows from time & saves.
        }
    }
    onRepoChange(repo) {
        const root = repo.rootUri.fsPath;
        const head = repo.state.HEAD?.commit ?? '';
        const prev = this.seenCommits.get(root) ?? '';
        if (!head || head === prev) {
            return;
        }
        this.seenCommits.set(root, head);
        if (!prev) {
            return; // first observation, not a new commit
        }
        // Heuristic: a HEAD change while the user is working counts as a commit.
        // Branch switches also land here; that is acceptable noise and is bounded
        // by how often a human can actually switch branches.
        this.awardToProject(repo.rootUri, (day, state) => {
            day.commits++;
            state.totals.commits++;
            return types_1.WEIGHTS.commit;
        }, true);
    }
    // ----------------------------------------------------------------- tasks
    watchTasks() {
        this.disposables.push(vscode.tasks.onDidEndTaskProcess((e) => {
            if (e.exitCode !== 0) {
                return; // failed runs are simply ignored — never punished
            }
            const isTest = e.execution.task.group === vscode.TaskGroup.Test;
            const folder = e.execution.task.scope;
            const uri = folder && typeof folder === 'object' && 'uri' in folder
                ? folder.uri
                : vscode.workspace.workspaceFolders?.[0]?.uri;
            if (!uri) {
                return;
            }
            this.awardToProject(uri, (day, state) => {
                if (isTest) {
                    if (day.tests >= types_1.DAILY_CAPS.testPasses) {
                        return 0;
                    }
                    day.tests++;
                    return types_1.WEIGHTS.testPass;
                }
                if (day.tasks >= types_1.DAILY_CAPS.taskCompletes) {
                    return 0;
                }
                day.tasks++;
                return types_1.WEIGHTS.taskComplete;
            });
        }));
    }
    // ------------------------------------------------------------- heartbeat
    tick() {
        const now = Date.now();
        if (now - this.lastActivityAt > ACTIVE_WINDOW_MS) {
            return; // user is away; the garden simply rests
        }
        const editor = vscode.window.activeTextEditor;
        const uri = editor?.document.uri.scheme === 'file' ? editor.document.uri : undefined;
        const skillsNow = [...this.activeSkills];
        this.store.update((s) => {
            const day = this.day(s);
            if (day.minutes >= types_1.DAILY_CAPS.activeMinutes) {
                return;
            }
            day.minutes++;
            let points = types_1.WEIGHTS.activeMinute;
            const project = uri ? this.ensureProject(s, uri) : undefined;
            if (project) {
                project.totalMinutes++;
                project.lastActive = now;
                project.growth += types_1.WEIGHTS.activeMinute;
            }
            for (const name of skillsNow) {
                const skill = this.ensureSkill(s, name);
                skill.totalMinutes++;
                skill.lastActive = now;
                skill.growth += types_1.WEIGHTS.activeMinute;
            }
            // Consistency bonus: once per day, when 3+ of the trailing 7 days were active.
            this.markActiveDay(s);
            if (!day.consistencyBonusGranted && this.recentActiveDays(s, 7) >= 3) {
                day.consistencyBonusGranted = true;
                points += types_1.WEIGHTS.consistencyBonus;
                day.milestones.push('Consistency bonus — steady work this week');
            }
            day.growth += points;
            s.totals.growth += points;
            this.checkUnlocks(s);
        });
    }
    // --------------------------------------------------------------- helpers
    day(s) {
        const key = (0, types_1.dayKey)();
        if (!s.days[key]) {
            s.days[key] = (0, types_1.emptyDay)();
        }
        return s.days[key];
    }
    markActiveDay(s) {
        const key = (0, types_1.dayKey)();
        if (!s.totals.activeDays.includes(key)) {
            s.totals.activeDays.push(key);
        }
    }
    recentActiveDays(s, windowDays) {
        const set = new Set(s.totals.activeDays);
        let count = 0;
        const cursor = new Date();
        for (let i = 0; i < windowDays; i++) {
            if (set.has((0, types_1.dayKey)(cursor))) {
                count++;
            }
            cursor.setDate(cursor.getDate() - 1);
        }
        return count;
    }
    ensureProject(s, fileUri) {
        const folder = vscode.workspace.getWorkspaceFolder(fileUri);
        if (!folder) {
            return undefined;
        }
        const id = `p:${(0, types_1.hashString)(folder.uri.fsPath).toString(36)}`;
        if (!s.projects[id]) {
            s.projects[id] = {
                id,
                name: folder.name || path.basename(folder.uri.fsPath),
                fsPath: folder.uri.fsPath,
                species: types_1.PROJECT_SPECIES[(0, types_1.hashString)(folder.name) % types_1.PROJECT_SPECIES.length],
                growth: 0,
                firstSeen: Date.now(),
                lastActive: Date.now(),
                totalMinutes: 0,
                totalCommits: 0
            };
            this.day(s).milestones.push(`New seed planted: ${s.projects[id].name}`);
        }
        return s.projects[id];
    }
    ensureSkill(s, name) {
        const id = `s:${(0, types_1.hashString)(name).toString(36)}`;
        if (!s.skills[id]) {
            s.skills[id] = {
                id,
                name,
                species: types_1.SKILL_SPECIES[(0, types_1.hashString)(name) % types_1.SKILL_SPECIES.length],
                growth: 0,
                firstSeen: Date.now(),
                lastActive: Date.now(),
                totalMinutes: 0
            };
        }
        return s.skills[id];
    }
    /** Award points tied to a specific file's project (and today's log). */
    award(uri, fn) {
        this.store.update((s) => {
            const day = this.day(s);
            const points = fn(day);
            if (points <= 0) {
                return;
            }
            const project = this.ensureProject(s, uri);
            if (project) {
                project.growth += points;
                project.lastActive = Date.now();
            }
            day.growth += points;
            s.totals.growth += points;
            this.markActiveDay(s);
            this.checkUnlocks(s);
        });
    }
    /** Award points to the project at a workspace root (git/tasks). */
    awardToProject(rootUri, fn, isCommit = false) {
        this.store.update((s) => {
            const day = this.day(s);
            const points = fn(day, s);
            if (points <= 0) {
                return;
            }
            const project = this.ensureProject(s, vscode.Uri.joinPath(rootUri, 'x'));
            if (project) {
                project.growth += points;
                if (isCommit) {
                    project.totalCommits++;
                }
                project.lastActive = Date.now();
            }
            day.growth += points;
            s.totals.growth += points;
            this.markActiveDay(s);
            this.checkUnlocks(s);
        });
    }
    checkUnlocks(s) {
        const anyMature = Object.values(s.projects).some((p) => (0, types_1.stageFor)(p.growth) === 'mature') ||
            Object.values(s.skills).some((p) => (0, types_1.stageFor)(p.growth) === 'mature');
        const unlocked = (0, achievements_1.evaluateUnlocks)(s, anyMature);
        if (unlocked.length) {
            this.day(s).milestones.push(...unlocked);
            this._onUnlock.fire(unlocked);
        }
    }
    /** Register all currently open workspace folders so seeds appear immediately. */
    registerWorkspaces() {
        const plant = (folders) => {
            if (!folders?.length) {
                return;
            }
            this.store.update((s) => {
                for (const f of folders) {
                    this.ensureProject(s, vscode.Uri.joinPath(f.uri, 'x'));
                }
                this.checkUnlocks(s);
            });
        };
        plant(vscode.workspace.workspaceFolders);
        this.disposables.push(vscode.workspace.onDidChangeWorkspaceFolders((e) => plant(e.added)));
    }
    dispose() {
        if (this.heartbeat) {
            clearInterval(this.heartbeat);
        }
        this.disposables.forEach((d) => d.dispose());
        this._onUnlock.dispose();
    }
}
exports.GrowthEngine = GrowthEngine;
//# sourceMappingURL=growthEngine.js.map