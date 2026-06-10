// The growth engine. Listens to lightweight editor/git/task signals and turns
// them into growth points using the weighted system from the spec.
//
// Design rules enforced here:
//  - presence over output: a debugging hour earns the same as a writing hour
//  - rate limits everywhere: keystrokes and save-spam cannot farm growth
//  - additive only: nothing in this file can ever reduce a number

import * as vscode from 'vscode';
import * as path from 'path';
import {
  DAILY_CAPS,
  DayLog,
  GardenState,
  PROJECT_SPECIES,
  SKILL_SPECIES,
  WEIGHTS,
  dayKey,
  emptyDay,
  hashString,
  stageFor
} from './types';
import { Store } from './store';
import { SkillDetector } from './skills';
import { evaluateUnlocks } from './achievements';

interface GitAPI {
  repositories: GitRepository[];
  onDidOpenRepository: vscode.Event<GitRepository>;
}
interface GitRepository {
  rootUri: vscode.Uri;
  state: {
    HEAD?: { commit?: string; name?: string };
    onDidChange: vscode.Event<void>;
  };
}

const HEARTBEAT_MS = 60_000; // one tick per minute
const ACTIVE_WINDOW_MS = 2 * 60_000; // activity within 2 min => an active minute
const SAVE_COOLDOWN_MS = 30_000; // saves closer together than this count once

