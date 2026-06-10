// Persistence: one JSON file in VS Code's global storage directory.
// Everything stays on the user's machine. Nothing is transmitted, ever.

import * as vscode from 'vscode';
import { GardenState, STATE_VERSION, emptyState } from './types';

const FILE_NAME = 'garden.json';

export class Store {
  private state: GardenState;
  private fileUri: vscode.Uri;
  private saveTimer: NodeJS.Timeout | undefined;
  private readonly _onDidChange = new vscode.EventEmitter<GardenState>();
  readonly onDidChange = this._onDidChange.event;

  private constructor(private context: vscode.ExtensionContext, state: GardenState) {
    this.state = state;
    this.fileUri = vscode.Uri.joinPath(context.globalStorageUri, FILE_NAME);
  }

  static async load(context: vscode.ExtensionContext): Promise<Store> {
    const fileUri = vscode.Uri.joinPath(context.globalStorageUri, FILE_NAME);
    let state = emptyState();
    try {
      const bytes = await vscode.workspace.fs.readFile(fileUri);
      const parsed = JSON.parse(Buffer.from(bytes).toString('utf8')) as GardenState;
      if (parsed && typeof parsed === 'object' && parsed.version <= STATE_VERSION) {
        state = { ...emptyState(), ...parsed, version: STATE_VERSION };
      }
    } catch {
      // First run (or unreadable file) — start a fresh garden, never crash.
    }
    return new Store(context, state);
  }

  get(): GardenState {
    return this.state;
  }

  /** Mutate state inside fn, then schedule a debounced write + notify the view. */
  update(fn: (s: GardenState) => void): void {
    fn(this.state);
    this._onDidChange.fire(this.state);
    this.scheduleSave();
  }

  private scheduleSave(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }
    this.saveTimer = setTimeout(() => void this.flush(), 2000);
  }

  async flush(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = undefined;
    }
    try {
      await vscode.workspace.fs.createDirectory(this.context.globalStorageUri);
      const json = JSON.stringify(this.state);
      await vscode.workspace.fs.writeFile(this.fileUri, Buffer.from(json, 'utf8'));
    } catch (err) {
      console.error('[developer-garden] failed to save garden state', err);
    }
  }

  async exportTo(target: vscode.Uri): Promise<void> {
    const json = JSON.stringify(this.state, null, 2);
    await vscode.workspace.fs.writeFile(target, Buffer.from(json, 'utf8'));
  }

  dispose(): void {
    void this.flush();
    this._onDidChange.dispose();
  }
}