export class GrowthEngine implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];
  private lastActivityAt = 0;
  private lastSaveAt = 0;
  private heartbeat: NodeJS.Timeout | undefined;
  private activeSkills = new Set<string>();
  private filesToday = new Map<string, Set<string>>(); // dayKey -> file paths (counted, never stored)
  private seenCommits = new Map<string, string>(); // repo root -> last HEAD commit
  private readonly _onUnlock = new vscode.EventEmitter<string[]>();
  readonly onUnlock = this._onUnlock.event;

  constructor(private store: Store, private skills: SkillDetector) {
    this.watchEditor();
    this.watchGit();
    this.watchTasks();
    this.registerWorkspaces();
    this.heartbeat = setInterval(() => this.tick(), HEARTBEAT_MS);
  }

  // ---------------------------------------------------------------- editor

  private watchEditor(): void {
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (e.document.uri.scheme !== 'file' || e.contentChanges.length === 0) {
          return;
        }
        this.lastActivityAt = Date.now();
        void this.noteDocument(e.document);
      }),
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor?.document.uri.scheme === 'file') {
          this.lastActivityAt = Date.now();
          void this.noteDocument(editor.document);
        }
      }),
      vscode.window.onDidChangeTextEditorSelection(() => {
        // Reading and debugging are work too. Presence, not keystrokes.
        this.lastActivityAt = Date.now();
      }),
      vscode.workspace.onDidSaveTextDocument((doc) => {
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
          if (day.saves >= DAILY_CAPS.saves) {
            return 0;
          }
          day.saves++;
          return WEIGHTS.save;
        });
      })
    );
  }

  private async noteDocument(doc: vscode.TextDocument): Promise<void> {
    // Track which skills are "in play" for the current active minute.
    const found = await this.skills.skillsForDocument(doc);
    this.activeSkills = new Set(found);

    const key = dayKey();
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
        this.day(s).filesTouched = files!.size;
      });
    }
  }

  // ------------------------------------------------------------------- git

  private async watchGit(): Promise<void> {
    try {
      const ext = vscode.extensions.getExtension<{ getAPI(v: number): GitAPI }>('vscode.git');
      if (!ext) {
        return;
      }
      const git = (await ext.activate()).getAPI(1);
      const hook = (repo: GitRepository) => {
        this.seenCommits.set(repo.rootUri.fsPath, repo.state.HEAD?.commit ?? '');
        this.disposables.push(
          repo.state.onDidChange(() => this.onRepoChange(repo))
        );
      };
      git.repositories.forEach(hook);
      this.disposables.push(git.onDidOpenRepository(hook));
    } catch {
      // Git extension unavailable — the garden still grows from time & saves.
    }
  }

  private onRepoChange(repo: GitRepository): void {
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
    this.awardToProject(
      repo.rootUri,
      (day, state) => {
        day.commits++;
        state.totals.commits++;
        return WEIGHTS.commit;
      },
      true
    );
  }

  // ----------------------------------------------------------------- tasks

  private watchTasks(): void {
    this.disposables.push(
      vscode.tasks.onDidEndTaskProcess((e) => {
        if (e.exitCode !== 0) {
          return; // failed runs are simply ignored — never punished
        }
        const isTest = e.execution.task.group === vscode.TaskGroup.Test;
        const folder = e.execution.task.scope;
        const uri =
          folder && typeof folder === 'object' && 'uri' in folder
            ? (folder as vscode.WorkspaceFolder).uri
            : vscode.workspace.workspaceFolders?.[0]?.uri;
        if (!uri) {
          return;
        }
        this.awardToProject(uri, (day, state) => {
          if (isTest) {
            if (day.tests >= DAILY_CAPS.testPasses) {
              return 0;
            }
            day.tests++;
            return WEIGHTS.testPass;
          }
          if (day.tasks >= DAILY_CAPS.taskCompletes) {
            return 0;
          }
          day.tasks++;
          return WEIGHTS.taskComplete;
        });
      })
    );
  }

  // ------------------------------------------------------------- heartbeat

  private tick(): void {
    const now = Date.now();
    if (now - this.lastActivityAt > ACTIVE_WINDOW_MS) {
      return; // user is away; the garden simply rests
    }
    const editor = vscode.window.activeTextEditor;
    const uri = editor?.document.uri.scheme === 'file' ? editor.document.uri : undefined;
    const skillsNow = [...this.activeSkills];

    this.store.update((s) => {
      const day = this.day(s);
      if (day.minutes >= DAILY_CAPS.activeMinutes) {
        return;
      }
      day.minutes++;
      let points = WEIGHTS.activeMinute;

      const project = uri ? this.ensureProject(s, uri) : undefined;
      if (project) {
        project.totalMinutes++;
        project.lastActive = now;
        project.growth += WEIGHTS.activeMinute;
      }
      for (const name of skillsNow) {
        const skill = this.ensureSkill(s, name);
        skill.totalMinutes++;
        skill.lastActive = now;
        skill.growth += WEIGHTS.activeMinute;
      }

      // Consistency bonus: once per day, when 3+ of the trailing 7 days were active.
      this.markActiveDay(s);
      if (!day.consistencyBonusGranted && this.recentActiveDays(s, 7) >= 3) {
        day.consistencyBonusGranted = true;
        points += WEIGHTS.consistencyBonus;
        day.milestones.push('Consistency bonus — steady work this week');
      }

      day.growth += points;
      s.totals.growth += points;
      this.checkUnlocks(s);
    });
  }

  // --------------------------------------------------------------- helpers

  private day(s: GardenState): DayLog {
    const key = dayKey();
    if (!s.days[key]) {
      s.days[key] = emptyDay();
    }
    return s.days[key];
  }

  private markActiveDay(s: GardenState): void {
    const key = dayKey();
    if (!s.totals.activeDays.includes(key)) {
      s.totals.activeDays.push(key);
    }
  }

  private recentActiveDays(s: GardenState, windowDays: number): number {
    const set = new Set(s.totals.activeDays);
    let count = 0;
    const cursor = new Date();
    for (let i = 0; i < windowDays; i++) {
      if (set.has(dayKey(cursor))) {
        count++;
      }
      cursor.setDate(cursor.getDate() - 1);
    }
    return count;
  }

  private ensureProject(s: GardenState, fileUri: vscode.Uri) {
    const folder = vscode.workspace.getWorkspaceFolder(fileUri);
    if (!folder) {
      return undefined;
    }
    const id = `p:${hashString(folder.uri.fsPath).toString(36)}`;
    if (!s.projects[id]) {
      s.projects[id] = {
        id,
        name: folder.name || path.basename(folder.uri.fsPath),
        fsPath: folder.uri.fsPath,
        species: PROJECT_SPECIES[hashString(folder.name) % PROJECT_SPECIES.length],
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

  private ensureSkill(s: GardenState, name: string) {
    const id = `s:${hashString(name).toString(36)}`;
    if (!s.skills[id]) {
      s.skills[id] = {
        id,
        name,
        species: SKILL_SPECIES[hashString(name) % SKILL_SPECIES.length],
        growth: 0,
        firstSeen: Date.now(),
        lastActive: Date.now(),
        totalMinutes: 0
      };
    }
    return s.skills[id];
  }

  /** Award points tied to a specific file's project (and today's log). */
  private award(uri: vscode.Uri, fn: (day: DayLog) => number): void {
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
  private awardToProject(
    rootUri: vscode.Uri,
    fn: (day: DayLog, state: GardenState) => number,
    isCommit = false
  ): void {
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

  private checkUnlocks(s: GardenState): void {
    const anyMature =
      Object.values(s.projects).some((p) => stageFor(p.growth) === 'mature') ||
      Object.values(s.skills).some((p) => stageFor(p.growth) === 'mature');
    const unlocked = evaluateUnlocks(s, anyMature);
    if (unlocked.length) {
      this.day(s).milestones.push(...unlocked);
      this._onUnlock.fire(unlocked);
    }
  }

  /** Register all currently open workspace folders so seeds appear immediately. */
  private registerWorkspaces(): void {
    const plant = (folders: readonly vscode.WorkspaceFolder[] | undefined) => {
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
    this.disposables.push(
      vscode.workspace.onDidChangeWorkspaceFolders((e) => plant(e.added))
    );
  }

  dispose(): void {
    if (this.heartbeat) {
      clearInterval(this.heartbeat);
    }
    this.disposables.forEach((d) => d.dispose());
    this._onUnlock.dispose();
  }
}
